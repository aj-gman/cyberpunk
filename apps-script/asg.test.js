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
    ss: { getSheetByName(name) { return sheets[name] || null; } },
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
    SpreadsheetApp: {
      openById(id) {
        if (opts.breakOpen) throw new Error('boom: /home/internal/secret-path failure');
        if (id !== 'sheet-123') throw new Error('unknown spreadsheet');
        return world.ss;
      },
      flush() {},
    },
    PropertiesService: {
      getScriptProperties() {
        const props = { ASG_SHEET_ID: 'sheet-123', ASG_TOKEN_KEY: TOKEN_KEY };
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
