import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// The backend is an Apps Script file (.gs) with dual-compatible module.exports.
// Evaluate it in a vm context with mocked Google service globals.
const GS_PATH = path.join(__dirname, 'asg.gs');
const GS_SOURCE = fs.readFileSync(GS_PATH, 'utf8');

const TOKEN_KEY = 'test-token-key';

// Same token format as api/asg-auth.js: exp.nonce.hmac-sha256-base64url.
function makeToken(expOffsetSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
  const body = `${exp}.testnonce`;
  const sig = crypto.createHmac('sha256', TOKEN_KEY).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// ── Fake workbook ──

function makeSheet(initialRows) {
  // Row 1 is the header row; data starts at row 2.
  const data = [['<header>'], ...initialRows.map((r) => r.slice())];
  return {
    data,
    getLastRow() {
      for (let i = data.length - 1; i > 0; i--) {
        if (data[i].some((c) => String(c === undefined || c === null ? '' : c) !== '')) return i + 1;
      }
      return 1;
    },
    getRange(row, col, numRows, numCols) {
      const nr = numRows || 1;
      const nc = numCols || 1;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < nr; r++) {
            const src = data[row - 1 + r] || [];
            const vals = [];
            for (let c = 0; c < nc; c++) {
              const v = src[col - 1 + c];
              vals.push(v === undefined ? '' : v);
            }
            out.push(vals);
          }
          return out;
        },
        setValues(vals) {
          for (let r = 0; r < vals.length; r++) {
            while (data.length < row + r) data.push([]);
            for (let c = 0; c < vals[r].length; c++) data[row - 1 + r][col - 1 + c] = vals[r][c];
          }
        },
        setValue(v) {
          this.setValues([[v]]);
        },
        clearContent() {
          for (let r = 0; r < nr; r++) {
            if (!data[row - 1 + r]) continue;
            for (let c = 0; c < nc; c++) data[row - 1 + r][col - 1 + c] = '';
          }
        },
      };
    },
  };
}

function makeWorkbook() {
  const sheets = {
    'Stash': makeSheet([
      ['grp-1', 'group', '', 0, 'Weapons', ''],
      ['itm-1', 'item', 'grp-1', 0, 'Knife', 'sharp'],
      ['itm-2', 'item', 'grp-1', 1, 'ATGM', ''],
      ['itm-orphan', 'item', 'grp-gone', 0, 'Lost', ''],
    ]),
    'HQ': makeSheet([['supplies', 7], ['culture', 3], ['technology', 0], ['security', 99]]),
    'HQ Upgrades': makeSheet([['supplies', 'Biolocked Armory', ''], ['security', 'Tier 2 Defense System', 'note']]),
    'Future Upgrades': makeSheet([['armory'], ['big nuclear facility']]),
    'Assignment Cards': makeSheet([
      ['gig-1', 'gig', 0, 1, 'Records job', 'quietly'],
      ['proj-1', 'project', 0, 1, 'New project', ''],
    ]),
    'Assignment Slots': makeSheet([
      ['gig-1:0', 'gig-1', 0, 'npc-solo-1', 'Solo'],
      ['gig-1:2', 'gig-1', 2, '', 'Techie'],
      ['proj-1:0', 'proj-1', 0, 'npc-media-1', ''],
    ]),
    'Roster': makeSheet([
      ['npc-solo-1', 'Solo', 1, 2, '', ''],
      ['npc-media-1', 'Media', 1, 3, 'Lappo', 'https://example.test/lappo/'],
    ]),
  };
  return {
    sheets,
    ss: {
      getSheetByName(name) { return sheets[name] || null; },
      insertSheet(name) { sheets[name] = makeSheet([]); return sheets[name]; },
    },
  };
}

// ── vm harness ──

let backend;
let world;

function setup(opts) {
  opts = opts || {};
  world = makeWorkbook();
  const lock = { held: false, waits: 0 };
  const sandbox = {
    module: { exports: {} },
    Sheets: {
      Spreadsheets: {
        get(id) {
          if (opts.breakOpen) throw new Error('boom: /home/internal/secret-path failure');
          if (id !== 'sheet-123') throw new Error('unknown spreadsheet');
          return { sheets: Object.entries(world.sheets).map(([title, sh], i) => ({
            properties: { sheetId: i + 1, title, gridProperties: { rowCount: 1000, columnCount: 26 } },
            data: [{ rowData: sh.data.map(r => ({ values: r.map(v => ({ effectiveValue: typeof v === 'number' ? {numberValue:v} : {stringValue:String(v ?? '')} })) })) }]
          })) };
        },
        batchUpdate(body) {
          for (const req of body.requests) if (req.addSheet) {
            const title = req.addSheet.properties.title;
            world.sheets[title] = makeSheet([]);
          }
        },
        Values: {
          batchUpdate(body, id) {
            if (id !== 'sheet-123') throw new Error('unknown spreadsheet');
            expect(body.valueInputOption).toBe('RAW');
            for (const entry of body.data) {
              const match = entry.range.match(/^'((?:[^']|'')+)'!([A-Z]+)([0-9]+):/);
              const title = match[1].replace(/''/g, "'");
              let col = 0; for (const c of match[2]) col = col * 26 + c.charCodeAt(0) - 64;
              const values = entry.values;
              const range = world.sheets[title].getRange(Number(match[3]), col, values.length, values[0].length);
              if (values.every(r => r.every(v => v === ''))) range.clearContent();
              else range.setValues(values);
            }
          }
        }
      }
    },
    PropertiesService: {
      getScriptProperties() {
        const props = { ASG_SHEET_ID: 'sheet-123', ASG_SELECTED_SHEET_ID: 'sheet-123', ASG_TOKEN_KEY: TOKEN_KEY };
        return { getProperty(k) { return props[k] !== undefined ? props[k] : null; } };
      },
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() { if (lock.held) throw new Error('lock contention'); lock.held = true; lock.waits++; },
          releaseLock() { lock.held = false; },
        };
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return { content: text, mime: null, setMimeType(m) { this.mime = m; return this; } };
      },
    },
    Utilities: {
      computeHmacSha256Signature(data, key) {
        return Array.from(crypto.createHmac('sha256', key).update(data).digest());
      },
      base64EncodeWebSafe(bytes) {
        // Apps Script pads; the harness mirrors that so stripping is exercised.
        return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      },
    },
    __lock: lock,
  };
  vm.createContext(sandbox);
  vm.runInContext(GS_SOURCE, sandbox, { filename: 'asg.gs' });
  backend = sandbox.module.exports;
  return lock;
}

function post(body) {
  const out = backend.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(out.content);
}

function authPost(extra) {
  return post({ token: makeToken(), ...extra });
}

describe('apps-script asg backend', () => {
  beforeEach(() => { setup(); });

  it('doGet reports the service', () => {
    const out = backend.doGet();
    expect(JSON.parse(out.content)).toEqual({ ok: true, service: 'asg' });
    expect(out.mime).toBe('application/json');
  });

  it('rejects a missing, wrong or expired token', () => {
    expect(post({ token: 'nope', action: 'load' })).toEqual({ error: 'bad_token' });
    expect(post({ action: 'load' })).toEqual({ error: 'bad_token' });
    expect(post({ token: makeToken(-60), action: 'load' })).toEqual({ error: 'bad_token' });
    const wrongKey = makeToken().split('.');
    wrongKey[2] = crypto.createHmac('sha256', 'other-key').update(`${wrongKey[0]}.${wrongKey[1]}`).digest('base64url');
    expect(post({ token: wrongKey.join('.'), action: 'load' })).toEqual({ error: 'bad_token' });
  });

  it('checkToken accepts a freshly minted token', () => {
    expect(backend.checkToken(makeToken())).toBe(true);
  });

  it('load returns parsed state from the tabs', () => {
    const res = authPost({ action: 'load' });
    expect(res.roster).toEqual([
      { id: 'npc-solo-1', role: 'Solo', number: 1, skill: 2 },
      { id: 'npc-media-1', role: 'Media', number: 1, skill: 3, name: 'Lappo', pageUrl: 'https://example.test/lappo/' },
    ]);
    // Stash: orphan item pointing at a deleted group is dropped.
    expect(res.state.stash.groups).toHaveLength(1);
    expect(res.state.stash.groups[0].items.map((i) => i.name)).toEqual(['Knife', 'ATGM']);
    // HQ values clamp to 0-15.
    expect(res.state.hq.security.value).toBe(15);
    expect(res.state.hq.supplies.value).toBe(7);
    expect(res.state.hq.futureUpgrades).toBe('- armory\n- big nuclear facility');
    // Assignments: projects cap 2, gigs cap 4.
    expect(res.state.assignments.gigs[0].slots).toEqual([
      { role: 'Solo', npc: 'npc-solo-1' },
      null,
      { role: 'Techie', npc: null },
      null,
    ]);
    expect(res.state.assignments.projects[0].slots).toEqual(['npc-media-1', null]);
    expect(res.hqUpgrades.security).toEqual([{ name: 'Tier 2 Defense System', note: 'note' }]);
  });

  it('rejects assigning one NPC to two slots', () => {
    const res = authPost({
      action: 'save',
      ops: { slots: { upserts: [{ key: 'gig-1:1', card: 'gig-1', slot: 1, npc: 'npc-solo-1', role: '' }] } },
    });
    expect(res.error).toBe('invariant');
    expect(res.detail).toMatch(/already assigned/);
    // Nothing written.
    expect(world.sheets['Assignment Slots'].getLastRow()).toBe(4);
  });

  it('rejects exceeding a project capacity', () => {
    const res = authPost({
      action: 'save',
      ops: {
        slots: {
          upserts: [
            { key: 'proj-1:1', card: 'proj-1', slot: 1, npc: 'npc-new-1', role: '' },
            { key: 'proj-1:2', card: 'proj-1', slot: 2, npc: 'npc-new-2', role: '' },
          ],
        },
      },
    });
    expect(res.error).toBe('invariant');
    expect(res.detail).toMatch(/full/);
  });

  it('rejects assigning to a deleted card', () => {
    const res = authPost({
      action: 'save',
      ops: { slots: { upserts: [{ key: 'ghost:0', card: 'ghost', slot: 0, npc: 'npc-solo-2', role: '' }] } },
    });
    expect(res.error).toBe('invariant');
    expect(res.detail).toMatch(/deleted card/);
  });

  it('applies granular ops, returns fresh state, and leaves hand edits untouched', () => {
    // Simulate a hand edit typed straight into the Stash tab.
    world.sheets['Stash'].data.push(['hand-1', 'item', 'grp-1', 9, 'Hand typed', '']);
    const res = authPost({
      action: 'save',
      ops: {
        slots: { upserts: [{ key: 'gig-1:1', card: 'gig-1', slot: 1, npc: 'npc-media-2', role: 'Netrunner' }] },
        hq: { culture: 5 },
        stash: { upserts: [{ id: 'itm-1', type: 'item', group: 'grp-1', position: 0, name: 'Mono-knife', note: 'vibro' }] },
      },
    });
    expect(res.error).toBeUndefined();
    expect(res.state.assignments.gigs[0].slots[1]).toEqual({ role: 'Netrunner', npc: 'npc-media-2' });
    expect(res.state.hq.culture.value).toBe(5);
    const weapons = res.state.stash.groups[0];
    expect(weapons.items.find((i) => i.id === 'itm-1').name).toBe('Mono-knife');
    // The hand-typed row survived and appears in the returned state.
    expect(weapons.items.find((i) => i.id === 'hand-1').name).toBe('Hand typed');
  });

  it('deletes a card and its slots free the NPC', () => {
    const res = authPost({
      action: 'save',
      ops: {
        cards: { deletes: ['proj-1'] },
        slots: { deletes: ['proj-1:0'], upserts: [{ key: 'gig-1:3', card: 'gig-1', slot: 3, npc: 'npc-media-1', role: '' }] },
      },
    });
    expect(res.error).toBeUndefined();
    expect(res.state.assignments.projects).toHaveLength(0);
    expect(res.state.assignments.gigs[0].slots[3]).toEqual({ role: '', npc: 'npc-media-1' });
  });

  it('advertises journaled completion support on load', () => {
    expect(authPost({ action: 'load' }).completionVersion).toBe(3);
  });

  // d10 + crew bonus - difficulty for each outcome: totals 13, 8, 5, 2.
  const ROLLS = {
    success: { roll: 10, bonus: 3, difficulty: 0, total: 13 },
    complications: { roll: 6, bonus: 3, difficulty: 1, total: 8 },
    failed: { roll: 3, bonus: 3, difficulty: 1, total: 5 },
    disaster: { roll: 1, bonus: 3, difficulty: 2, total: 2 },
  };
  const completeProj = (result, extra) => ({
    action: 'save',
    ops: { complete: { id: 'proj-1', kind: 'project', number: 1, name: 'New project', description: 'd', result, crew: ['Lappo (Skill 3)'], ...(ROLLS[result] || ROLLS.failed) }, ...(extra || {}) },
  });

  it('completes a card: history row done, card and its slots removed, result echoed', () => {
    const res = authPost(completeProj('failed'));
    expect(res.error).toBeUndefined();
    expect(res.completed).toEqual({ id: 'proj-1', result: 'failed', status: 'done', roll: 3, bonus: 3, difficulty: 1, total: 5 });
    expect(res.state.assignments.projects).toHaveLength(0);
    expect(world.sheets['Assignment Slots'].data.some((r) => r[1] === 'proj-1' && String(r[0]) !== '')).toBe(false);
    const rows = world.sheets['Assignment History'].data;
    expect(rows[0]).toEqual(['id', 'kind', 'number', 'name', 'description', 'result', 'completed_at', 'crew', 'status', 'roll', 'crew_bonus', 'difficulty', 'total']);
    expect(rows).toHaveLength(2);
    expect(rows[1].slice(0, 6)).toEqual(['proj-1', 'project', 1, 'New project', 'd', 'failed']);
    expect(rows[1][7]).toBe('Lappo (Skill 3)');
    expect(rows[1][8]).toBe('done');
    expect(rows[1].slice(9)).toEqual([3, 3, 1, 5]);
    expect(Number.isNaN(Date.parse(rows[1][6]))).toBe(false);
  });

  it('replaying a finished completion is safe and the first recorded result wins', () => {
    expect(authPost(completeProj('failed')).completed.result).toBe('failed');
    const again = authPost(completeProj('success')); // e.g. the response was lost
    expect(again.error).toBeUndefined();
    expect(again.completed).toEqual({ id: 'proj-1', result: 'failed', status: 'done', roll: 3, bonus: 3, difficulty: 1, total: 5 });
    expect(world.sheets['Assignment History'].data).toHaveLength(2);
  });

  // Make the next clearContent on a sheet throw once (a write failing midway).
  function failOnceOnClear(sheetName) {
    const sh = world.sheets[sheetName];
    const orig = sh.getRange.bind(sh);
    let armed = true;
    sh.getRange = (...a) => {
      const r = orig(...a);
      const clear = r.clearContent.bind(r);
      r.clearContent = () => { if (armed) { armed = false; throw new Error('simulated write failure'); } clear(); };
      return r;
    };
  }

  it('a failure after the journal write leaves a pending row, and the next load rolls it forward', () => {
    failOnceOnClear('Assignment Slots');
    const bad = authPost(completeProj('success'));
    expect(bad.error).toBe('backend_error');
    const hist = world.sheets['Assignment History'].data;
    expect(hist[1][0]).toBe('proj-1');
    expect(hist[1][8]).toBe('pending');
    expect(world.sheets['Assignment Cards'].data.some((r) => r[0] === 'proj-1')).toBe(true); // card still there
    const loaded = authPost({ action: 'load' }); // recovery happens before answering
    expect(loaded.state.assignments.projects).toHaveLength(0);
    expect(world.sheets['Assignment History'].data[1][8]).toBe('done');
    expect(world.sheets['Assignment History'].data[1][5]).toBe('success');
    expect(world.sheets['Assignment History'].data).toHaveLength(2);
  });

  it('a failure after the slots are cleared but before the card is removed is also finished by recovery', () => {
    failOnceOnClear('Assignment Cards'); // slots cleared first, then the card clear fails
    expect(authPost(completeProj('failed')).error).toBe('backend_error');
    expect(world.sheets['Assignment Slots'].data.some((r) => r[1] === 'proj-1' && String(r[0]) !== '')).toBe(false);
    const retry = authPost(completeProj('success')); // a retry recovers the pending row first, recorded result wins
    expect(retry.completed).toEqual({ id: 'proj-1', result: 'failed', status: 'done', roll: 3, bonus: 3, difficulty: 1, total: 5 });
    expect(retry.state.assignments.projects).toHaveLength(0);
    expect(world.sheets['Assignment History'].data).toHaveLength(2);
  });

  it('treats older history rows without a status as done', () => {
    world.sheets['Assignment History'] = makeSheet([['gig-old', 'gig', 2, 'Old', '', 'success', '2026-11-18T00:00:00Z', '']]);
    const res = authPost(completeProj('failed'));
    expect(res.error).toBeUndefined();
    expect(world.sheets['Assignment History'].data).toHaveLength(3);
    expect(authPost({ action: 'load' }).error).toBeUndefined();
  });

  it('load advertises the history capability flag', () => {
    expect(authPost({ action: 'load' }).historyVersion).toBe(2);
  });

  it('history action returns done gigs only, projected to name/description/result, newest first', () => {
    world.sheets['Assignment History'] = makeSheet([
      ['gig-1', 'gig', 1, 'Records job', 'quietly\nfast', 'success', '2026-11-18T00:00:00Z', 'Lappo', 'done'],
      ['proj-1', 'project', 1, 'Secret project', 'hidden', 'success', '2026-11-18T01:00:00Z', '', 'done'],
      ['gig-2', 'gig', 2, 'Data heist', '', 'failed', '2026-11-18T02:00:00Z', '', 'pending'],
      ['gig-3', 'gig', 3, 'Old gig', 'no status column row', 'success', '2026-11-18T03:00:00Z', ''],
    ]);
    const out = authPost({ action: 'history' });
    expect(out.error).toBeUndefined();
    expect(out.historyVersion).toBe(2);
    expect(out.history).toHaveLength(2); // project rows and pending rows stay server-side
    expect(out.history[0]).toEqual({ name: 'Old gig', description: 'no status column row', result: 'success' }); // newest first
    expect(out.history[1]).toEqual({ name: 'Records job', description: 'quietly\nfast', result: 'success' });
  });

  it('history rows with a roll carry the breakdown; older rows do not', () => {
    world.sheets['Assignment History'] = makeSheet([
      ['gig-1', 'gig', 1, 'Rolled', '', 'complications', '2026-11-21T00:00:00Z', 'Lappo', 'done', 6, 3, 1, 8],
    ]);
    expect(authPost({ action: 'history' }).history[0]).toEqual({ name: 'Rolled', description: '', result: 'complications', roll: 6, bonus: 3, difficulty: 1, total: 8 });
  });

  it('labels the new history columns on a tab created before the dice roll', () => {
    world.sheets['Assignment History'] = makeSheet([]);
    world.sheets['Assignment History'].data[0] = ['id', 'kind', 'number', 'name', 'description', 'result', 'completed_at', 'crew', 'status'];
    expect(authPost(completeProj('success')).error).toBeUndefined();
    const rows = world.sheets['Assignment History'].data;
    expect(rows[0].slice(9)).toEqual(['roll', 'crew_bonus', 'difficulty', 'total']);
    expect(rows[1].slice(5, 6).concat(rows[1].slice(9))).toEqual(['success', 10, 3, 0, 13]);
  });

  it('classifies every total: 10+ success, 7-9 complications, 4-6 failure, 3 or less disaster', () => {
    const cases = [[13, 'success'], [10, 'success'], [9, 'complications'], [7, 'complications'], [6, 'failed'], [4, 'failed'], [3, 'disaster'], [1, 'disaster'], [0, 'disaster'], [-4, 'disaster']];
    cases.forEach(([total, outcome]) => {
      expect(backend.outcomeForTotal(total)).toBe(outcome);
    });
  });

  it('rejects an inconsistent roll: wrong total, wrong outcome, out-of-range d10 or difficulty', () => {
    const bad = (patch) => {
      const body = completeProj('success');
      Object.assign(body.ops.complete, patch);
      return authPost(body).error;
    };
    expect(bad({ total: 20 })).toBe('invalid_ops');
    expect(bad({ result: 'failed' })).toBe('invalid_ops');
    expect(bad({ roll: 11, total: 14 })).toBe('invalid_ops');
    expect(bad({ roll: 0, total: 3 })).toBe('invalid_ops');
    expect(bad({ difficulty: 6, total: 7 })).toBe('invalid_ops');
    expect(bad({ roll: undefined })).toBe('invalid_ops');
    expect(world.sheets['Assignment History']).toBeUndefined();
  });

  it('history action answers an empty list when the tab does not exist yet', () => {
    const out = authPost({ action: 'history' });
    expect(out.error).toBeUndefined();
    expect(out.history).toEqual([]);
  });

  it('rejects a bad result, an unknown card, or an edit to the completing card, without writing', () => {
    expect(authPost(completeProj('maybe')).error).toBe('invalid_ops');
    const ghost = authPost({ action: 'save', ops: { complete: { id: 'nope', kind: 'gig', result: 'success', ...ROLLS.success } } });
    expect(ghost.error).toBe('invalid_ops');
    const assign = authPost(completeProj('success', { slots: { upserts: [{ key: 'proj-1:1', card: 'proj-1', slot: 1, npc: 'npc-solo-9', role: '' }] } }));
    expect(assign.error).toBe('invariant');
    expect(world.sheets['Assignment History']).toBeUndefined();
    expect(assign.state.assignments.projects).toHaveLength(1);
  });

  it('applies other pending edits in the same completion save', () => {
    const res = authPost(completeProj('success', { hq: { supplies: 9 } }));
    expect(res.error).toBeUndefined();
    expect(res.state.hq.supplies.value).toBe(9);
  });

  it('futureLines strips dashes and blanks', () => {
    expect(backend.futureLines('- armory\n\n  \n- big facility\nplain line')).toEqual(['armory', 'big facility', 'plain line']);
  });
});

describe('apps-script asg backend hardening (independent audit)', () => {
  beforeEach(() => { setup(); });
  it('rejects a slot upsert whose key is not card:slot', () => {
    const res = authPost({ action: 'save', ops: { slots: { upserts: [{ key: 'gig-1:0', card: 'gig-1', slot: 1, npc: 'npc-solo-1', role: '' }], deletes: [] } } });
    expect(res.error).toBe('invalid_ops');
    expect(res.detail).toContain('card:slot');
  });

  it('rejects a non-integer or negative slot index', () => {
    const res = authPost({ action: 'save', ops: { slots: { upserts: [{ key: 'gig-1:1.5', card: 'gig-1', slot: 1.5, npc: '', role: '' }], deletes: [] } } });
    expect(res.error).toBe('invalid_ops');
    const res2 = authPost({ action: 'save', ops: { slots: { upserts: [{ key: 'gig-1:-1', card: 'gig-1', slot: -1, npc: '', role: '' }], deletes: [] } } });
    expect(res2.error).toBe('invalid_ops');
  });

  it('does not count empty slot rows (no npc, no role) toward card capacity', () => {
    // proj-1 holds 2; three all-empty rows must not trip "card is full".
    const res = authPost({ action: 'save', ops: { slots: { upserts: [
      { key: 'proj-1:0', card: 'proj-1', slot: 0, npc: '', role: '' },
      { key: 'proj-1:1', card: 'proj-1', slot: 1, npc: '', role: '' },
      { key: 'proj-1:2', card: 'proj-1', slot: 2, npc: '', role: '' },
    ], deletes: [] } } });
    expect(res.error).toBeUndefined();
  });

  it('still enforces capacity on occupied rows', () => {
    const res = authPost({ action: 'save', ops: { slots: { upserts: [
      { key: 'proj-1:0', card: 'proj-1', slot: 0, npc: 'npc-a', role: '' },
      { key: 'proj-1:1', card: 'proj-1', slot: 1, npc: 'npc-b', role: '' },
      { key: 'proj-1:2', card: 'proj-1', slot: 2, npc: 'npc-c', role: '' },
    ], deletes: [] } } });
    expect(res.error).toBe('invariant');
    expect(res.detail).toContain('full');
  });

  it('returns a generic backend_error and never leaks exception internals', () => {
    setup({ breakOpen: true });
    const res = authPost({ action: 'load' });
    expect(res.error).toBe('backend_error');
    expect(res.detail).toBe('unexpected backend error');
    expect(JSON.stringify(res)).not.toContain('boom');
    expect(JSON.stringify(res)).not.toContain('secret-path');
  });

  it('surfaces orphan/invalid workbook data as warnings on load', () => {
    // Fixture has stash item itm-orphan in deleted group grp-gone; add an
    // orphan slot row (card deleted by hand in the sheet) through the API.
    world.sheets['Assignment Slots'].getRange(5, 1, 1, 5).setValues([['gone-1:0', 'gone-1', 0, 'npc-ghost', '']]);
    const res = authPost({ action: 'load' });
    expect(res.error).toBeUndefined();
    const text = (res.warnings || []).join('\n');
    expect(text).toContain('1 stash item(s) point at deleted groups');
    expect(text).toContain('1 assignment row(s) point at deleted cards');
  });
});

describe('apps-script rejection responses (reaudit R2)', () => {
  beforeEach(() => { setup(); });

  it('invariant rejection carries the fresh state (concurrent same-NPC loser)', () => {
    // npc-solo-1 already holds gig-1:0 in the fixture; a second page tries to
    // assign the same NPC to proj-1:1 and must lose.
    const res = authPost({ action: 'save', ops: { slots: { upserts: [{ key: 'proj-1:1', card: 'proj-1', slot: 1, npc: 'npc-solo-1', role: '' }], deletes: [] } } });
    expect(res.error).toBe('invariant');
    expect(res.detail).toContain('already assigned');
    expect(res.state).toBeTruthy(); // fresh state for client-side reconcile
    const gig = res.state.assignments.gigs.find((g) => g.id === 'gig-1');
    expect(gig.slots[0].npc).toBe('npc-solo-1'); // winner kept
    const proj = res.state.assignments.projects.find((p) => p.id === 'proj-1');
    expect(proj.slots[1]).toBe(null); // loser's write never applied
  });

  it('invalid_ops rejection also carries the fresh state', () => {
    const res = authPost({ action: 'save', ops: { slots: { upserts: [{ key: 'gig-1:1', card: 'gig-1', slot: 2, npc: '', role: '' }], deletes: [] } } });
    expect(res.error).toBe('invalid_ops');
    expect(res.state).toBeTruthy();
  });
});

describe('editable HQ upgrades protocol', () => {
  beforeEach(() => {
    setup();
    world.sheets['HQ Upgrades'] = makeSheet([
      ['supplies', 'Armory', 'keep note', 'u-one', 0],
      ['supplies', '', 'note-only slot', 'u-two', 1],
      ['culture', 'Studio', '', 'u-three', 0],
    ]);
    world.sheets['HQ Upgrades'].data[0] = ['category','name','note','id','position'];
  });
  const save = (upserts = [], deletes = []) => authPost({action:'save',ops:{upgrades:{upserts,deletes}}});
  it('advertises editing only for migrated valid rows and keeps blank-name slots', () => {
    let out = authPost({action:'load'});
    expect(out.upgradeEditVersion).toBe(1);
    expect(out.hqUpgrades.supplies[1]).toMatchObject({id:'u-two',name:'',note:'note-only slot'});
    world.sheets['HQ Upgrades'].data[1][3] = '';
    out = authPost({action:'load'});
    expect(out.upgradeEditVersion).toBe(0);
    expect(save([{id:'new',category:'supplies',position:2,name:'x',note:''}]).error).toBe('invalid_ops');
  });
  it('applies granular rename, note and reorder without changing other upgrades or HQ values', () => {
    const out=save([{id:'u-one',category:'supplies',position:1,name:'Renamed',note:'new note'}]);
    expect(out.error).toBeUndefined();
    expect(out.hqUpgrades.supplies.find(u=>u.id==='u-one')).toMatchObject({name:'Renamed',note:'new note'});
    expect(out.hqUpgrades.culture[0]).toMatchObject({id:'u-three',name:'Studio'});
    expect(world.sheets.HQ.data).toEqual([['<header>'],['supplies',7],['culture',3],['technology',0],['security',99]]);
  });
  it('allows name-empty deletion even with a note, rejects named deletion and cross-category moves', () => {
    expect(save([],['u-one']).error).toBe('invalid_ops');
    expect(save([{id:'u-one',category:'culture',position:0,name:'Armory',note:''}]).error).toBe('invalid_ops');
    expect(save([],['u-two']).error).toBeUndefined();
    expect(authPost({action:'load'}).hqUpgrades.supplies.map(u=>u.id)).toEqual(['u-one']);
    expect(save([],['u-two']).error).toBeUndefined(); // idempotent retry
  });
  it('rejects malformed operations before any stash or upgrade write', () => {
    const before=JSON.stringify(world.sheets);
    for (const u of [{id:'new',category:'unknown',position:0,name:'x',note:''},{id:'new',category:'culture',position:-1,name:'x',note:''},null])
      expect(save([u]).error).toBe('invalid_ops');
    expect(JSON.stringify(world.sheets)).toBe(before);
  });
  it('preserves unrelated concurrent edits to different upgrade IDs', () => {
    save([{id:'u-one',category:'supplies',position:0,name:'A',note:'a'}]);
    save([{id:'u-three',category:'culture',position:0,name:'B',note:'b'}]);
    const out=authPost({action:'load'});
    expect(out.hqUpgrades.supplies[0].name).toBe('A');
    expect(out.hqUpgrades.culture[0].name).toBe('B');
  });
});
