import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
const backend=readFileSync('apps-script/asg.gs','utf8');
const migration=readFileSync('apps-script/asg-upgrade-migration.gs','utf8');
function harness(rows=[['category','name','note'],['supplies','Armory','note'],['supplies','Garage','']]) {
 const data=rows.map(r=>r.slice()), writes=[]; let uuid=0;
 const sh={getLastRow:()=>data.length,getRange:(row,col,nr=1,nc=1)=>({getValues:()=>Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>data[row-1+r]?.[col-1+c]??'')),setValues:values=>{writes.push({row,col,values});values.forEach((r,i)=>{data[row-1+i]??=[];r.forEach((v,j)=>data[row-1+i][col-1+j]=v)})}})};
 const c={console:{log:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>({ASG_OWNER_EMAIL:'owner@test.invalid',ASG_SHEET_ID:'s'})[k]})},Session:{getActiveUser:()=>({getEmail:()=> 'owner@test.invalid'}),getEffectiveUser:()=>({getEmail:()=> 'owner@test.invalid'})},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},Utilities:{getUuid:()=> 'uuid-'+(++uuid)}};
 vm.createContext(c);vm.runInContext(backend,c);c.openAsgWorkbook_=()=>({getSheetByName:()=>sh,flush:()=>{}});vm.runInContext(migration,c);
 return {c,data,writes};
}
describe('explicit editor migration',()=>{
 it('dry run writes nothing; apply only D:E, preserves A:C and is idempotent',()=>{
  const h=harness();h.c.asgUpgradeMigrationDryRun();expect(h.writes).toHaveLength(0);
  h.c.asgUpgradeMigrationApply();expect(h.writes.every(w=>w.col===4)).toBe(true);expect(h.data.map(r=>r.slice(0,3))).toEqual([['category','name','note'],['supplies','Armory','note'],['supplies','Garage','']]);
  const before=JSON.stringify(h.data);h.c.asgUpgradeMigrationApply();expect(JSON.stringify(h.data)).toBe(before);expect(h.data[1].slice(3)).toEqual(['upg-uuid-3',0]);
 });
 it('fails closed before writes on unknown categories, headers, duplicate IDs and wrong owner',()=>{
  for(const rows of [[['wrong','name','note']],[['category','name','note'],['other','x','']],[['category','name','note','id','position'],['supplies','x','','dup',0],['culture','y','','dup',0]]]){const h=harness(rows);expect(()=>h.c.asgUpgradeMigrationApply()).toThrow();expect(h.writes).toHaveLength(0);}
  const h=harness();h.c.Session.getActiveUser=()=>({getEmail:()=> 'other@test.invalid'});expect(()=>h.c.asgUpgradeMigrationApply()).toThrow(/owner/);expect(h.writes).toHaveLength(0);
 });
});
