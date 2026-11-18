import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, afterEach } from 'vitest';
const windows = [];
function sheet() {
  const dom = new JSDOM(readFileSync('src/site/img/NCO-sheet.html','utf8'), { runScripts:'dangerously', url:'https://example.test/cyberpunk/img/NCO-sheet.html', beforeParse(w) { w.confirm=()=>true; w.alert=vi.fn(); w.prompt=()=>null; } });
  windows.push(dom.window);
  return dom.window;
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
 it('persists stash edits to the browser-local draft', () => {
  const w=sheet();
  w.asgAddGroup();
  const raw=JSON.parse(w.localStorage.getItem('nco-asg-v1'));
  expect(raw.stash.groups).toHaveLength(4);
  expect(w.AsgBackend.connected).toBe(false); // unconfigured backend: local only
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
  expect(rows[0].textContent).toContain('Biolocked Armory');
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
  expect(w.asgSharedPart().hq.supplies.upgrades).toBeUndefined(); // upgrades stay out of the synced part
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

 it('keeps failed saves local, schedules a retry, and never lets a poll clobber them', () => {
  const w=connectedClean();
  const base=clone(w.asgSharedPart()); // pristine remote truth without our edit
  const pending=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>pending.push(cb);
  w.asgState.stash.groups[0].items[0].name='My Sniper';
  w.asgSaveState(); w.asgFlushSave();
  expect(pending).toHaveLength(1);
  pending[0](null, 'offline'); // save fails
  expect(w.asgState.stash.groups[0].items[0].name).toBe('My Sniper'); // edit kept locally
  expect(w.document.getElementById('asg-status').textContent).toContain('Shared save failed');
  expect(w.asgSaveRetryTimer).toBeTruthy(); // retry scheduled
  w.clearTimeout(w.asgSaveRetryTimer);
  const remote=clone(base); remote.hq.culture.value=2; // someone else's change meanwhile
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  w.asgPollRefresh(); w.clearTimeout(w.asgRefreshTimer);
  expect(w.asgState.stash.groups[0].items[0].name).toBe('My Sniper'); // poll did not clobber it
  expect(w.asgState.hq.culture.value).toBe(2); // their change applied around it
  const calls=[];
  w.AsgBackend.saveWithOps=(ops,cb)=>{ calls.push(ops); cb({state:clone(w.asgSharedPart()), roster:w.asgState.roster}, null); };
  w.asgFlushSave(); // retry path writes exactly the failed row
  expect(calls).toHaveLength(1);
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
  const w=sheet();
  w.AsgBackend.load=(cb)=>cb(null,'rate_limited');
  w.asgPassword='whatever';
  w.asgConnect();
  await Promise.resolve();
  expect(w.document.getElementById('asg-backend-status').textContent).toContain('Too many wrong password attempts');
  expect(w.AsgBackend.connected).toBe(false);
 });
});


describe('ASG reaudit repairs (R1 transient editors, R2 rejection reconcile, R4 connect confirm)', () => {
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

 it('R4: connect asks before replacing a diverging browser-local draft; declining keeps it', async () => {
  const w=sheet();
  w.localStorage.setItem('nco-asg-v1', JSON.stringify(w.asgState)); // a saved draft exists
  const remote={ state: { stash: {groups: []}, hq: { supplies:{value:1}, culture:{value:0}, technology:{value:0}, security:{value:0}, futureUpgrades:'' }, assignments: { projects: [], gigs: [] } }, roster: [] };
  w.AsgBackend.load=(cb)=>cb(remote, null);
  w.confirm=()=>false;
  w.asgPassword='pw';
  w.asgConnect();
  await Promise.resolve();
  expect(w.AsgBackend.connected).toBe(false); // declined: not connected
  expect(w.asgState.stash.groups).toHaveLength(3); // local draft untouched
  expect(w.document.getElementById('asg-backend-status').textContent).toContain('not connected');
 });

 it('R4: connect does not ask when the draft matches the workbook', async () => {
  const w=sheet();
  w.localStorage.setItem('nco-asg-v1', JSON.stringify(w.asgState));
  w.AsgBackend.load=(cb)=>cb({state:clone2(w.asgSharedPart()), roster:w.asgState.roster}, null);
  let asked=0; w.confirm=()=>{ asked++; return true; };
  w.asgPassword='pw';
  w.asgConnect();
  await Promise.resolve();
  expect(asked).toBe(0); // nothing diverges: no prompt
  expect(w.AsgBackend.connected).toBe(true);
  w.clearTimeout(w.asgRefreshTimer);
 });
});

describe('ASG reaudit nit: connect divergence compare is shape-normalized', () => {
 const clone3=(o)=>JSON.parse(JSON.stringify(o));
 function wireShaped(w) {
  // What the backend actually sends: empty gig slots are null, empty npc null.
  const remote=clone3(w.asgSharedPart());
  remote.assignments.gigs[2]={ id:'gig-9', number:9, name:'New gig', description:'', slots:[{role:'Solo',npc:null},null,null,null] };
  return remote;
 }
 function localWithGig9(w) {
  w.asgState.assignments.gigs.push({ id:'gig-9', number:9, name:'New gig', description:'', slots:[{role:'Solo',npc:''},{role:'',npc:''},{role:'',npc:''},{role:'',npc:''}] });
  w.localStorage.setItem('nco-asg-v1', JSON.stringify(w.asgState));
 }

 it('no false replace prompt when the wire-shaped remote matches the normalized local state', async () => {
  const w=sheet();
  localWithGig9(w);
  w.AsgBackend.load=(cb)=>cb({state:wireShaped(w), roster:w.asgState.roster}, null);
  let asked=0; w.confirm=()=>{ asked++; return true; };
  w.asgPassword='pw';
  w.asgConnect();
  await Promise.resolve();
  expect(asked).toBe(0); // same content, different shape: no prompt
  expect(w.AsgBackend.connected).toBe(true);
  w.clearTimeout(w.asgRefreshTimer);
 });

 it('still prompts on actual divergence (wire-shaped remote with different content)', async () => {
  const w=sheet();
  localWithGig9(w);
  const remote=wireShaped(w);
  remote.assignments.gigs[2].name='Changed elsewhere';
  w.AsgBackend.load=(cb)=>cb({state:remote, roster:w.asgState.roster}, null);
  let asked=0; w.confirm=()=>{ asked++; return true; };
  w.asgPassword='pw';
  w.asgConnect();
  await Promise.resolve();
  expect(asked).toBe(1); // real difference: prompt
  expect(w.AsgBackend.connected).toBe(true);
  expect(w.asgState.assignments.gigs[2].name).toBe('Changed elsewhere'); // remote won
  w.clearTimeout(w.asgRefreshTimer);
 });
});
