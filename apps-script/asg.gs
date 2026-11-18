// ASG shared-workbook backend - Google Apps Script web app (replaces the old
// Vercel function). One workbook, one backend Google account; players never
// sign in with Google and no API key or service-account private key exists
// at all. The shared group password is checked on Vercel (api/asg-auth.js),
// which issues a short-lived HMAC token; this script verifies that token and
// does every spreadsheet read/write directly.
//
// Deploy: paste into a standalone Apps Script project under the backend
// Google account, set Script Properties ASG_SHEET_ID / ASG_TOKEN_KEY (the
// same random secret as the Vercel env var), deploy as web app (execute as:
// me, access: anyone). Details in docs/ASG-BACKEND-SETUP.md.
//
// The workbook is directly editable: every module is normal rows and cells.
//   Roster            A2:F  id | role | number | skill | name | page_url   (admin-only)
//   Stash             A2:F  id | type(group/item) | group | position | name | note
//   HQ                A2:B  category | value (0-15)
//   HQ Upgrades       A2:C  category | name | note                        (admin-only)
//   Future Upgrades   A2:A  one planned upgrade per row (no dash)
//   Assignment Cards  A2:F  id | kind(project/gig) | position | number | name | description
//   Assignment Slots  A2:E  key(card:slot) | card | slot | npc | role
//   Assignment History A2:H id | kind | number | name | description | result(success/failed) | completed_at | crew
//                     (append-only GM record of completed gigs/projects; created on
//                     first completion; never read by the players' page)
//
// Concurrency: every save runs under LockService - read, validate the shared
// invariants (an NPC holds at most one slot, capacities hold, cards exist),
// write - atomically. Hand edits in the spreadsheet and other players' saves
// appear in the next poll; every response carries the full fresh state.

var HQ_CATEGORIES = ['supplies', 'culture', 'technology', 'security'];
var TAB = {
  stash: 'Stash',
  hq: 'HQ',
  upgrades: 'HQ Upgrades',
  future: 'Future Upgrades',
  cards: 'Assignment Cards',
  slots: 'Assignment Slots',
  roster: 'Roster',
  history: 'Assignment History',
};
var HISTORY_HEADER = ['id', 'kind', 'number', 'name', 'description', 'result', 'completed_at', 'crew'];
var HISTORY_RESULTS = ['success', 'failed'];

// ── Small helpers (dual-compatible with node for the test suite) ──

function str(v) { return v === undefined || v === null ? '' : String(v); }
function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function b64urlNoPad(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

// Tokens are minted by api/asg-auth.js on Vercel after the scrypt password
// check: `<expirySeconds>.<nonce>.<hmac-sha256-base64url of body>`, signed
// with the shared ASG_TOKEN_KEY. This script only verifies and checks expiry.
function checkToken(token) {
  var key = PropertiesService.getScriptProperties().getProperty('ASG_TOKEN_KEY');
  if (!key || typeof token !== 'string') return false;
  var parts = token.split('.');
  if (parts.length !== 3) return false;
  var body = parts[0] + '.' + parts[1];
  var expected = b64urlNoPad(Utilities.computeHmacSha256Signature(body, key));
  if (expected !== parts[2]) return false;
  var exp = parseInt(parts[0], 10);
  return !isNaN(exp) && exp > Math.floor(Date.now() / 1000);
}

function sheetByName(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name);
  return sh;
}

function readTab(ss, name, cols) {
  var sh = sheetByName(ss, name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols).getValues();
}

// ── Row mapping (mirrors the frontend serializer) ──

function parseStash(rows) {
  var groups = [], byId = {};
  rows.forEach(function (r) {
    if (!str(r[0])) return;
    if (str(r[1]) === 'group') {
      var g = { id: str(r[0]), name: str(r[4]), position: num(r[3]), items: [] };
      groups.push(g); byId[g.id] = g;
    }
  });
  rows.forEach(function (r) {
    if (!str(r[0]) || str(r[1]) === 'group') return;
    var g = byId[str(r[2])];
    if (!g) return; // item pointing at a deleted group: drop rather than invent one
    g.items.push({ id: str(r[0]), name: str(r[4]), note: str(r[5]), position: num(r[3]) });
  });
  groups.sort(function (a, b) { return a.position - b.position; });
  return {
    groups: groups.map(function (g) {
      g.items.sort(function (a, b) { return a.position - b.position; });
      return { id: g.id, name: g.name, items: g.items.map(function (it) { return { id: it.id, name: it.name, note: it.note }; }) };
    })
  };
}

function parseHq(rows) {
  var hq = {};
  rows.forEach(function (r) {
    var cat = str(r[0]).toLowerCase();
    if (HQ_CATEGORIES.indexOf(cat) !== -1) hq[cat] = clamp(num(r[1]), 0, 15);
  });
  HQ_CATEGORIES.forEach(function (c) { if (hq[c] === undefined) hq[c] = 0; });
  return hq;
}

function parseUpgrades(rows) {
  var out = {};
  HQ_CATEGORIES.forEach(function (c) { out[c] = []; });
  rows.forEach(function (r) {
    var cat = str(r[0]).toLowerCase();
    if (HQ_CATEGORIES.indexOf(cat) !== -1 && str(r[1])) out[cat].push({ name: str(r[1]), note: str(r[2]) });
  });
  return out;
}

function parseFuture(rows) {
  return rows.map(function (r) { return str(r[0]); }).filter(function (l) { return l.trim() !== ''; })
    .map(function (l) { return '- ' + l.replace(/^-\s*/, ''); }).join('\n');
}

function futureLines(text) {
  return str(text).split('\n').map(function (l) { return l.replace(/^-\s*/, '').trim(); })
    .filter(function (l) { return l !== ''; });
}

function parseCards(rows) {
  return rows.filter(function (r) { return str(r[0]); }).map(function (r) {
    return {
      id: str(r[0]), kind: str(r[1]) === 'gig' ? 'gig' : 'project',
      position: num(r[2]), number: num(r[3]), name: str(r[4]), description: str(r[5]),
    };
  });
}

function parseSlotRows(rows) {
  return rows.filter(function (r) { return str(r[0]); }).map(function (r) {
    return { key: str(r[0]), card: str(r[1]), slot: num(r[2]), npc: str(r[3]), role: str(r[4]) };
  });
}

function buildAssignments(cards, slotRows) {
  var byCard = {};
  slotRows.forEach(function (s) { (byCard[s.card] = byCard[s.card] || {})[s.slot] = s; });
  var projects = [], gigs = [];
  cards.slice().sort(function (a, b) { return a.position - b.position; }).forEach(function (c) {
    var cap = c.kind === 'gig' ? 4 : 2;
    var slots = [];
    var mine = byCard[c.id] || {};
    for (var i = 0; i < cap; i++) {
      var s = mine[i];
      if (c.kind === 'gig') slots.push(s && (s.npc || s.role) ? { role: s.role || '', npc: s.npc || null } : null);
      else slots.push(s && s.npc ? s.npc : null);
    }
    var card = { id: c.id, number: c.number, name: c.name, description: c.description, slots: slots };
    (c.kind === 'gig' ? gigs : projects).push(card);
  });
  return { projects: projects, gigs: gigs };
}

function parseRoster(rows) {
  return rows.filter(function (r) { return str(r[0]); }).map(function (r) {
    var npc = { id: str(r[0]), role: str(r[1]), number: num(r[2]), skill: clamp(num(r[3]), 0, 3) };
    if (str(r[4])) npc.name = str(r[4]);
    if (str(r[5])) npc.pageUrl = str(r[5]);
    return npc;
  });
}

function loadState(ss) {
  var hqValues = parseHq(readTab(ss, TAB.hq, 2));
  var hq = { futureUpgrades: parseFuture(readTab(ss, TAB.future, 1)) };
  HQ_CATEGORIES.forEach(function (c) { hq[c] = { value: hqValues[c] }; });
  var cardRows = parseCards(readTab(ss, TAB.cards, 6));
  var slotRows = parseSlotRows(readTab(ss, TAB.slots, 5));
  var warnings = [];
  var cardById = {}, kinds = {};
  cardRows.forEach(function (c) { cardById[c.id] = true; kinds[c.id] = c.kind; });
  var orphans = 0, outOfRange = 0, seenSlot = {};
  slotRows.forEach(function (s) {
    if (!cardById[s.card]) { orphans++; return; }
    var cap = kinds[s.card] === 'gig' ? 4 : 2;
    var dupKey = s.card + ':' + s.slot;
    if (s.slot < 0 || s.slot >= cap || seenSlot[dupKey]) outOfRange++;
    seenSlot[dupKey] = true;
  });
  if (orphans) warnings.push(orphans + ' assignment row(s) point at deleted cards - clean them in the Assignment Slots tab');
  if (outOfRange) warnings.push(outOfRange + ' assignment row(s) have a duplicate or out-of-range slot - clean them in the Assignment Slots tab');
  var stashRows = readTab(ss, TAB.stash, 6);
  var groupIds = {};
  stashRows.forEach(function (r) { if (str(r[0]) && str(r[1]) === 'group') groupIds[str(r[0])] = true; });
  var orphanItems = 0;
  stashRows.forEach(function (r) {
    if (str(r[0]) && str(r[1]) !== 'group' && !groupIds[str(r[2])]) orphanItems++;
  });
  if (orphanItems) warnings.push(orphanItems + ' stash item(s) point at deleted groups - clean them in the Stash tab');
  var out = {
    state: {
      stash: parseStash(stashRows),
      hq: hq,
      assignments: buildAssignments(cardRows, slotRows),
    },
    roster: parseRoster(readTab(ss, TAB.roster, 6)),
    hqUpgrades: parseUpgrades(readTab(ss, TAB.upgrades, 3)),
  };
  if (warnings.length) out.warnings = warnings;
  // Capability flag: the page only offers Completed against a script that
  // records history, so an old deployment can never drop a card unrecorded.
  out.completionHistory = true;
  return out;
}

// A rejected save answers with the fresh shared state: the client reverts
// exactly the rejected rows and keeps the player's other pending edits.
function rejectWithState(ss, code, detail) {
  var fresh = loadState(ss);
  fresh.error = code;
  fresh.detail = detail;
  return fresh;
}

// ── Granular save under a real mutex ──

function saveOps(ss, ops) {
  // Read current state once; everything below is atomic under the lock.
  var stashRows = readTab(ss, TAB.stash, 6);
  var cardRowsNow = readTab(ss, TAB.cards, 6);
  var slotRowsNow = readTab(ss, TAB.slots, 5);

  var existingCards = {};
  cardRowsNow.forEach(function (r) { if (str(r[0])) existingCards[str(r[0])] = true; });
  (ops.cards && ops.cards.upserts || []).forEach(function (u) { existingCards[str(u.id)] = true; });
  (ops.cards && ops.cards.deletes || []).forEach(function (id) { delete existingCards[String(id)]; });

  // Project the slot table after the ops, then check the shared invariants
  // against the projection: an NPC holds at most one slot, cards exist,
  // capacities hold.
  var projected = {};
  slotRowsNow.forEach(function (r) {
    if (str(r[0])) projected[str(r[0])] = { card: str(r[1]), slot: num(r[2]), npc: str(r[3]), role: str(r[4]) };
  });
  (ops.slots && ops.slots.deletes || []).forEach(function (k) { delete projected[String(k)]; });
  var slotUpserts = (ops.slots && ops.slots.upserts || []);
  for (var uu = 0; uu < slotUpserts.length; uu++) {
    var su = slotUpserts[uu];
    // The row key is the address of the row: it must equal card:slot,
    // with a real non-negative integer slot index.
    var slotNum = num(su.slot);
    if (str(su.key) !== str(su.card) + ':' + slotNum || !isFinite(slotNum) || slotNum < 0 || Math.floor(slotNum) !== slotNum) {
      return rejectWithState(ss, 'invalid_ops', 'slot key must be card:slot');
    }
    projected[str(su.key)] = { card: str(su.card), slot: slotNum, npc: str(su.npc), role: str(su.role) };
  }
  var npcSeen = {}, slotCount = {};
  var keys = Object.keys(projected);
  for (var i = 0; i < keys.length; i++) {
    var s = projected[keys[i]];
    if (!s.npc && !s.role) continue; // an empty row occupies no slot
    if (!existingCards[s.card]) return rejectWithState(ss, 'invariant', 'assignment to a deleted card');
    if (s.npc) {
      if (npcSeen[s.npc]) return rejectWithState(ss, 'invariant', 'NPC already assigned elsewhere');
      npcSeen[s.npc] = true;
    }
    slotCount[s.card] = (slotCount[s.card] || 0) + 1;
  }
  var kinds = {};
  parseCards(cardRowsNow).forEach(function (c) { kinds[c.id] = c.kind; });
  (ops.cards && ops.cards.upserts || []).forEach(function (u) { kinds[str(u.id)] = u.kind === 'gig' ? 'gig' : 'project'; });
  var cardIds = Object.keys(slotCount);
  for (var j = 0; j < cardIds.length; j++) {
    var cap = kinds[cardIds[j]] === 'gig' ? 4 : 2;
    if (slotCount[cardIds[j]] > cap) return rejectWithState(ss, 'invariant', 'card is full');
  }

  // Completed gigs/projects: validate before any write. A completion must
  // remove its card in the same save, so a record never exists next to a
  // live card (and a card never vanishes unrecorded).
  var historyAppends = [];
  if (ops.history !== undefined) {
    var raw = ops.history && ops.history.appends;
    if (!Array.isArray(raw) || raw.length > 20) return rejectWithState(ss, 'invalid_ops', 'invalid history ops');
    for (var h = 0; h < raw.length; h++) {
      var a = raw[h] || {};
      var hid = str(a.id);
      if (!hid || (a.kind !== 'gig' && a.kind !== 'project') || HISTORY_RESULTS.indexOf(a.result) < 0) {
        return rejectWithState(ss, 'invalid_ops', 'history entry needs id, kind and result success|failed');
      }
      if (existingCards[hid]) return rejectWithState(ss, 'invalid_ops', 'a completed card must be removed in the same save');
      var crew = Array.isArray(a.crew) ? a.crew.map(function (c) { return str(c).slice(0, 120); }).join('; ') : str(a.crew);
      historyAppends.push([hid, a.kind, num(a.number), str(a.name).slice(0, 200), str(a.description).slice(0, 500), a.result, new Date().toISOString(), crew.slice(0, 1000)]);
    }
  }
  // History first: if anything fails after this point the card still
  // exists and a retry is deduplicated by card id.
  if (historyAppends.length) appendHistory(ss, historyAppends);

  if (ops.stash) applyTabOps(ss, TAB.stash, 6, stashRows, (ops.stash.deletes || []).map(String), (ops.stash.upserts || []).map(function (u) {
    return { id: str(u.id), cells: [str(u.id), u.type === 'group' ? 'group' : 'item', str(u.group), num(u.position), str(u.name), str(u.note)] };
  }));
  if (ops.cards) applyTabOps(ss, TAB.cards, 6, cardRowsNow, (ops.cards.deletes || []).map(String), (ops.cards.upserts || []).map(function (u) {
    return { id: str(u.id), cells: [str(u.id), u.kind === 'gig' ? 'gig' : 'project', num(u.position), num(u.number), str(u.name), str(u.description)] };
  }));
  if (ops.slots) applyTabOps(ss, TAB.slots, 5, slotRowsNow, (ops.slots.deletes || []).map(String), (ops.slots.upserts || []).map(function (u) {
    return { id: str(u.key), cells: [str(u.key), str(u.card), num(u.slot), str(u.npc), str(u.role)] };
  }));
  if (ops.hq) {
    var sh = sheetByName(ss, TAB.hq);
    var rows = readTab(ss, TAB.hq, 2);
    var rowByCat = {};
    rows.forEach(function (r, i) { rowByCat[str(r[0]).toLowerCase()] = i + 2; });
    var nextRow = rows.length + 2;
    HQ_CATEGORIES.forEach(function (cat) {
      if (ops.hq[cat] === undefined) return;
      var row = rowByCat[cat] || nextRow++;
      sh.getRange(row, 1, 1, 2).setValues([[cat, clamp(num(ops.hq[cat]), 0, 15)]]);
    });
  }
  if (ops.futureUpgrades !== undefined) {
    var lines = futureLines(ops.futureUpgrades);
    var fsh = sheetByName(ss, TAB.future);
    var old = readTab(ss, TAB.future, 1);
    var span = Math.max(old.length, lines.length);
    for (var k = 0; k < span; k++) fsh.getRange(k + 2, 1).setValue(lines[k] || '');
  }
  SpreadsheetApp.flush();
  return loadState(ss);
}

// Append-only GM record. The tab is created with its header on first use.
// A card id already recorded is skipped, so a retried save cannot duplicate.
function appendHistory(ss, rows) {
  var sh = ss.getSheetByName(TAB.history);
  if (!sh) {
    sh = ss.insertSheet(TAB.history);
    sh.getRange(1, 1, 1, HISTORY_HEADER.length).setValues([HISTORY_HEADER]);
  }
  var last = sh.getLastRow();
  var seen = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { if (str(r[0])) seen[str(r[0])] = true; });
  var next = Math.max(last, 1) + 1;
  rows.forEach(function (r) {
    if (seen[r[0]]) return;
    seen[r[0]] = true;
    sh.getRange(next++, 1, 1, r.length).setValues([r]);
  });
}

// Update the rows that changed, append new ones, blank deleted ones. Each
// save only touches the rows in the ops, so hand edits elsewhere in the tab
// are never disturbed.
function applyTabOps(ss, tabName, cols, currentRows, deletes, upserts) {
  var sh = sheetByName(ss, tabName);
  var rowById = {};
  currentRows.forEach(function (r, i) { if (str(r[0])) rowById[str(r[0])] = i + 2; });
  var nextRow = currentRows.length + 2;
  deletes.forEach(function (id) {
    var row = rowById[id];
    if (row) sh.getRange(row, 1, 1, cols).clearContent();
  });
  upserts.forEach(function (u) {
    var row = rowById[u.id] || nextRow++;
    sh.getRange(row, 1, 1, cols).setValues([u.cells]);
  });
}

// ── Web app entry points ──

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonOut({ ok: true, service: 'asg' });
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var sheetId = props.getProperty('ASG_SHEET_ID');
    if (!sheetId) return jsonOut({ error: 'unconfigured' });
    if (!checkToken(body.token)) return jsonOut({ error: 'bad_token' });
    var ss = SpreadsheetApp.openById(sheetId);
    if (body.action === 'load') {
      out = loadState(ss);
    } else if (body.action === 'save') {
      if (!body.ops || typeof body.ops !== 'object') return jsonOut({ error: 'invalid_ops' });
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        out = saveOps(ss, body.ops);
      } finally {
        lock.releaseLock();
      }
    } else {
      out = { error: 'unknown_action' };
    }
  } catch (err) {
    // Full detail stays in the script owner's execution log; clients get a
    // generic error so internals (paths, ids, stack fragments) never leak.
    try { Logger.log('ASG backend error: ' + (err && err.stack || err)); } catch (_) {}
    out = { error: 'backend_error', detail: 'unexpected backend error' };
  }
  return jsonOut(out);
}

// Node test harness (ignored by Apps Script).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { doPost: doPost, doGet: doGet, loadState: loadState, saveOps: saveOps, futureLines: futureLines, checkToken: checkToken };
}
