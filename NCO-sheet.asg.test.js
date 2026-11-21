import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, afterEach } from 'vitest';
const windows = [];
// What the backend's load answers with: the old sample content as REMOTE
// workbook data (the page itself no longer carries a sample or a local copy).
function sampleRemote() {
  return {
    state: {
      stash: { groups: [
        { id: 'grp-weapons', name: 'Weapons', items: [
          { id: 'itm-1', name: 'Malorian Heavy Sniper', note: '' },
          { id: 'itm-2', name: 'ATGM', note: 'One-use launcher. Kept for vehicular targets.' },
          { id: 'itm-3', name: 'Very Heavy Pistol', note: '' },
          { id: 'itm-4', name: 'Knife', note: '' }
        ]},
        { id: 'grp-armor', name: 'Armor', items: [
          { id: 'itm-5', name: 'Metalgear', note: '' },
          { id: 'itm-6', name: 'Nomad Flak Armor', note: '' }
        ]},
        { id: 'grp-gear', name: 'Gear', items: [
          { id: 'itm-7', name: 'Recon Drone', note: '' },
          { id: 'itm-8', name: 'Microtorch cutter', note: '' }
        ]}
      ]},
      hq: { supplies: { value: 10 }, culture: { value: 10 }, technology: { value: 10 }, security: { value: 10 }, futureUpgrades: '- armory\n- big nuclear facility' },
      assignments: {
        projects: [{ id: 'proj-1', number: 1, name: 'New project', description: '', slots: ['npc-media-1', null] }],
        gigs: [
          { id: 'gig-1', number: 1, name: 'Obtain records of personal communications', description: '', slots: [{ role: 'Solo', npc: 'npc-solo-1' }, { role: 'Netrunner', npc: 'npc-netrunner-1' }, { role: 'Techie', npc: 'npc-techie-1' }, { role: 'Nomad', npc: 'npc-nomad-1' }] },
          { id: 'gig-3', number: 3, name: 'Gather intel on an offline database', description: '', slots: [{ role: 'Netrunner', npc: 'npc-netrunner-2' }, { role: 'Media', npc: 'npc-media-2' }, { role: 'Solo', npc: 'npc-solo-3' }, { role: 'Fixer', npc: 'npc-fixer-1' }] }
        ]
      }
    },
    roster: [
      { id: 'npc-lappo',       role: 'Rockerboy', number: 2, skill: 3, name: 'Lappo', pageUrl: null },
      { id: 'npc-rockerboy-1', role: 'Rockerboy', number: 1, skill: 1 },
      { id: 'npc-techie-4',    role: 'Techie',    number: 4, skill: 2 },
      { id: 'npc-lawman-2',    role: 'Lawman',    number: 2, skill: 0 },
      { id: 'npc-solo-5',      role: 'Solo',      number: 5, skill: 0 },
      { id: 'npc-media-1',     role: 'Media',     number: 1, skill: 3 },
      { id: 'npc-solo-1',      role: 'Solo',      number: 1, skill: 2 },
      { id: 'npc-netrunner-1', role: 'Netrunner', number: 1, skill: 0 },
      { id: 'npc-techie-1',    role: 'Techie',    number: 1, skill: 2 },
      { id: 'npc-nomad-1',     role: 'Nomad',     number: 1, skill: 1 },
      { id: 'npc-netrunner-2', role: 'Netrunner', number: 2, skill: 0 },
      { id: 'npc-media-2',     role: 'Media',     number: 2, skill: 0 },
      { id: 'npc-solo-3',      role: 'Solo',      number: 3, skill: 0 },
      { id: 'npc-fixer-1',     role: 'Fixer',     number: 1, skill: 0 }
    ],
    hqUpgrades: {
      supplies:   [{ id: 'up-1', name: 'Biolocked Armory', note: '' }, { id: 'up-2', name: 'Large Multimodal Garage', note: 'Fits the AV and ground vehicles. Upkeep 2 SUP.' }],
      culture:    [{ id: 'up-3', name: 'Media Center', note: '' }, { id: 'up-4', name: 'Common Room', note: '' }, { id: 'up-5', name: 'Lounge', note: '' }],
      technology: [{ id: 'up-6', name: 'Tier 1 Tech Bench', note: '' }, { id: 'up-7', name: 'Tier 1 Server Room', note: '' }, { id: 'up-8', name: 'Tier 1 Medbay', note: '' }],
      security:   [{ id: 'up-9', name: 'Tier 2 Defense System', note: '' }, { id: 'up-10', name: 'Tier 2 Security System', note: '' }]
    },
    upgradeEditVersion: 1,
    completionVersion: 2,
    historyVersion: 1
  };
}
// Raw boot: gated, blank, auto-prompting (prompt cancelled by default).
function rawSheet(promptReply) {
  const dom = new JSDOM(readFileSync('src/site/img/NCO-sheet.html','utf8'), { runScripts:'dangerously', url:'https://example.test/cyberpunk/img/NCO-sheet.html', beforeParse(w) { w.confirm=()=>true; w.alert=vi.fn(); w.prompt=vi.fn(()=>promptReply||null); w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})); } });
  windows.push(dom.window);
  return dom.window;
}
// Connected boot: the usual test starting point - a fresh authenticated
// load of the sample workbook lifts the gate.
function sheet() {
  const w = rawSheet();
  w.AsgBackend.load = (cb)=>cb(sampleRemote(), null);
  w.asgConnect();
  w.asgPassword = 'pw'; // a real connected session always carries one in memory
  w.clearTimeout(w.asgRefreshTimer);
  return w;
}
afterEach(async () => { await Promise.resolve(); windows.splice(0).forEach(w=>w.close()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('ASG page structure', () => {
 it('renames page 3 to ASG with all three modules folded by default', () => {
  const w=sheet();
  expect(w.document.getElementById('btn-page3').textContent).toBe('ASG');
  expect(w.document.getElementById('asg-stash-body').style.display).toBe('none');
  expect(w.document.getElementById('asg-hq-body').style.display).toBe('none');
  expect(w.document.getElementById('asg-assign-body').style.display).toBe('none');
  const hints=Array.from(w.document.querySelectorAll('.asg-fold-hint')).map(h=>h.textContent);
  expect(hints).toEqual(['folded','folded','folded']);
  // the old Google Sheets iframe embed is gone
  expect(w.document.querySelector('#sheet-page3 iframe')).toBeNull();
 });
 it('unfolds and folds a module from its header', () => {
  const w=sheet();
  const header=w.document.querySelector('#asg-stash-body').parentElement.querySelector('.asg-module-header');
  header.click();
  expect(w.document.getElementById('asg-stash-body').style.display).toBe('');
  expect(header.querySelector('.asg-caret').textContent).toBe('▾');
  expect(header.querySelector('.asg-header-btn').style.display).toBe('');
  header.click();
  expect(w.document.getElementById('asg-stash-body').style.display).toBe('none');
 });
});

describe('ASG Stash', () => {
 it('adds, renames and deletes groups and items', () => {
  const w=sheet();
  const before=w.asgState.stash.groups.length;
  w.asgAddGroup();
  expect(w.asgState.stash.groups).toHaveLength(before+1);
  const group=w.asgState.stash.groups[before];
  w.asgAddItem(group.id);
  expect(group.items).toHaveLength(1);
  const input=w.document.querySelector('.asg-group[data-group-id="'+group.id+'"] .asg-group-name');
  input.value='Heavy ordnance'; input.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(group.name).toBe('Heavy ordnance');
  w.confirm=()=>false; w.asgDeleteItem(group.id,group.items[0].id);
  expect(group.items).toHaveLength(1);
  w.confirm=()=>true; w.asgDeleteItem(group.id,group.items[0].id);
  expect(group.items).toHaveLength(0);
  w.asgDeleteGroup(group.id);
  expect(w.asgState.stash.groups).toHaveLength(before);
 });
 it('moves and reorders items and groups by drag logic only (no move buttons)', () => {
  const w=sheet();
  expect(w.document.querySelector('#asg-stash-body .btn-move')).toBeNull();
  const buttons=Array.from(w.document.querySelectorAll('#asg-stash-body button')).map(b=>b.textContent.toLowerCase());
  expect(buttons.some(t=>t==='move')).toBe(false);
  // cross-group move: ATGM (itm-2, Weapons) to Armor
  w.asgMoveItem('itm-2','grp-armor',null,false);
  expect(w.asgFindGroup('grp-armor').items.map(i=>i.id)).toEqual(['itm-5','itm-6','itm-2']);
  expect(w.asgFindGroup('grp-weapons').items.map(i=>i.id)).toEqual(['itm-1','itm-3','itm-4']);
  // reorder within a group: itm-4 before itm-1
  w.asgMoveItem('itm-4','grp-weapons','itm-1',true);
  expect(w.asgFindGroup('grp-weapons').items.map(i=>i.id)).toEqual(['itm-4','itm-1','itm-3']);
  // reorder groups: Gear before Weapons
  w.asgMoveGroup('grp-gear','grp-weapons',true);
  expect(w.asgState.stash.groups.map(g=>g.id)).toEqual(['grp-gear','grp-weapons','grp-armor']);
 });
 it('shows the item note on hover and edits it through the note editor', () => {
  const w=sheet();
  const row=w.document.querySelector('.asg-item[data-item-id="itm-2"]');
  expect(row.querySelector('.asg-note-tip .asg-note-tip-body').textContent).toBe('One-use launcher. Kept for vehicular targets.');
  const empty=w.document.querySelector('.asg-item[data-item-id="itm-1"]');
  expect(empty.querySelector('.asg-note-tip')).toBeNull();
  const item=w.asgFindItem('itm-1').item;
  w.asgToggleNoteEditor(empty,item);
  const area=empty.querySelector('.asg-note-editor textarea');
  area.value='Scope attached.'; area.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(item.note).toBe('Scope attached.');
  w.asgToggleNoteEditor(empty,item); // closes -> re-renders with tooltip
  expect(w.document.querySelector('.asg-item[data-item-id="itm-1"] .asg-note-tip')).not.toBeNull();
 });
 it('never persists a browser copy of the workbook (online-only)', () => {
  const w=sheet();
  w.asgAddGroup();
  expect(w.localStorage.getItem('nco-asg-v1')).toBeNull();
  expect(w.AsgBackend.connected).toBe(true);
 });
});

describe('ASG HQ', () => {
 it('renders the four categories with 0-15 clamped steppers', () => {
  const w=sheet();
  const titles=Array.from(w.document.querySelectorAll('#asg-hq-grid h3')).map(h=>h.textContent);
  expect(titles).toEqual(['Supplies','Culture','Technology','Security']);
  w.asgHqSetValue('supplies',16); expect(w.asgState.hq.supplies.value).toBe(15);
  w.asgHqSetValue('supplies',-2); expect(w.asgState.hq.supplies.value).toBe(0);
  w.asgHqSetValue('supplies',12); expect(w.document.getElementById('asg-hq-supplies-value').textContent).toBe('12');
 });
 it('shows upgrade slots with hover notes', () => {
  const w=sheet();
  const rows=Array.from(w.document.querySelectorAll('#asg-hq-grid .asg-hq-col'))[0].querySelectorAll('.asg-upgrade');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('.asg-upgrade-name').value).toBe('Biolocked Armory');
  rows.forEach(r=>expect(r.querySelector('[aria-label="Delete empty upgrade"]').hidden).toBe(true)); // x hidden while a name exists
  expect(rows[1].querySelector('.asg-note-tip .asg-note-tip-body').textContent).toBe('Fits the AV and ground vehicles. Upkeep 2 SUP.');
 });
 it('parses dash-prefixed Future Upgrades lines into suggestion chips', () => {
  const w=sheet();
  expect(Array.from(w.document.querySelectorAll('#asg-future-chips .asg-chip')).map(c=>c.textContent)).toEqual(['armory','big nuclear facility']);
  const text=w.document.getElementById('asg-future-text');
  text.value='- armory\nnot a suggestion\n  - medbay\n- big nuclear facility';
  text.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(Array.from(w.document.querySelectorAll('#asg-future-chips .asg-chip')).map(c=>c.textContent)).toEqual(['armory','medbay','big nuclear facility']);
 });
 it('opens the Basebuilding page in a small window from the ? button and closes it', () => {
  const w=sheet();
  w.document.querySelector('.asg-help-btn').click();
  const modal=w.document.getElementById('asg-info-modal');
  expect(modal).not.toBeNull();
  expect(modal.querySelector('iframe').src).toBe('https://example.test/cyberpunk/rules/nc-overdrive/basebuilding/');
  expect(modal.querySelector('.asg-modal-head span').textContent).toBe('Basebuilding');
  modal.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  expect(w.document.getElementById('asg-info-modal')).toBeNull();
 });
});

describe('ASG Assignments', () => {
 it('shows crew totals per role from the roster', () => {
  const w=sheet();
  const chips=Array.from(w.document.querySelectorAll('#asg-crew-totals .asg-total-chip')).map(c=>c.textContent);
  expect(chips).toContain('Rockerboy 2'); // sample roster: Lappo + Rockerboy #1
  expect(chips).toContain('Solo 3');
  expect(chips).toContain('Netrunner 2');
 });
 it('labels unnamed NPCs as Role #N (Skill N) and named NPCs by name', () => {
  const w=sheet();
  expect(w.asgNpcLabel(w.asgRosterLookup('npc-solo-5'))).toBe('Solo #5 (Skill 0)');
  expect(w.asgNpcLabel(w.asgRosterLookup('npc-lappo'))).toBe('Lappo (Skill 3)');
  const named=w.document.querySelector('.asg-npc.named');
  expect(named.textContent).toContain('Lappo (Skill 3)');
 });
 it('orders Available by role or by skill', () => {
  const w=sheet();
  expect(w.asgSortedAvailable().map(n=>n.id)).toEqual(['npc-lawman-2','npc-rockerboy-1','npc-lappo','npc-solo-5','npc-techie-4']);
  w.asgSetOrder('skill');
  expect(w.asgSortedAvailable().map(n=>n.id)).toEqual(['npc-lappo','npc-techie-4','npc-rockerboy-1','npc-lawman-2','npc-solo-5']);
  expect(w.document.getElementById('asg-order-skill').classList.contains('asg-order-active')).toBe(true);
 });
 it('enforces project capacity 2 and gig capacity 4', () => {
  const w=sheet();
  // project proj-1 has one free slot
  expect(w.asgAssignNpc('npc-lappo','project','proj-1',null)).toBe(true);
  expect(w.asgAssignNpc('npc-rockerboy-1','project','proj-1',null)).toBe(false);
  expect(w.asgFindNpcLocation('npc-rockerboy-1').type).toBe('available');
  // gigs are full in the sample
  expect(w.asgAssignNpc('npc-rockerboy-1','gig','gig-1',null)).toBe(false);
  expect(w.asgFindNpcLocation('npc-rockerboy-1').type).toBe('available');
 });
 it('enforces gig position role requirements', () => {
  const w=sheet();
  w.asgUnassignNpc('npc-solo-1'); // frees gig-1 Pos 1 (requires Solo)
  expect(w.asgAssignNpc('npc-techie-4','gig','gig-1',0)).toBe(false); // Techie into Solo slot
  expect(w.asgFindNpcLocation('npc-techie-4').type).toBe('available');
  expect(w.asgAssignNpc('npc-solo-5','gig','gig-1',0)).toBe(true);   // Solo into Solo slot
  expect(w.asgFindNpcLocation('npc-solo-5')).toMatchObject({type:'gig',slotIndex:0});
 });
 it('returns NPCs to Available when a gig or project is deleted', () => {
  const w=sheet();
  w.asgDeleteCard('gig','gig-1');
  ['npc-solo-1','npc-netrunner-1','npc-techie-1','npc-nomad-1'].forEach(id=>{
    expect(w.asgFindNpcLocation(id).type).toBe('available');
  });
  expect(w.asgState.assignments.gigs).toHaveLength(1);
  w.asgDeleteCard('project','proj-1');
  expect(w.asgFindNpcLocation('npc-media-1').type).toBe('available');
 });
 it('creates projects and gigs with the next stable number and reorders them', () => {
  const w=sheet();
  w.asgAddGig();
  const gigs=w.asgState.assignments.gigs;
  expect(gigs[gigs.length-1].number).toBe(4); // sample gigs are #1 and #3
  expect(gigs[gigs.length-1].slots).toHaveLength(4);
  w.asgReorderCard('gig',gigs[gigs.length-1].id,'gig-1',true);
  expect(w.asgState.assignments.gigs[0].number).toBe(4);
  w.asgAddProject();
  const projects=w.asgState.assignments.projects;
  expect(projects[projects.length-1].number).toBe(2);
  expect(projects[projects.length-1].slots).toHaveLength(2);
 });
 it('renames a card and edits its short description', () => {
  const w=sheet();
  w.asgStartRename('gig','gig-1');
  const input=w.document.querySelector('.asg-card[data-card-id="gig-1"] .asg-card-name-input');
  expect(input).not.toBeNull();
  input.value='Records job'; input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));
  input.dispatchEvent(new w.Event('blur'));
  expect(w.asgState.assignments.gigs[0].name).toBe('Records job');
  expect(w.document.querySelector('.asg-card[data-card-id="gig-1"] .asg-card-label').textContent).toBe('GIG #1');
  const desc=w.document.querySelector('.asg-card[data-card-id="gig-1"] .asg-card-desc');
  desc.value='quietly'; desc.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(w.asgState.assignments.gigs[0].description).toBe('quietly');
 });
 it('double-clicking a named NPC opens its page in the small window only when linked', () => {
  const w=sheet();
  const chip=w.document.querySelector('.asg-npc[data-npc-id="npc-lappo"]');
  chip.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));
  expect(w.document.getElementById('asg-info-modal')).toBeNull(); // sample Lappo has no link
  expect(w.document.getElementById('asg-status').textContent).toContain('No webpage link set');
  w.asgRosterLookup('npc-lappo').pageUrl='https://example.test/cyberpunk/asg/lappo/';
  chip.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));
  expect(w.document.querySelector('#asg-info-modal iframe').src).toBe('https://example.test/cyberpunk/asg/lappo/');
  w.asgCloseInfo();
 });
 it('switches to play-session refresh after two close changes, and back to idle after 5 quiet minutes', () => {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true}); // jsdom defaults to prerender
  w.AsgBackend.connected=true;
  const remote={state:JSON.parse(JSON.stringify(w.asgSharedPart())), roster:w.asgState.roster};
  w.AsgBackend.load=(cb)=>cb({state:remote.state, roster:remote.roster}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgSessionMode).toBe(false); // first detected change only (lastHash starts empty)
  remote.state.hq.supplies.value=3;
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgSessionMode).toBe(true);  // two changes <5min apart
  expect(w.asgState.hq.supplies.value).toBe(3); // interface reloaded
  const realNow=w.Date.now;
  w.Date.now=()=>realNow()+6*60*1000;   // 6 quiet minutes
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgSessionMode).toBe(false);
  w.Date.now=realNow;
 });
 it('does not count the sheet\'s own saves as detected remote changes', () => {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true});
  w.AsgBackend.connected=true;
  const remote={state:JSON.parse(JSON.stringify(w.asgSharedPart())), roster:w.asgState.roster};
  w.AsgBackend.lastHash=w.asgRemoteHash(remote); // our own save already applied this state
  w.AsgBackend.load=(cb)=>cb(remote, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgSessionMode).toBe(false);
  expect(w.asgLastChangeAt).toBe(0);
 });
 it('keeps HQ upgrades across polls and applies HQ-tab upgrades on loads', async () => {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true}); // jsdom defaults to prerender
  const stripped=w.asgSharedPart();
  const upgrades={supplies:[{name:'Tab Armory',note:'from tab'}]};
  w.AsgBackend.load=(cb)=>cb({state:JSON.parse(JSON.stringify(stripped)), hqUpgrades:upgrades, roster:w.asgState.roster}, null);
  w.asgConnect();
  await Promise.resolve();
  expect(w.AsgBackend.connected).toBe(true);
  expect(w.asgState.hq.supplies.upgrades).toEqual([{name:'Tab Armory',note:'from tab'}]);
  stripped.hq.supplies.value=9;
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  await Promise.resolve();
  expect(w.asgState.hq.supplies.value).toBe(9);
  expect(w.asgState.hq.supplies.upgrades).toEqual([{name:'Tab Armory',note:'from tab'}]); // not clobbered
  expect(w.asgSharedPart().hq.supplies.upgrades).toEqual([{name:'Tab Armory',note:'from tab'}]); // upgrades stay out of the synced part
 });
 it('produces granular ops containing only the changed rows', () => {
  const w=sheet();
  const base=JSON.parse(JSON.stringify(w.asgSharedPart()));
  const ops0=w.asgDiffOps(base, w.asgSharedPart());
  expect(ops0).toEqual({}); // no edits, no ops
  w.asgState.stash.groups[0].items[0].note='updated note';
  w.asgState.hq.security.value=4;
  const ops=w.asgDiffOps(base, w.asgSharedPart());
  expect(ops.stash.upserts).toHaveLength(1);
  expect(ops.stash.upserts[0].id).toBe(w.asgState.stash.groups[0].items[0].id);
  expect(ops.stash.deletes).toEqual([]);
  expect(ops.hq).toEqual({security:4});
  expect(ops.cards).toBeUndefined();
  expect(ops.slots).toBeUndefined();
  // deleting a card deletes its card row and its slot rows
  const gigId=w.asgState.assignments.gigs[0].id;
  w.asgState.assignments.gigs.shift();
  const ops2=w.asgDiffOps(base, w.asgSharedPart());
  expect(ops2.cards.deletes).toContain(gigId);
  expect(ops2.slots.deletes).toContain(gigId+':0');
  // first save after connecting sends everything
  const ops3=w.asgDiffOps(null, base);
  expect(ops3.stash.upserts.length).toBeGreaterThan(0);
  expect(ops3.cards.upserts.length).toBeGreaterThan(0);
 });
 it('knows the scheduled play-session window in Europe/Bucharest (Tue 17:30-00:00)', () => {
  const w=sheet();
  expect(w.asgInScheduledSession(new Date('2026-11-17T19:00:00+02:00'))).toBe(true);  // Tue 19:00 EET
  expect(w.asgInScheduledSession(new Date('2026-11-17T17:29:00+02:00'))).toBe(false); // Tue just before
  expect(w.asgInScheduledSession(new Date('2026-11-17T17:30:00+02:00'))).toBe(true);  // Tue at start
  expect(w.asgInScheduledSession(new Date('2026-11-17T23:59:00+02:00'))).toBe(true);  // Tue just before midnight
  expect(w.asgInScheduledSession(new Date('2026-11-18T00:00:00+02:00'))).toBe(false); // Wednesday 00:00
  expect(w.asgInScheduledSession(new Date('2026-11-18T19:00:00+02:00'))).toBe(false); // Wednesday
  expect(w.asgInScheduledSession(new Date('2026-11-18T01:30:00+09:00'))).toBe(true);  // Tue 18:30 Bucharest, from another tz
 });
 it('keeps NPC management out of the UI (admin-only in the spreadsheet)', () => {
  const w=sheet();
  const texts=Array.from(w.document.querySelectorAll('#asg-assign-body button')).map(b=>b.textContent.toLowerCase());
  expect(texts.some(t=>t.includes('npc'))).toBe(false);
  expect(texts).toContain('+ new project');
  expect(texts).toContain('+ new gig');
 });
});

describe('ASG sync robustness (independent audit)', () => {
 function connectedClean() {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true});
  w.AsgBackend.connected=true;
  w.asgTakeSnapshot(); // current sample state is the synced base
  return w;
 }
 const clone=(o)=>JSON.parse(JSON.stringify(o));

 it('batches text keystrokes into one debounced save carrying only the final rows', () => {
  const w=connectedClean();
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); cb({state:clone(w.asgSharedPart()), roster:w.asgState.roster}, null); };
  const input=w.document.querySelector('.asg-item[data-item-id="itm-1"] .asg-item-name');
  input.value='M'; input.dispatchEvent(new w.Event('input',{bubbles:true}));
  input.value='Ma'; input.dispatchEvent(new w.Event('input',{bubbles:true}));
  input.value='Mal'; input.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(calls).toHaveLength(0); // debounce: keystrokes have not hit the network
  w.asgFlushSave();
  expect(calls).toHaveLength(1);
  const row=calls[0].stash.upserts.find(r=>r.id==='itm-1');
  expect(row.name).toBe('Mal'); // final value, not an intermediate keystroke
  w.asgFlushSave();
  expect(calls).toHaveLength(1); // nothing pending, no empty save
 });

 it('serializes saves and sends edits made during a flight as one latest-pending follow-up', () => {
  const w=connectedClean();
  const calls=[]; const pending=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); pending.push(cb); };
  w.asgState.stash.groups[0].items[0].note='first';
  w.asgSaveState(); w.asgFlushSave();
  expect(calls).toHaveLength(1);
  expect(calls[0].stash.upserts.find(r=>r.id==='itm-1').note).toBe('first');
  const responseToFirst={ state: clone(w.asgSharedPart()), roster: w.asgState.roster }; // backend applied save 1
  // more edits while save 1 is in flight
  w.asgState.stash.groups[0].items[0].note='second';
  w.asgState.hq.supplies.value=4;
  w.asgSaveState(); w.asgFlushSave();
  expect(calls).toHaveLength(1); // serialized: no parallel request
  pending[0](responseToFirst, null); // save 1 resolves
  w.asgFlushSave(); // the queued follow-up goes out now
  expect(calls).toHaveLength(2);
  const ops2=calls[1];
  expect(ops2.stash.upserts).toHaveLength(1);
  expect(ops2.stash.upserts[0].note).toBe('second');
  expect(ops2.hq).toEqual({supplies:4});
  // the save-1 response (which only knew 'first') must not regress the newer value
  expect(w.asgState.stash.groups[0].items[0].note).toBe('second');
 });

 it('defers a poll that arrives mid-save instead of racing it, then applies the fresher save response', () => {
  const w=connectedClean();
  const pending=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>pending.push(cb);
  const remote=clone(w.asgSharedPart());
  remote.hq.culture.value=1;
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  w.asgState.hq.supplies.value=5; w.asgSaveState(); w.asgFlushSave();
  expect(pending).toHaveLength(1);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer); // poll sees their change mid-flight
  expect(w.asgState.hq.culture.value).toBe(10); // not applied on top of an in-flight save
  expect(w.asgDeferredRemote).toBeTruthy();
  const merged=clone(w.asgSharedPart()); merged.hq.culture.value=1; // server applied both edits
  pending[0]({state:merged, roster:w.asgState.roster}, null);
  expect(w.asgState.hq.culture.value).toBe(1); // their edit now visible
  expect(w.asgState.hq.supplies.value).toBe(5); // ours kept
  expect(w.asgDeferredRemote).toBe(null);
 });

 it('keeps an unsaved local edit through a remote poll (rebase) and shows the remote change', () => {
  const w=connectedClean();
  const beforeEdit=clone(w.asgSharedPart()); // what the workbook actually holds
  const input=w.document.querySelector('.asg-item[data-item-id="itm-2"] .asg-item-name');
  input.value='ATGM++'; input.dispatchEvent(new w.Event('input',{bubbles:true})); // debounce still pending
  const remote=beforeEdit;
  remote.stash.groups[1].items.push({id:'itm-9', name:'Smartgun', note:''});
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgFindGroup('grp-armor').items.map(i=>i.id)).toContain('itm-9'); // remote row visible
  expect(w.asgFindItem('itm-2').item.name).toBe('ATGM++'); // unsaved local edit kept
  // and it is still queued to be written
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); cb({state:clone(w.asgSharedPart()), roster:w.asgState.roster}, null); };
  w.asgFlushSave();
  expect(calls).toHaveLength(1);
  expect(calls[0].stash.upserts.find(r=>r.id==='itm-2').name).toBe('ATGM++');
 });

 it('gates the workbook on a failed save and replays the kept edit after reconnect', () => {
  const w=connectedClean();
  const base=clone(w.asgSharedPart()); // pristine remote truth without our edit
  const pending=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>pending.push(cb);
  w.asgState.stash.groups[0].items[0].name='My Sniper';
  w.asgSaveState(); w.asgFlushSave();
  expect(pending).toHaveLength(1);
  pending[0](null, 'offline'); // save fails: the connection drops behind the gate
  expect(w.AsgBackend.connected).toBe(false);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('none');
  expect(w.document.getElementById('asg-gate').style.display).toBe('');
  expect(w.asgState.stash.groups[0].items[0].name).toBe('My Sniper'); // edit kept in memory
  expect(w.document.getElementById('asg-status').textContent).toContain('Shared save failed');
  // reconnect: a fresh authenticated load lifts the gate and the pending edit replays
  w.AsgBackend.load=(cb)=>cb({state:base, roster:w.asgState.roster}, null);
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); cb({state:clone(w.asgSharedPart()), roster:w.asgState.roster}, null); };
  w.asgAttemptReconnect();
  expect(w.AsgBackend.connected).toBe(true);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('');
  expect(w.asgState.stash.groups[0].items[0].name).toBe('My Sniper'); // poll did not clobber it
  expect(calls).toHaveLength(1); // the retry writes exactly the failed row
  expect(calls[0].stash.upserts).toHaveLength(1);
  expect(calls[0].stash.upserts[0].name).toBe('My Sniper');
 });

 it('keeps typing focus and caret across a remote re-render', () => {
  const w=connectedClean();
  const input=w.document.querySelector('.asg-item[data-item-id="itm-1"] .asg-item-name');
  input.focus();
  input.setSelectionRange(2,2);
  expect(w.document.activeElement).toBe(input);
  const remote=clone(w.asgSharedPart());
  remote.stash.groups[0].items[1].name='Changed elsewhere';
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  const again=w.document.activeElement;
  expect(again && again.getAttribute('data-asg-key')).toBe('item-itm-1-name');
  expect(again.selectionStart).toBe(2);
  expect(again.value).toBe('Malorian Heavy Sniper'); // our field untouched by their edit
  expect(w.asgFindItem('itm-2').item.name).toBe('Changed elsewhere'); // their edit rendered
 });

 it('clears the roster (and Available) when the remote roster is empty', () => {
  const w=connectedClean();
  const remote=clone(w.asgSharedPart());
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:[]}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgState.roster).toEqual([]); // sample data does not survive an empty remote roster
  expect(w.asgState.assignments.available).toEqual([]);
 });

 it('counts occupied slots toward capacity (roster-missing NPC, gig role) but never empty ones', () => {
  const w=connectedClean();
  const proj=w.asgBuildCard('project', {id:'proj-x', number:7, name:'P', description:'', slots:['npc-ghost', null]});
  expect(proj.querySelector('.asg-card-cap').textContent).toBe('1/2');
  expect(proj.textContent).toContain('unknown NPC');
  const gig=w.asgBuildCard('gig', {id:'gig-x', number:8, name:'G', description:'', slots:[null, {role:'Solo', npc:null}, null, null]});
  expect(gig.querySelector('.asg-card-cap').textContent).toBe('1/4'); // role-required slot is occupied
  const empty=w.asgBuildCard('gig', {id:'gig-y', number:9, name:'G2', description:'', slots:[null, null, null, null]});
  expect(empty.querySelector('.asg-card-cap').textContent).toBe('0/4');
 });

 it('warns once (not silently) about assignments to NPCs missing from the roster', () => {
  const w=connectedClean();
  const remote=clone(w.asgSharedPart());
  remote.assignments.projects[0].slots[0]='npc-ghost';
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  const status=w.document.getElementById('asg-status').textContent;
  expect(status).toContain('Workbook warning');
  expect(status).toContain('missing from the roster');
  w.document.getElementById('asg-status').textContent='';
  w.asgMergeRemoteState({state:remote, roster:w.asgState.roster}); // same data again
  expect(w.document.getElementById('asg-status').textContent).toBe(''); // not re-flashed
 });

 it('surfaces backend-reported workbook warnings once', () => {
  const w=connectedClean();
  const remote=clone(w.asgSharedPart());
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster, warnings:['2 assignment row(s) point at deleted cards - clean them in the Assignment Slots tab']}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.document.getElementById('asg-status').textContent).toContain('deleted cards');
 });

 it('maps a 429 from the password gate to a rate-limit message, not a wrong-password message', async () => {
  const w=rawSheet();
  w.AsgBackend.load=(cb)=>cb(null,'rate_limited');
  w.asgPassword='whatever';
  w.asgConnect();
  await Promise.resolve();
  expect(w.document.getElementById('asg-backend-status').textContent).toContain('Too many attempts');
  expect(w.document.getElementById('asg-backend-status').textContent).not.toContain('password');
  expect(w.AsgBackend.connected).toBe(false);
 });
});


describe('ASG reaudit repairs (R1 transient editors, R2 rejection reconcile)', () => {
 function connectedClean2() {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true});
  w.AsgBackend.connected=true;
  w.asgTakeSnapshot();
  return w;
 }
 const clone2=(o)=>JSON.parse(JSON.stringify(o));

 it('R1: the open note editor (text, focus, caret) survives its own debounced save', () => {
  const w=connectedClean2();
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); cb({state:clone2(w.asgSharedPart()), roster:w.asgState.roster}, null); };
  const row=w.document.querySelector('.asg-item[data-item-id="itm-1"]');
  w.asgToggleNoteEditor(row, w.asgFindItem('itm-1').item);
  const area=row.querySelector('.asg-note-editor textarea');
  expect(area).toBeTruthy();
  area.value='weak to EMP'; area.dispatchEvent(new w.Event('input',{bubbles:true}));
  area.focus(); area.setSelectionRange(4,4);
  w.asgFlushSave(); // save response re-renders the page
  expect(calls).toHaveLength(1);
  const area2=w.document.querySelector('.asg-item[data-item-id="itm-1"] .asg-note-editor textarea');
  expect(area2).toBeTruthy(); // editor recreated, not destroyed
  expect(area2.value).toBe('weak to EMP');
  expect(w.document.activeElement).toBe(area2);
  expect(area2.selectionStart).toBe(4);
 });

 it('R1: the open note editor survives a remote poll re-render', () => {
  const w=connectedClean2();
  const row=w.document.querySelector('.asg-item[data-item-id="itm-1"]');
  w.asgToggleNoteEditor(row, w.asgFindItem('itm-1').item);
  const remote=clone2(w.asgSharedPart()); // before our local typing
  remote.hq.culture.value=3; // someone else's change
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  const area=row.querySelector('.asg-note-editor textarea');
  area.value='half typed'; area.dispatchEvent(new w.Event('input',{bubbles:true}));
  area.focus(); area.setSelectionRange(5,5);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  const area2=w.document.querySelector('.asg-item[data-item-id="itm-1"] .asg-note-editor textarea');
  expect(area2).toBeTruthy();
  expect(area2.value).toBe('half typed'); // unsaved note text kept
  expect(w.document.activeElement).toBe(area2);
  expect(area2.selectionStart).toBe(5);
  expect(w.asgState.hq.culture.value).toBe(3); // their change applied
 });

 it('R1: an in-progress card rename (uncommitted text + focus) survives a remote apply', () => {
  const w=connectedClean2();
  w.asgStartRename('project', 'proj-1');
  const input=w.document.querySelector('.asg-card[data-card-id="proj-1"] .asg-card-name-input');
  expect(input).toBeTruthy();
  const remote=clone2(w.asgSharedPart()); // rename not committed: remote still has the old name
  remote.hq.culture.value=4;
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  input.value='Rescue Lappo'; input.dispatchEvent(new w.Event('input',{bubbles:true}));
  input.focus(); input.setSelectionRange(3,3);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  const again=w.document.querySelector('.asg-card[data-card-id="proj-1"] .asg-card-name-input');
  expect(again).toBeTruthy(); // rename input recreated
  expect(again.value).toBe('Rescue Lappo'); // uncommitted text survived
  expect(w.document.activeElement).toBe(again);
  expect(again.selectionStart).toBe(3);
  expect(w.asgState.assignments.projects[0].name).toBe('New project'); // still uncommitted
  again.blur(); // commit
  expect(w.asgState.assignments.projects[0].name).toBe('Rescue Lappo');
 });

 it('R2: concurrent same-NPC loser reverts the rejected action, keeps unrelated pending edits, never retries', () => {
  const w=connectedClean2();
  const serverTruth=clone2(w.asgLoadedSnapshot); // the workbook as it stands; someone else won the NPC
  const pending=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>pending.push(cb);
  w.asgState.assignments.projects[0].slots[1]='npc-lappo'; // our losing action
  w.asgSaveState(); w.asgFlushSave();
  expect(pending).toHaveLength(1);
  w.asgState.stash.groups[0].items[0].name='Sniper+'; // unrelated edit during the flight
  w.asgSaveState();
  pending[0]({state:serverTruth, roster:w.asgState.roster}, 'invariant'); // rejected: NPC already assigned elsewhere
  expect(w.asgState.assignments.projects[0].slots[1]).toBe(null); // rejected action reverted to server truth
  expect(w.asgState.stash.groups[0].items[0].name).toBe('Sniper+'); // unrelated pending edit kept
  expect(w.document.getElementById('asg-status').textContent).toContain('rejected');
  expect(w.asgSaveRetryTimer).toBe(null); // permanent code: no retry loop
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); cb({state:clone2(w.asgSharedPart()), roster:w.asgState.roster}, null); };
  w.asgFlushSave(); // the surviving edit still goes out
  expect(calls).toHaveLength(1);
  expect(calls[0].stash.upserts.find(r=>r.id==='itm-1').name).toBe('Sniper+');
  expect(calls[0].slots).toBeUndefined(); // the rejected assignment is not retried
 });

 it('R2: invalid_ops without fresh state does not retry and leaves local edits alone', () => {
  const w=connectedClean2();
  const pending=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>pending.push(cb);
  w.asgState.hq.supplies.value=3; w.asgSaveState(); w.asgFlushSave();
  expect(pending).toHaveLength(1);
  pending[0](null, 'invalid_ops'); // defensive path: no fresh state to reconcile against
  expect(w.asgState.hq.supplies.value).toBe(3); // local edit untouched
  expect(w.document.getElementById('asg-status').textContent).toContain('rejected');
  expect(w.asgSaveRetryTimer).toBe(null); // no retry loop
 });

});

describe('ASG online-only gate (owner direction 2026-11-19)', () => {
 it('boots blank behind the gate and asks for the password', () => {
  const w=rawSheet();
  expect(w.document.getElementById('asg-gate').style.display).toBe('');
  expect(w.document.getElementById('asg-workbook').style.display).toBe('none');
  expect(w.document.getElementById('asg-gigs-list').children).toHaveLength(0); // nothing rendered
  expect(w.prompt).toHaveBeenCalled(); // asked on every page opening
  expect(w.AsgBackend.connected).toBe(false);
 });

 it('purges a browser copy saved by an older version on boot', () => {
  const dom = new JSDOM(readFileSync('src/site/img/NCO-sheet.html','utf8'), { runScripts:'dangerously', url:'https://example.test/cyberpunk/img/NCO-sheet.html', beforeParse(w) { w.confirm=()=>true; w.alert=vi.fn(); w.prompt=()=>null; try { w.localStorage.setItem('nco-asg-v1','{"stash":{}}'); } catch (_) {} } });
  windows.push(dom.window);
  expect(dom.window.localStorage.getItem('nco-asg-v1')).toBeNull();
 });

 it('stays gated when the prompt is cancelled; the gate button asks again', () => {
  const w=rawSheet();
  expect(w.AsgBackend.connected).toBe(false);
  w.document.getElementById('asg-gate-connect-btn').click();
  expect(w.prompt).toHaveBeenCalledTimes(2);
 });

 it('refused password leaves the gate up with the real reason', () => {
  const w=rawSheet('pw');
  w.AsgBackend.load=(cb)=>cb(null,'bad_password');
  w.asgConnect();
  expect(w.AsgBackend.connected).toBe(false);
  expect(w.document.getElementById('asg-gate-reason').textContent).toContain('refused that password');
  expect(w.document.getElementById('asg-workbook').style.display).toBe('none');
 });

 it('unreachable backend says so instead of blaming the password', () => {
  const w=rawSheet('pw');
  w.AsgBackend.load=(cb)=>cb(null,'offline');
  w.asgConnect();
  expect(w.document.getElementById('asg-gate-reason').textContent).toContain('unreachable');
  expect(w.document.getElementById('asg-gate-reason').textContent).not.toContain('password');
 });

 it('a fresh authenticated load lifts the gate and renders the workbook', () => {
  const w=rawSheet();
  w.AsgBackend.load=(cb)=>cb(sampleRemote(), null);
  w.asgConnect();
  expect(w.AsgBackend.connected).toBe(true);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('');
  expect(w.document.getElementById('asg-gate').style.display).toBe('none');
  expect(w.document.querySelectorAll('.asg-card').length).toBeGreaterThan(0);
  w.clearTimeout(w.asgRefreshTimer);
 });

 it('disconnect hides the workbook again and keeps nothing in storage', () => {
  const w=sheet();
  w.asgConnectClick(); // connected -> disconnect
  expect(w.AsgBackend.connected).toBe(false);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('none');
  expect(w.document.getElementById('asg-gate').style.display).toBe('');
  expect(w.localStorage.getItem('nco-asg-v1')).toBeNull();
 });

 it('opening a character re-gates the workbook and asks the password again', () => {
  const w=sheet();
  expect(w.AsgBackend.connected).toBe(true);
  w.prompt.mockClear();
  w.asgOnCharacterOpened();
  expect(w.AsgBackend.connected).toBe(false);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('none');
  expect(w.prompt).toHaveBeenCalledTimes(1);
 });

 it('a failed poll drops the workbook behind the gate until a fresh load succeeds', () => {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true});
  w.AsgBackend.load=(cb)=>cb(null,'offline');
  w.asgPollRefresh();
  expect(w.AsgBackend.connected).toBe(false);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('none');
  w.AsgBackend.load=(cb)=>cb(sampleRemote(), null);
  w.asgAttemptReconnect();
  expect(w.AsgBackend.connected).toBe(true);
  expect(w.document.getElementById('asg-workbook').style.display).toBe('');
  w.clearTimeout(w.asgRefreshTimer);
 });

 it('a refused password on reconnect clears it and asks for it again', () => {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true});
  w.asgPassword='stale';
  w.AsgBackend.load=(cb)=>cb(null,'bad_password');
  w.asgPollRefresh();
  expect(w.AsgBackend.connected).toBe(false);
  w.asgAttemptReconnect();
  expect(w.asgPassword).toBe('');
  expect(w.document.getElementById('asg-gate-reason').textContent).toContain('enter it again');
 });
});

describe('ASG gig history', () => {
 it('shows completed gigs with result and description', () => {
  const w=sheet();
  w.AsgBackend.request=(payload,cb)=>cb({ history:[
    { name:'Data heist', description:'line one\nline two', result:'failed' },
    { name:'Records job', description:'', result:'success' },
    { name:'Rolled job', description:'', result:'complications', roll:6, bonus:3, difficulty:1, total:8 },
    { name:'Blown job', description:'', result:'disaster', roll:1, bonus:0, difficulty:2, total:-1 }
  ], historyVersion:2 }, null);
  w.document.getElementById('asg-history-btn').click();
  const items=w.document.querySelectorAll('#asg-history-panel .asg-history-item');
  expect(items).toHaveLength(4);
  expect(items[0].querySelector('.asg-history-name').textContent).toBe('Data heist');
  expect(items[0].querySelector('.asg-history-result').textContent).toBe('Failure');
  expect(items[0].querySelector('.asg-history-roll')).toBeNull(); // older rows have no roll
  expect(items[0].querySelector('.asg-history-desc').textContent).toBe('line one\nline two');
  expect(items[1].querySelector('.asg-history-result').textContent).toBe('Success');
  expect(items[1].querySelector('.asg-history-desc')).toBeNull(); // no empty description block
  expect(items[2].querySelector('.asg-history-result').textContent).toBe('Success with complications');
  expect(items[2].querySelector('.asg-history-roll').textContent).toBe('d10 6 + crew 3 - difficulty 1 = 8');
  expect(items[3].querySelector('.asg-history-result').textContent).toBe('Disaster');
  expect(items[3].querySelector('.asg-history-roll').textContent).toBe('d10 1 + crew 0 - difficulty 2 = -1');
 });
 it('flashes a deploy hint on an old backend instead of fetching', () => {
  const w=sheet();
  w.AsgBackend.historyVersion=0;
  let called=0; w.AsgBackend.request=(p,cb)=>{ called++; cb({history:[]},null); };
  w.document.getElementById('asg-history-btn').click();
  expect(called).toBe(0);
  expect(w.document.getElementById('asg-status').textContent).toContain('needs the updated backend');
 });
 it('shows an empty note when no gigs are recorded and toggles closed', () => {
  const w=sheet();
  w.AsgBackend.request=(p,cb)=>cb({history:[], historyVersion:1}, null);
  w.document.getElementById('asg-history-btn').click();
  expect(w.document.getElementById('asg-history-panel').textContent).toContain('No completed gigs recorded yet');
  w.document.getElementById('asg-history-btn').click();
  expect(w.document.getElementById('asg-history-panel').style.display).toBe('none');
 });
});

describe('ASG multiline descriptions', () => {
 it('gig and project descriptions are auto-height textareas, not single-line inputs', () => {
  const w=sheet();
  const desc=w.document.querySelector('.asg-card[data-card-id="gig-1"] .asg-card-desc');
  expect(desc.tagName).toBe('TEXTAREA');
  desc.value='first line\nsecond line';
  desc.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(w.asgState.assignments.gigs[0].description).toBe('first line\nsecond line');
  expect(desc.style.height).not.toBe(''); // auto-height applied on typing
  desc.style.height='';
  w.dispatchEvent(new w.Event('resize'));
  expect(desc.style.height).not.toBe(''); // and on window resize
 });
 it('multiline descriptions survive the save ops round-trip', () => {
  const w=sheet();
  w.asgState.assignments.gigs[0].description='a\nb';
  const ops=w.asgDiffOps(w.asgLoadedSnapshot, w.asgSharedPart());
  const row=ops.cards.upserts.find(r=>r.id==='gig-1');
  expect(row.description).toBe('a\nb');
 });
});

describe('ASG completed gigs and projects', () => {
 const clone=(o)=>JSON.parse(JSON.stringify(o));
 function connected() {
  const w=sheet();
  Object.defineProperty(w.document, 'hidden', {get:()=>false, configurable:true});
  w.AsgBackend.connected=true;
  w.AsgBackend.completionVersion=3;
  w.asgTakeSnapshot();
  return w;
 }
 it('lists Gigs before Projects and gives every card a Completed button', () => {
  const w=sheet();
  const heads=Array.from(w.document.querySelectorAll('.asg-assign-grid > .asg-col h3')).map(h=>h.firstChild.textContent.trim());
  expect(heads).toEqual(['Available','Gigs','Projects']);
  const cards=w.document.querySelectorAll('.asg-card');
  expect(cards.length).toBeGreaterThan(0);
  cards.forEach(c=>expect(c.querySelector('[title="Completed"]')).not.toBeNull());
 });
 it('asks for a difficulty (default 1) instead of successful or failed, and Cancel changes nothing', () => {
  const w=connected();
  const calls=[]; w.AsgBackend.saveWithOps=(ops,cb)=>calls.push(ops);
  w.document.querySelector('.asg-card.asg-gig [title="Completed"]').click();
  const ask=w.document.querySelector('.asg-complete-ask');
  expect(ask.textContent).not.toContain('Successful');
  const sel=ask.querySelector('.asg-difficulty');
  expect(Array.from(sel.options).map(o=>o.value)).toEqual(['0','1','2','3','4','5']);
  expect(sel.value).toBe('1');
  ask.querySelector('[data-result="cancel"]').click();
  expect(w.document.querySelector('.asg-complete-ask')).toBeNull();
  expect(calls).toHaveLength(0);
 });
 it('keeps the chosen difficulty across a re-render', () => {
  const w=connected();
  const gig=w.asgState.assignments.gigs[0];
  w.asgAskComplete('gig', gig.id);
  const sel=w.document.querySelector('.asg-complete-ask .asg-difficulty');
  sel.value='4'; sel.dispatchEvent(new w.Event('change',{bubbles:true}));
  w.asgRenderAssignments();
  expect(w.document.querySelector('.asg-complete-ask .asg-difficulty').value).toBe('4');
 });
 it('maps every total to its outcome', () => {
  const w=connected();
  const cases=[[13,'success'],[10,'success'],[9,'complications'],[7,'complications'],[6,'failed'],[4,'failed'],[3,'disaster'],[0,'disaster'],[-4,'disaster']];
  cases.forEach(([t,o])=>expect(w.asgOutcomeForTotal(t)).toBe(o));
 });
 function complete(w, kind, card, difficulty, roll, answer) {
  w.asgRollD10=()=>roll;
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); const shared=clone(w.asgSharedPart()); const key=kind==='gig'?'gigs':'projects'; shared.assignments[key]=shared.assignments[key].filter(c=>c.id!==card.id); cb({state:shared, roster:w.asgState.roster, completionVersion:3, completed:Object.assign({id:card.id,status:'done'}, answer||{result:ops.complete.result})}, null); };
  w.asgCompleteCard(kind, card.id, difficulty);
  return calls;
 }
 it('rolling a gig sends the d10, crew bonus, difficulty, total and outcome in one completion, and removes it only after confirmation', () => {
  const w=connected();
  const gig=w.asgState.assignments.gigs[0];
  const npcs=gig.slots.map(s=>s.npc).filter(Boolean);
  const bonus=npcs.reduce((n,id)=>n+w.asgRosterLookup(id).skill,0);
  const calls=complete(w,'gig',gig,2,6);
  expect(calls).toHaveLength(1);
  const total=6+bonus-2;
  expect(calls[0].complete).toMatchObject({ id: gig.id, kind: 'gig', name: gig.name, roll: 6, bonus, difficulty: 2, total, result: w.asgOutcomeForTotal(total) });
  expect(calls[0].complete.crew.length).toBe(npcs.length);
  expect(JSON.stringify(calls[0])).not.toContain('"deletes":["'+gig.id);
  expect(w.asgState.assignments.gigs.some(c=>c.id===gig.id)).toBe(false);
  npcs.forEach(id=>expect(w.asgState.assignments.available).toContain(id));
  expect(w.document.getElementById('asg-status').textContent).toContain('d10 6 + crew '+bonus+' - difficulty 2 = '+total);
 });
 it('counts only occupied slots toward the crew bonus and works for projects', () => {
  const w=connected();
  const proj=w.asgState.assignments.projects[0];
  const ids=proj.slots.filter(Boolean);
  const bonus=ids.reduce((n,id)=>n+w.asgRosterLookup(id).skill,0);
  const calls=complete(w,'project',proj,0,10);
  expect(calls[0].complete).toMatchObject({ kind:'project', roll:10, bonus, difficulty:0, total:10+bonus, result:'success' });
 });
 it('rejects an invalid difficulty before any save', () => {
  const w=connected();
  const proj=w.asgState.assignments.projects[0];
  const calls=complete(w,'project',proj,9,5);
  expect(calls).toHaveLength(0);
  expect(w.asgState.assignments.projects.some(c=>c.id===proj.id)).toBe(true);
 });
 it('reports when the backend kept an earlier recorded result', () => {
  const w=connected();
  const proj=w.asgState.assignments.projects[0];
  complete(w,'project',proj,1,10,{result:'failed',roll:2,bonus:0,difficulty:1,total:1});
  const msg=w.document.getElementById('asg-status').textContent;
  expect(msg).toContain('already recorded as Failure');
  expect(msg).toContain('d10 2 + crew 0 - difficulty 1 = 1');
 });
 it('an unconfirmed save keeps the card, says it may still finish, and gates until a fresh load', () => {
  const w=connected();
  const proj=w.asgState.assignments.projects[0];
  w.AsgBackend.saveWithOps=(ops,cb)=>cb(null,'offline');
  w.asgCompleteCard('project', proj.id, 1);
  expect(w.asgState.assignments.projects.some(c=>c.id===proj.id)).toBe(true); // card kept
  const msg=w.document.getElementById('asg-status').textContent;
  expect(msg).toContain('not confirmed'); expect(msg).toContain('may still finish');
  expect(w.AsgBackend.connected).toBe(false); // gated until a fresh load
  let loads=0; w.AsgBackend.load=(cb)=>{ loads++; cb({state:clone(w.asgSharedPart()), roster:w.asgState.roster, completionVersion:3}, null); };
  w.asgAttemptReconnect();
  expect(loads).toBe(1); // the confirming refresh happens on reconnect
  expect(w.AsgBackend.connected).toBe(true);
  w.clearTimeout(w.asgRefreshTimer);
 });
 it('refuses without a connected workbook or without a journaling backend, before any save', () => {
  const w=sheet();
  const calls=[]; w.AsgBackend.saveWithOps=(ops,cb)=>calls.push(ops);
  const proj=w.asgState.assignments.projects[0];
  w.AsgBackend.connected=false;
  w.asgCompleteCard('project', proj.id, 1); // not connected
  w.AsgBackend.connected=true; w.asgTakeSnapshot();
  w.AsgBackend.completionVersion=2;
  w.asgCompleteCard('project', proj.id, 1); // older script: no completionVersion 3
  expect(calls).toHaveLength(0);
  expect(w.asgState.assignments.projects.some(c=>c.id===proj.id)).toBe(true);
 });
});

describe('stash columns, editable upgrade slots, and occupied position labels', () => {
 function upgraded(w) {
  w.asgState.hq.supplies.upgrades=[{id:'u-a',name:'Armory',note:'old'},{id:'u-b',name:'Garage',note:''}];
  w.asgState.hq.culture.upgrades=[{id:'u-c',name:'Studio',note:''}];
  w.AsgBackend.upgradeEditVersion=1;
  w.asgRenderHq();
 }
 it('uses responsive column layout and hides Pos only for assigned NPC slots', () => {
  const w=sheet();
  expect(w.document.querySelector('style').textContent).toContain('repeat(auto-fit, minmax(min(100%, 330px), 1fr))');
  w.document.querySelectorAll('.asg-slot').forEach(slot=>{
   if(slot.querySelector('.asg-npc-chip')) expect(slot.querySelector('.asg-slot-pos')).toBeNull();
  });
  expect(w.document.querySelectorAll('.asg-slot-pos').length).toBeGreaterThan(0);
 });
 it('adds, renames, notes and explicitly deletes only name-empty slots, even with notes', () => {
  const w=sheet();upgraded(w);
  w.asgAddUpgrade('supplies'); const list=w.asgState.hq.supplies.upgrades, u=list.at(-1);
  expect(w.document.activeElement.getAttribute('data-asg-key')).toBe('upgrade-'+u.id);
  u.name='Keep';u.note='valuable';w.asgDeleteUpgrade('supplies',u.id);expect(list).toHaveLength(3);
  const name=w.document.querySelector('[data-asg-key="upgrade-'+u.id+'"]');
  const del=()=>w.document.querySelector('[data-upgrade-id="'+u.id+'"] [aria-label="Delete empty upgrade"]');
  expect(del().hidden).toBe(false); // empty name -> x visible
  name.value='Keep';name.dispatchEvent(new w.Event('input'));expect(del().hidden).toBe(true); // text -> x hidden
  name.value='';name.dispatchEvent(new w.Event('input'));expect(del().hidden).toBe(false);
  expect(list).toHaveLength(3); // never auto-delete on clear/blur
  w.asgDeleteUpgrade('supplies',u.id);expect(list).toHaveLength(2);
  const row=w.document.querySelector('[data-upgrade-id="u-a"]');row.querySelector('[aria-label="Edit upgrade hover note"]').click();
  const area=w.document.querySelector('[data-asg-key="upgrade-note-u-a"]');area.value='new note';area.dispatchEvent(new w.Event('input'));
  expect(w.asgState.hq.supplies.upgrades[0].note).toBe('new note');
  w.asgRenderHq();expect(w.document.querySelector('[data-asg-key="upgrade-note-u-a"]').value).toBe('new note');
 });
 it('blocks editing on old backends but preserves upgrade display', () => {
  const w=sheet();upgraded(w);w.AsgBackend.connected=true;w.AsgBackend.upgradeEditVersion=0;w.asgRenderHq();
  expect(w.document.querySelector('.asg-upgrade-name').disabled).toBe(true);
  expect(w.document.querySelector('.asg-upgrade-name').value).toBe('Armory');
  w.asgAddUpgrade('supplies');expect(w.asgState.hq.supplies.upgrades).toHaveLength(2);
  expect(w.document.querySelector('.asg-upgrade-add').disabled).toBe(true);
 });
 it('reorders only within category and supports keyboard alternative', () => {
  const w=sheet();upgraded(w);w.asgMoveUpgrade('supplies','u-a','u-c',false);
  expect(w.asgState.hq.supplies.upgrades.map(u=>u.id)).toEqual(['u-a','u-b']);
  w.document.querySelector('[data-upgrade-id="u-b"] .asg-upgrade-grip').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  expect(w.asgState.hq.supplies.upgrades.map(u=>u.id)).toEqual(['u-b','u-a']);
 });
 it('rebases pending notes around a concurrent rename of another ID and sends granular rows', () => {
  const w=sheet();upgraded(w);w.AsgBackend.connected=true;w.asgTakeSnapshot();
  w.asgState.hq.supplies.upgrades[0].note='pending';
  const remote=JSON.parse(JSON.stringify(w.asgLoadedSnapshot));remote.hq.supplies.upgrades[1].name='Remote Garage';
  w.asgMergeRemoteState({state:remote,upgradeEditVersion:1});
  expect(w.asgState.hq.supplies.upgrades[0].note).toBe('pending');
  expect(w.asgState.hq.supplies.upgrades[1].name).toBe('Remote Garage');
  const ops=w.asgDiffOps(w.asgLoadedSnapshot,w.asgSharedPart());expect(ops.upgrades.upserts).toHaveLength(1);expect(ops.upgrades.upserts[0].id).toBe('u-a');
 });
 it('does not silently submit upgrades after backend capability disappears', () => {
  const w=sheet();upgraded(w);w.AsgBackend.connected=true;w.asgTakeSnapshot();w.asgState.hq.supplies.upgrades[0].name='Pending';
  w.AsgBackend.upgradeEditVersion=0;w.AsgBackend.saveWithOps=vi.fn();w.asgFlushSave();
  expect(w.AsgBackend.saveWithOps).not.toHaveBeenCalled();expect(w.document.getElementById('asg-status').textContent).toContain('updated backend');
 });
});

describe('nested edgerunner drag ownership',()=>{
 it('does not let assigned NPC drag bubble into dragging its parent card',()=>{
  const w=sheet(); const chip=w.document.querySelector('.asg-card .asg-npc');expect(chip).toBeTruthy();
  const grip=chip.querySelector('.asg-drag-grip');grip.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true}));
  const event=new w.Event('dragstart',{bubbles:true});event.dataTransfer={effectAllowed:'',setData:vi.fn()};chip.dispatchEvent(event);
  expect(w.asgDragPayload).toEqual({kind:'asg-npc',id:chip.dataset.npcId});
  expect(chip.closest('.asg-card').classList.contains('dragging')).toBe(false);
 });
 it('moves between compatible empty slots and restores origin for occupied/incompatible targets',()=>{
  const w=sheet();const npc=w.asgState.roster.find(n=>n.id==='npc-solo-1');expect(npc).toBeTruthy();
  w.asgUnassignNpc(npc.id);const project=w.asgState.assignments.projects[0];project.slots=[null,null];
  w.asgAssignNpc(npc.id,'project',project.id,0);expect(project.slots[0]).toBe(npc.id);
  const gig=w.asgState.assignments.gigs[0];gig.slots[0]={role:'Solo',npc:''};
  expect(w.asgAssignNpc(npc.id,'gig',gig.id,0)).toBe(true);expect(project.slots[0]).toBeNull();
  project.slots[0]='npc-techie-1';expect(w.asgAssignNpc(npc.id,'project',project.id,0)).toBe(false);expect(gig.slots[0].npc).toBe(npc.id);
 });
});

describe('approved assignment swaps and unassignment',()=>{
 it('swaps occupied positions only inside same card with compatible roles; rejects cross-card displacement',()=>{
  const w=sheet();const project=w.asgState.assignments.projects[0];
  const a='npc-solo-1',b='npc-techie-1';w.asgUnassignNpc(a);w.asgUnassignNpc(b);
  project.slots=[a,b];w.asgState.assignments.available=w.asgState.assignments.available.filter(id=>id!==a&&id!==b);
  expect(w.asgAssignNpc(a,'project',project.id,1)).toBe(true);expect(project.slots).toEqual([b,a]);
  const gig=w.asgState.assignments.gigs[0];gig.slots=[{role:'Solo',npc:a},{role:'Techie',npc:b},{role:'',npc:''},{role:'',npc:''}];project.slots=[null,null];
  expect(w.asgAssignNpc(a,'gig',gig.id,1)).toBe(false);expect(gig.slots[0].npc).toBe(a);
  gig.slots[0].role='';gig.slots[1].role='';expect(w.asgAssignNpc(a,'gig',gig.id,1)).toBe(true);expect(gig.slots[0].npc).toBe(b);
  project.slots[0]='npc-media-1';expect(w.asgAssignNpc(a,'project',project.id,0)).toBe(false);expect(gig.slots[1].npc).toBe(a);
 });
 it('drop back into Available unassigns without removing roster person; outside drop changes nothing',()=>{
  const w=sheet(),npc=w.asgState.roster.find(n=>n.id==='npc-solo-1');const roster=w.asgState.roster.length;
  const before=JSON.stringify(w.asgState.assignments);const outside=new w.Event('drop',{bubbles:true});w.document.body.dispatchEvent(outside);expect(JSON.stringify(w.asgState.assignments)).toBe(before);
  w.asgDragPayload={kind:'asg-npc',id:npc.id};const drop=new w.Event('drop',{bubbles:true,cancelable:true});w.document.getElementById('asg-available-col').dispatchEvent(drop);
  expect(w.asgState.assignments.available).toContain(npc.id);expect(w.asgState.roster).toHaveLength(roster);expect(w.asgRosterLookup(npc.id)).toBeTruthy();
 });
});
