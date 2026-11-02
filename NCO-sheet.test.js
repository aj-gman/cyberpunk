import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from './api/character.js';
const windows = [];
function sheet() {
  const dom = new JSDOM(readFileSync('src/site/img/NCO-sheet.html','utf8'), { runScripts:'dangerously', url:'https://example.test/cyberpunk/img/NCO-sheet.html', beforeParse(w) { w.confirm=()=>true; w.alert=vi.fn(); } });
  windows.push(dom.window);
  return dom.window;
}
afterEach(async () => { await Promise.resolve(); windows.splice(0).forEach(w=>w.close()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('synthetic NCO character regressions', () => {
 it('round trips six traumas and three flaws; replaces previous character state', () => {
  const w=sheet(); const data=w.buildExport(); data.traumas=Array.from({length:6},(_,i)=>({text:'Trauma '+i,marked:true})); data.flaws=[{text:'a'},{text:'b'},{text:'c'}]; data.flaw2='b';
  w.applyImport(data); expect(w.buildExport().traumas).toHaveLength(6); expect(w.buildExport().flaws).toHaveLength(3); expect(w.getHumanityMax()).toBe(4);
  w.applyImport({nickname:'second'}); const result=w.buildExport(); expect(result.traumas.filter(t=>t.marked)).toHaveLength(0); expect(result.hitsCount).toBe(3); expect(result.trackers).toEqual({humanity:10,cyberpsy:0});
 });
 it('preserves hit marks and asks before removing marked capacity', () => {
  const w=sheet(); w.document.querySelector('.hit-pip').click(); w.changeHits(1); expect(w.buildExport().hits).toEqual([true,false,false,false]);
  w.document.querySelectorAll('.hit-pip')[3].click(); w.confirm=()=>false; w.changeHits(-1); expect(w.buildExport().hitsCount).toBe(4);
  w.confirm=()=>true; w.changeHits(-1); expect(w.buildExport().hits).toEqual([true,false,false]);
 });
 it('makes the gear X return carried items and confirm stash deletion', () => {
  const w=sheet(); w.addGear({title:'synthetic'}); const b=w.document.querySelector('#gear-container .gear-block'); w.setGearBlockList(b,w.document.getElementById('inventory-container')); b.querySelector('.btn-danger').click(); expect(b.parentNode.id).toBe('gear-container');
  w.confirm=()=>false; b.querySelector('.btn-danger').click(); expect(b.isConnected).toBe(true); w.confirm=()=>true; b.querySelector('.btn-danger').click(); expect(b.isConnected).toBe(false);
 });
 it('rejects malformed imports before any sheet mutation', () => {
  const w=sheet(); const before=w.buildExport(); for(const data of [{nickname:'bad',trademarks:'wrong'},{gear:[null]},{traumas:'wrong'},{inventory:{items:{}}},{drive:{pips:'x'}},{conditions:{custom:[{state:'invalid'}]}}]) {
   expect(()=>w.applyImport(data)).toThrow(/Invalid character field/); expect(w.buildExport()).toEqual(before);
  }
 });
 it('separates active trauma from its explicit Humanity effect and preserves active blank rows', () => {
  const w=sheet(); w.applyImport({traumas:[{text:'physical',marked:true,affectsHumanity:false},{text:'emotional',marked:true,affectsHumanity:true}]}); expect(w.getHumanityMax()).toBe(9);
  w.addTrauma({marked:true}); const n=w.buildExport().traumas.length; w.cleanupEmpty('traumas-container','.trauma-row',1); expect(w.buildExport().traumas).toHaveLength(n);
  w.addCondition(); const pip=w.document.querySelector('.condition-pip'); w.cycleConditionPip(pip); w.cleanupEmpty('custom-conditions','.custom-condition',1); expect(pip.isConnected).toBe(true);
 });
 it('uses correct prefixed rule links and Symptoms destination', () => {
  const w=sheet(); const links=Array.from(w.document.querySelectorAll('a')).map(a=>a.href); for(const path of ['rules/nc-overdrive/cyberware/','rules/nc-overdrive/conditions/','rules/nc-overdrive/damage/traumas/','rules/cpred/cyberware/cyberpsychosis-symptoms/']) expect(links).toContain('https://example.test/cyberpunk/'+path);
  expect(w.document.querySelector('.nickname-row').textContent).toContain('€$'); expect(links.some(h=>h.includes('%E2%82%AC'))).toBe(false);
 });
 it('supports keyboard pips, dialog focus, and a 20-point cyberpsychosis scale', () => {
  const w=sheet(); const btn=w.document.getElementById('btn-page1'); btn.focus(); w.openStorageModal('save'); expect(w.document.activeElement.id).toBe('storage-cloud-btn'); w.document.getElementById('storage-modal').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); expect(w.document.activeElement).toBe(btn);
  w.applyImport({trackers:{cyberpsy:10}}); expect(w.document.getElementById('cyberpsy-bar').style.width).toBe('50%'); expect(w.document.querySelector('.hit-pip').tagName).toBe('BUTTON');
 });
 it('stores and restores a browser-local recovery draft', () => {
  const w=sheet(); w.document.getElementById('nickname').value='Recovered'; w.storeRecovery(); const raw=w.localStorage.getItem('nco-recovery-v1'); expect(JSON.parse(raw).data.nickname).toBe('Recovered');
  const dom=new JSDOM(readFileSync('src/site/img/NCO-sheet.html','utf8'), {runScripts:'dangerously',url:'https://example.test/cyberpunk/img/NCO-sheet.html',beforeParse(v){v.localStorage.setItem('nco-recovery-v1',raw);v.confirm=()=>true;}}); windows.push(dom.window); expect(dom.window.buildExport().nickname).toBe('Recovered'); expect(dom.window.isDirty()).toBe(true);
 });
 it('prompts on dirty replacement and stores a recovery draft when leaving', () => {
  const w=sheet(); w.document.getElementById('nickname').value='Unsaved'; w.confirm=()=>false; expect(w.mayReplace()).toBe(false); const e=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(e);expect(e.defaultPrevented).toBe(true); expect(w.localStorage.getItem('nco-recovery-v1')).toContain('Unsaved');
 });
 it('keeps edits made during a cloud save dirty and blocks overlapping saves', async () => {
  const w=sheet(); let finish; w.fetch=vi.fn(()=>new Promise(r=>finish=r)); w.document.getElementById('nickname').value='before'; const pending=w.saveToGitHub('synthetic'); await w.saveToGitHub('synthetic'); expect(w.fetch).toHaveBeenCalledTimes(1); w.document.getElementById('nickname').value='after'; finish({ok:true,json:async()=>({id:'synthetic',revision:'r1'})}); await pending; expect(w.isDirty()).toBe(true);
 });
});
describe('revision protection with mocked GitHub only', () => {
 function res() { return {statusCode:0, setHeader:vi.fn(), status(n){this.statusCode=n;return this},json(v){this.body=v;return this},end(){return this}}; }
 it('rejects missing and stale revisions without a write',async()=>{
  vi.stubEnv('GITHUB_TOKEN','synthetic-test-only'); const fetch=vi.fn(async()=>({status:200,json:async()=>({sha:'newer'})})); vi.stubGlobal('fetch',fetch);
  let r=res(); await handler({method:'POST',body:{id:'synthetic',data:{}}},r); expect(r.statusCode).toBe(428); expect(fetch).not.toHaveBeenCalled();
  r=res(); await handler({method:'POST',body:{id:'synthetic',data:{},expectedRevision:'older'}},r); expect(r.statusCode).toBe(409); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('sends the loaded SHA and returns the replacement revision',async()=>{
  vi.stubEnv('GITHUB_TOKEN','synthetic-test-only'); const fetch=vi.fn().mockResolvedValueOnce({status:200,json:async()=>({sha:'loaded'})}).mockResolvedValueOnce({ok:true,json:async()=>({content:{sha:'saved'}})}); vi.stubGlobal('fetch',fetch); const r=res(); await handler({method:'POST',body:{id:'synthetic',data:{},expectedRevision:'loaded'}},r); expect(r.body.revision).toBe('saved'); expect(JSON.parse(fetch.mock.calls[1][1].body).sha).toBe('loaded');
 });
});
