// ASG shared-workbook backend - Google Apps Script web app (replaces the old
// Vercel function). One workbook, one backend Google account; players never
// sign in with Google and no API key or service-account private key exists
// at all. The shared group password is checked on Vercel (api/asg-auth.js),
// which issues a short-lived HMAC token; this script verifies that token and
// does every spreadsheet read/write directly.
//
// File-only backend v1.3.2.0. Use appsscript.json and the private Picker setup.
// Deploy: paste into a standalone Apps Script project under the backend
// Google account, install the file-only manifest and private setup, and set
// Script Properties ASG_SHEET_ID / ASG_TOKEN_KEY (the
// same random secret as the Vercel env var), deploy as web app (execute as:
// me, access: anyone). Details in docs/ASG-BACKEND-SETUP.md.
//
// The workbook is directly editable: every module is normal rows and cells.
//   Roster            A2:F  id | role | number | skill | name | page_url   (admin-only)
//   Stash             A2:F  id | type(group/item) | group | position | name | note
//   HQ                A2:B  category | value (0-15)
//   HQ Upgrades       A2:E  category | name | note | id | position (after explicit migration)
//   Future Upgrades   A2:A  one planned upgrade per row (no dash)
//   Assignment Cards  A2:F  id | kind(project/gig) | position | number | name | description
//   Assignment Slots  A2:E  key(card:slot) | card | slot | npc | role
//   Assignment History A2:M id | kind | number | name | description | result(success/complications/failed/disaster; older rows success/failed) | completed_at | crew | status | roll | crew_bonus | difficulty | total
//                     (GM record of completed gigs/projects; created on first
//                     completion; never read by the players' page. status is
//                     'pending' while a completion is being applied and 'done'
//                     after; a blank status in older rows counts as done)
//
// Concurrency: snapshot reads and saves run under LockService.
// Granular API writes are batched; journal phases make completion recoverable.
// This lock serializes script requests, not direct human spreadsheet edits. Hand edits in the spreadsheet and other players' saves
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
var HISTORY_HEADER = ['id', 'kind', 'number', 'name', 'description', 'result', 'completed_at', 'crew', 'status', 'roll', 'crew_bonus', 'difficulty', 'total'];
var HISTORY_RESULTS = ['success', 'complications', 'failed', 'disaster'];

// d10 + crew skill total - difficulty: 10+ success, 7-9 success with
// complications, 4-6 failure, 3 or less disaster.
function outcomeForTotal(total) {
  if (total >= 10) return 'success';
  if (total >= 7) return 'complications';
  if (total >= 4) return 'failed';
  return 'disaster';
}
function intIn(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }

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

function upgradeSchemaReady(ss) {
  var sh = ss.getSheetByName(TAB.upgrades);
  if (!sh) return false;
  var header = sh.getRange(1, 1, 1, 5).getValues()[0];
  if (header.join('|') !== 'category|name|note|id|position') return false;
  var seen = Object.create(null);
  return readTab(ss, TAB.upgrades, 5).every(function (r) {
    if (!r.some(function (v) { return v !== ''; })) return true;
    var id = str(r[3]), pos = r[4];
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || seen[id] || HQ_CATEGORIES.indexOf(str(r[0])) < 0 ||
        typeof pos !== 'number' || !isFinite(pos) || pos < 0 || Math.floor(pos) !== pos) return false;
    seen[id] = true; return true;
  });
}

function parseUpgrades(rows, editable) {
  var out = {};
  HQ_CATEGORIES.forEach(function (c) { out[c] = []; });
  rows.forEach(function (r) {
    var cat = str(r[0]).toLowerCase();
    if (HQ_CATEGORIES.indexOf(cat) < 0 || (!str(r[1]) && !(editable && str(r[3])))) return;
    var upgrade = { name: str(r[1]), note: str(r[2]) };
    if (editable) { upgrade.id = str(r[3]); upgrade.position = r[4]; }
    out[cat].push(upgrade);
  });
  if (editable) HQ_CATEGORIES.forEach(function (cat) {
    out[cat].sort(function (a, b) { return a.position - b.position || a.id.localeCompare(b.id); });
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
    hqUpgrades: parseUpgrades(readTab(ss, TAB.upgrades, 5), upgradeSchemaReady(ss)),
    upgradeEditVersion: upgradeSchemaReady(ss) ? 1 : 0,
  };
  if (warnings.length) out.warnings = warnings;
  // Capability flag: the page only offers Completed against a script that
  // journals and recovers completions, so an older deployment can never drop
  // a card unrecorded or half-applied.
  out.completionVersion = 3;
  // Capability flag: the page only offers gig HISTORY against a script that
  // answers the history action, so an older deployment hides the button.
  out.historyVersion = 2;
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

// Upgrade IDs remain stable across rename/reorder; cross-category moves are rejected.
function validateUpgradeOps(rows, ops) {
  if (!ops || !Array.isArray(ops.upserts) || !Array.isArray(ops.deletes)) return 'invalid upgrade operations';
  var byId = Object.create(null), touched = Object.create(null);
  rows.forEach(function (r) { if (str(r[3])) byId[str(r[3])] = r; });
  for (var i = 0; i < ops.upserts.length; i++) {
    var u = ops.upserts[i];
    if (!u || !/^[a-zA-Z0-9_-]{1,100}$/.test(str(u.id)) || touched[u.id] ||
        HQ_CATEGORIES.indexOf(u.category) < 0 || typeof u.name !== 'string' || typeof u.note !== 'string' ||
        typeof u.position !== 'number' || !isFinite(u.position) || u.position < 0 || Math.floor(u.position) !== u.position) return 'invalid upgrade row';
    if (byId[u.id] && byId[u.id][0] !== u.category) return 'upgrade category cannot change';
    touched[u.id] = true;
  }
  for (var j = 0; j < ops.deletes.length; j++) {
    var id = ops.deletes[j];
    if (typeof id !== 'string' || touched[id]) return 'invalid upgrade deletion';
    // Missing IDs are already deleted: retries remain idempotent.
    if (byId[id] && str(byId[id][1]).trim()) return 'clear and save upgrade name before deleting';
    touched[id] = true;
  }
  return '';
}

function applyUpgradeOps(ss, rows, ops) {
  var sh = sheetByName(ss, TAB.upgrades), rowById = Object.create(null), free = [];
  rows.forEach(function (r, i) { if (str(r[3])) rowById[str(r[3])] = i + 2; else if (!r.some(function (v) { return v !== ''; })) free.push(i + 2); });
  (ops.deletes || []).forEach(function (id) { if (rowById[id]) sh.getRange(rowById[id], 1, 1, 5).clearContent(); });
  var next = rows.length + 2;
  (ops.upserts || []).forEach(function (u) {
    var row = rowById[u.id] || free.shift() || next++;
    sh.getRange(row, 1, 1, 5).setValues([[u.category, u.name, u.note, u.id, u.position]]);
  });
}

// ── Granular save under a real mutex ──

function saveOps(ss, ops) {
  var upgradeRows = readTab(ss, TAB.upgrades, 5);
  if (ops.upgrades !== undefined) {
    if (!upgradeSchemaReady(ss)) return rejectWithState(ss, 'invalid_ops', 'HQ upgrade migration required');
    var invalidUpgrade = validateUpgradeOps(upgradeRows, ops.upgrades);
    if (invalidUpgrade) return rejectWithState(ss, 'invalid_ops', invalidUpgrade);
  }
  // A completion interrupted by an earlier failure is rolled forward first.
  recoverPending(ss);
  // Read current state once; the script lock serializes callers. Sheets
  // writes are NOT transactional: completions are journaled and idempotent
  // (see completeCard) instead of relying on all-or-nothing writes.
  var stashRows = readTab(ss, TAB.stash, 6);
  var cardRowsNow = readTab(ss, TAB.cards, 6);
  var slotRowsNow = readTab(ss, TAB.slots, 5);

  var existingCards = {};
  cardRowsNow.forEach(function (r) { if (str(r[0])) existingCards[str(r[0])] = true; });
  (ops.cards && ops.cards.upserts || []).forEach(function (u) { existingCards[str(u.id)] = true; });
  (ops.cards && ops.cards.deletes || []).forEach(function (id) { delete existingCards[String(id)]; });
  // A completing card (and its slots) leaves the projection: the server
  // removes it itself, and no other op may assign into it.
  var completingId = ops.complete && ops.complete.id !== undefined ? str(ops.complete.id) : '';
  if (completingId) delete existingCards[completingId];

  // Project the slot table after the ops, then check the shared invariants
  // against the projection: an NPC holds at most one slot, cards exist,
  // capacities hold.
  var projected = {};
  slotRowsNow.forEach(function (r) {
    if (str(r[0])) projected[str(r[0])] = { card: str(r[1]), slot: num(r[2]), npc: str(r[3]), role: str(r[4]) };
  });
  if (completingId) Object.keys(projected).forEach(function (k) { if (projected[k].card === completingId) delete projected[k]; });
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

  // Completed gig/project: validate before any write. The server removes the
  // card itself, so other ops must not touch it.
  var completion = null;
  if (ops.complete !== undefined) {
    var cc = ops.complete || {};
    var cid = str(cc.id);
    if (!cid || (cc.kind !== 'gig' && cc.kind !== 'project') || HISTORY_RESULTS.indexOf(cc.result) < 0) {
      return rejectWithState(ss, 'invalid_ops', 'completion needs id, kind and result success|complications|failed|disaster');
    }
    if (!intIn(cc.roll, 1, 10) || !intIn(cc.bonus, 0, 12) || !intIn(cc.difficulty, 0, 5) ||
        cc.total !== cc.roll + cc.bonus - cc.difficulty || cc.result !== outcomeForTotal(cc.total)) {
      return rejectWithState(ss, 'invalid_ops', 'completion needs a consistent d10 roll, crew bonus, difficulty, total and result');
    }
    var hist = readHistory(ss);
    if (!cardRowsNow.some(function (r) { return str(r[0]) === cid; }) && !(hist && hist.byId[cid])) {
      return rejectWithState(ss, 'invalid_ops', 'completion for an unknown card');
    }
    var crew = Array.isArray(cc.crew) ? cc.crew.map(function (c) { return str(c).slice(0, 120); }).join('; ') : str(cc.crew);
    completion = { id: cid, kind: cc.kind, number: num(cc.number), name: str(cc.name).slice(0, 200), description: str(cc.description).slice(0, 500), result: cc.result, crew: crew.slice(0, 1000), roll: cc.roll, bonus: cc.bonus, difficulty: cc.difficulty, total: cc.total };
  }

  var completed = null;
  if (completion) completed = completeCard(ss, completion);

  if (ops.stash) applyTabOps(ss, TAB.stash, 6, stashRows, (ops.stash.deletes || []).map(String), (ops.stash.upserts || []).map(function (u) {
    return { id: str(u.id), cells: [str(u.id), u.type === 'group' ? 'group' : 'item', str(u.group), num(u.position), str(u.name), str(u.note)] };
  }));
  if (ops.cards) applyTabOps(ss, TAB.cards, 6, cardRowsNow, (ops.cards.deletes || []).map(String), (ops.cards.upserts || []).map(function (u) {
    return { id: str(u.id), cells: [str(u.id), u.kind === 'gig' ? 'gig' : 'project', num(u.position), num(u.number), str(u.name), str(u.description)] };
  }));
  if (ops.slots) applyTabOps(ss, TAB.slots, 5, slotRowsNow, (ops.slots.deletes || []).map(String), (ops.slots.upserts || []).map(function (u) {
    return { id: str(u.key), cells: [str(u.key), str(u.card), num(u.slot), str(u.npc), str(u.role)] };
  }));
  if (ops.upgrades) applyUpgradeOps(ss, upgradeRows, ops.upgrades);
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
  ss.flush();
  var fresh = loadState(ss);
  if (completed) fresh.completed = completed;
  return fresh;
}

// ── Completed gigs/projects (journaled, idempotent, roll-forward) ──
//
// Google Sheets writes are not transactional, so a completion is not
// all-or-nothing. It is a journal entry plus idempotent steps:
//   1. write the card's history row with status 'pending' (the intent),
//   2. clear the card's slot rows, then the card row,
//   3. mark the history row 'done'.
// If anything fails in between, the row stays 'pending' and the next load or
// save (recoverPending) finishes steps 2-3 from the journal, so the card
// ends up removed with its recorded result; a half-cleared card can be
// visible in the meantime. The card id is the operation id: replaying a
// completion is safe, and once a card is recorded the FIRST recorded result
// wins (a retry with another answer gets the recorded one back).

function readHistory(ss) {
  var sh = ss.getSheetByName(TAB.history);
  if (!sh) return null;
  var last = sh.getLastRow();
  var byId = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, HISTORY_HEADER.length).getValues().forEach(function (r, i) {
      if (!str(r[0])) return;
      byId[str(r[0])] = { row: i + 2, result: str(r[5]), status: str(r[8]) === 'pending' ? 'pending' : 'done', roll: rollParts(r) };
    });
  }
  return { sh: sh, byId: byId };
}

// The roll breakdown of a history row, or null for older rows without one.
function rollParts(r) {
  if (r[9] === '' || r[9] === undefined || r[9] === null) return null;
  return { roll: num(r[9]), bonus: num(r[10]), difficulty: num(r[11]), total: num(r[12]) };
}

function withRoll(out, parts) {
  if (parts) { out.roll = parts.roll; out.bonus = parts.bonus; out.difficulty = parts.difficulty; out.total = parts.total; }
  return out;
}

// Gig completion history for the page's HISTORY button: done rows only
// (pending rows are interrupted completions, not results), projected to
// exactly the three fields the panel shows. Newest completion first.
function readGigHistory(ss) {
  var sh = ss.getSheetByName(TAB.history);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HISTORY_HEADER.length).getValues()
    .filter(function (r) { return str(r[0]) && str(r[1]) === 'gig' && str(r[8]) !== 'pending'; })
    .reverse()
    .map(function (r) { return withRoll({ name: str(r[3]), description: str(r[4]), result: str(r[5]) }, rollParts(r)); });
}

function hasPending(ss) {
  var h = readHistory(ss);
  return !!h && Object.keys(h.byId).some(function (k) { return h.byId[k].status === 'pending'; });
}

// Idempotent: clears every slot row of the card, then the card row.
function finishCompletion(ss, id) {
  var slotSheet = sheetByName(ss, TAB.slots);
  readTab(ss, TAB.slots, 5).forEach(function (r, i) {
    if (str(r[1]) === id || str(r[0]).indexOf(id + ':') === 0) slotSheet.getRange(i + 2, 1, 1, 5).clearContent();
  });
  var cardSheet = sheetByName(ss, TAB.cards);
  readTab(ss, TAB.cards, 6).forEach(function (r, i) {
    if (str(r[0]) === id) cardSheet.getRange(i + 2, 1, 1, 6).clearContent();
  });
}

function markDone(sh, row) {
  sh.getRange(row, 7).setValue(new Date().toISOString());
  sh.getRange(row, 9).setValue('done');
}

function recoverPending(ss) {
  var h = readHistory(ss);
  if (!h) return;
  Object.keys(h.byId).forEach(function (id) {
    var e = h.byId[id];
    if (e.status !== 'pending') return;
    finishCompletion(ss, id);
    ss.flush(); // persist removals before marking the journal done
    markDone(h.sh, e.row);
    ss.flush();
  });
}

function completeCard(ss, c) {
  var h = readHistory(ss);
  var e = h && h.byId[c.id];
  if (e && e.status === 'done') {
    finishCompletion(ss, c.id); // harmless cleanup if a hand edit brought it back
    return withRoll({ id: c.id, result: e.result, status: 'done' }, e.roll);
  }
  var sh = h && h.sh;
  if (!sh) {
    sh = ss.insertSheet(TAB.history);
    sh.getRange(1, 1, 1, HISTORY_HEADER.length).setValues([HISTORY_HEADER]);
  } else {
    // A tab created before the d10 mechanic: label the new columns J:M.
    sh.getRange(1, 10, 1, 4).setValues([HISTORY_HEADER.slice(9)]);
  }
  var cells = [c.id, c.kind, c.number, c.name, c.description, c.result, '', c.crew, 'pending', c.roll, c.bonus, c.difficulty, c.total];
  var row = e ? e.row : Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(row, 1, 1, cells.length).setValues([cells]); // 1. journal the intent
  ss.flush(); // persist intent before removal; retries recover it
  finishCompletion(ss, c.id); // 2. remove slots, then card
  ss.flush(); // persist removals before closing the journal
  markDone(sh, row); // 3. close the journal entry
  ss.flush();
  return withRoll({ id: c.id, result: c.result, status: 'done' }, { roll: c.roll, bonus: c.bonus, difficulty: c.difficulty, total: c.total });
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

function doGet(e) {
  if (e && e.parameter && e.parameter.setup === '1') {
    requireSetupOwner_();
    return HtmlService.createHtmlOutputFromFile('Setup').setTitle('ASG private workbook setup');
  }
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
    if (body.action !== 'load' && body.action !== 'save' && body.action !== 'history') return jsonOut({ error: 'unknown_action' });
    if (body.action === 'save' && (!body.ops || typeof body.ops !== 'object')) return jsonOut({ error: 'invalid_ops' });
    // Read only after acquiring the mutex, so concurrent saves never stage
    // writes from a snapshot taken before the preceding save committed.
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = openAsgWorkbook_(sheetId);
      if (body.action === 'load') {
        recoverPending(ss);
        out = loadState(ss);
      } else if (body.action === 'history') {
        out = { history: readGigHistory(ss), historyVersion: 2 };
      } else {
        out = saveOps(ss, body.ops);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Full detail stays in the script owner's execution log; clients get a
    // generic error so internals (paths, ids, stack fragments) never leak.
    try { Logger.log('ASG backend error: ' + (err && err.stack || err)); } catch (_) {}
    var quota = /429|quota|rate.?limit|too many requests/i.test(str(err && err.message));
    out = { error: quota ? 'rate_limited' : 'backend_error', detail: quota ? 'Google quota reached; wait before retrying' : 'unexpected backend error' };
  }
  return jsonOut(out);
}

// Node test harness (ignored by Apps Script).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { doPost: doPost, doGet: doGet, loadState: loadState, saveOps: saveOps, futureLines: futureLines, outcomeForTotal: outcomeForTotal, checkToken: checkToken };
}


// Advanced Sheets API adapter. The only data scope is drive.file. Google
// enforces file selection; the property is a second, application-level allowlist.
// One snapshot read per request, with staged granular writes. No OAuth token is
// ever returned by the player endpoint. RAW writes keep names such as =IMPORT...
// as text rather than spreadsheet formulas.
function openAsgWorkbook_(id) {
  var props = PropertiesService.getScriptProperties();
  if (!id || id !== props.getProperty('ASG_SHEET_ID') ||
      id !== props.getProperty('ASG_SELECTED_SHEET_ID')) throw new Error('Workbook selection required');
  var snapshot = Sheets.Spreadsheets.get(id, {
    includeGridData: true,
    fields: 'sheets(properties(sheetId,title,gridProperties),data(startRow,startColumn,rowData(values(effectiveValue))))'
  });
  var sheets = {}, pending = [], structural = [];
  var widths = {};
  widths[TAB.stash] = 6; widths[TAB.hq] = 2; widths[TAB.upgrades] = 5;
  widths[TAB.future] = 1; widths[TAB.cards] = 6; widths[TAB.slots] = 5;
  widths[TAB.roster] = 6; widths[TAB.history] = HISTORY_HEADER.length;
  function quote(name) { return "'" + name.replace(/'/g, "''") + "'"; }
  function column(n) {
    var v = ''; while (n) { n--; v = String.fromCharCode(65 + n % 26) + v; n = Math.floor(n / 26); } return v;
  }
  function wrap(meta, data) {
    var name = meta.title;
    function range(row, col, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      function set(vals) {
        var endRow = row + vals.length - 1;
        var endCol = col + (vals[0] || []).length - 1;
        if (endRow > meta.gridProperties.rowCount || endCol > meta.gridProperties.columnCount) {
          meta.gridProperties.rowCount = Math.max(endRow, meta.gridProperties.rowCount);
          meta.gridProperties.columnCount = Math.max(endCol, meta.gridProperties.columnCount);
          structural.push({ updateSheetProperties: { properties: {
            sheetId: meta.sheetId, gridProperties: meta.gridProperties
          }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } });
        }
        vals.forEach(function (r, i) {
          while (data.length < row + i) data.push([]);
          r.forEach(function (v, j) { data[row - 1 + i][col - 1 + j] = v; });
        });
        pending.push({ range: quote(name) + '!' + column(col) + row + ':' + column(endCol) + endRow, values: vals });
      }
      return {
        getValues: function () {
          var out = [];
          for (var r = 0; r < nr; r++) {
            var line = [];
            for (var c = 0; c < nc; c++) {
              var v = (data[row - 1 + r] || [])[col - 1 + c];
              line.push(v === undefined || v === null ? '' : v);
            }
            out.push(line);
          }
          return out;
        },
        setValues: set,
        setValue: function (v) { set([[v]]); },
        clearContent: function () {
          var vals = []; for (var r = 0; r < nr; r++) { var a = []; for (var c = 0; c < nc; c++) a.push(''); vals.push(a); } set(vals);
        }
      };
    }
    return {
      getLastRow: function () {
        for (var i = data.length - 1; i >= 0; i--) {
          if (data[i].some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
        }
        return 0;
      },
      getRange: range
    };
  }
  (snapshot.sheets || []).forEach(function (sheet) {
    var meta = sheet.properties;
    if (!widths[meta.title]) return;
    var rows = [];
    (sheet.data || []).forEach(function (block) {
      (block.rowData || []).forEach(function (r, i) {
        var target = (block.startRow || 0) + i;
        rows[target] = rows[target] || [];
        (r.values || []).slice(0, widths[meta.title]).forEach(function (cell, j) {
          var v = cell.effectiveValue || {};
          rows[target][(block.startColumn || 0) + j] = v.stringValue !== undefined ? v.stringValue :
            v.numberValue !== undefined ? v.numberValue : v.boolValue !== undefined ? v.boolValue : '';
        });
      });
    });
    sheets[meta.title] = wrap(meta, rows);
  });
  return {
    getSheetByName: function (name) { return sheets[name] || null; },
    insertSheet: function (name) {
      if (name !== TAB.history || sheets[name]) throw new Error('Unexpected sheet creation');
      var used = (snapshot.sheets || []).map(function (s) { return s.properties.sheetId; });
      var sid = 1; while (used.indexOf(sid) !== -1) sid++;
      var meta = { sheetId: sid, title: name, gridProperties: { rowCount: 1000, columnCount: 26 } };
      structural.push({ addSheet: { properties: meta } });
      sheets[name] = wrap(meta, []); return sheets[name];
    },
    flush: function () {
      if (structural.length) { Sheets.Spreadsheets.batchUpdate({ requests: structural }, id); structural = []; }
      if (pending.length) { Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: pending }, id); pending = []; }
    }
  };
}

// Only the signed-in script owner may enable/use setup. Anonymous execute-as-me
// requests have no active-user identity and fail closed. Equal effective user
// alone is NOT sufficient: every anonymous player request executes as owner.
function requireSetupOwner_() {
  var props = PropertiesService.getScriptProperties();
  var owner = str(props.getProperty('ASG_OWNER_EMAIL')).trim().toLowerCase();
  var active = str(Session.getActiveUser().getEmail()).toLowerCase();
  var effective = str(Session.getEffectiveUser().getEmail()).toLowerCase();
  if (props.getProperty('ASG_SETUP_ENABLED') !== 'true' || !owner || active !== owner || effective !== owner) {
    throw new Error('Private owner setup is disabled or unavailable');
  }
}

// These RPCs are callable from Setup.html but each independently checks identity.
// Use the editor-only /dev test deployment, never the anonymous player URL.
function getAsgSetupConfig() {
  requireSetupOwner_();
  var p = PropertiesService.getScriptProperties();
  return { projectNumber: p.getProperty('ASG_CLOUD_PROJECT_NUMBER'),
    developerKey: p.getProperty('ASG_PICKER_API_KEY'), token: ScriptApp.getOAuthToken() };
}

function selectAsgWorkbook(id) {
  requireSetupOwner_();
  var p = PropertiesService.getScriptProperties();
  if (!id || id !== p.getProperty('ASG_SHEET_ID')) throw new Error('Select the configured ASG workbook only');
  // Selection through Picker must grant Google-level file access first.
  Sheets.Spreadsheets.get(id, { fields: 'spreadsheetId' });
  p.setProperty('ASG_SELECTED_SHEET_ID', id);
  p.setProperty('ASG_SETUP_ENABLED', 'false');
  return 'Workbook selected. Private setup is now disabled. Close this window.';
}
