import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./asg.gs', import.meta.url), 'utf8');
function harness(overrides = {}, active = 'owner@example.test', effective = active) {
  const props = { ASG_SHEET_ID: 'asg', ASG_SELECTED_SHEET_ID: 'asg', ASG_OWNER_EMAIL: 'owner@example.test', ASG_SETUP_ENABLED: 'true', ...overrides };
  const calls = [];
  const context = { PropertiesService: { getScriptProperties: () => ({getProperty: k => props[k], setProperty: (k,v) => props[k]=v}) },
    Session: {getActiveUser: () => ({getEmail:()=>active}), getEffectiveUser:()=>({getEmail:()=>effective})},
    ScriptApp: {getOAuthToken:()=> 'private-test-token'},
    Sheets:{Spreadsheets:{get:(id,opts)=>{calls.push({id,opts});return {sheets:[]};}}}, module:{exports:{}} };
  vm.createContext(context); vm.runInContext(source,context);
  return {context, props, calls};
}
describe('file-only boundary and private setup',()=>{
  it('declares only drive.file data scope',()=>{
    const manifest=JSON.parse(fs.readFileSync(new URL('./appsscript.json',import.meta.url)));
    expect(manifest.oauthScopes).toEqual(['https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/userinfo.email']);
    expect(source).not.toMatch(/SpreadsheetApp\./);
    expect(source).not.toMatch(/DriveApp\.|UrlFetchApp\./);
  });
  it('blocks arbitrary IDs before any Google request',()=>{
    const {context,calls}=harness();
    expect(()=>context.openAsgWorkbook_('unrelated')).toThrow();expect(calls).toHaveLength(0);
  });
  it('requires completed Picker selection, not just a configured ID',()=>{
    const {context,calls}=harness({ASG_SELECTED_SHEET_ID:''});
    expect(()=>context.openAsgWorkbook_('asg')).toThrow();expect(calls).toHaveLength(0);
  });
  it('takes a single batched snapshot for the selected workbook',()=>{
    const {context,calls}=harness(); context.openAsgWorkbook_('asg');
    expect(calls).toHaveLength(1);expect(calls[0].id).toBe('asg');
  });
  for(const [label,active,effective] of [['anonymous','','owner@example.test'],['other user','other@example.test','owner@example.test'],['wrong executor','owner@example.test','other@example.test']]) {
    it('denies setup and token RPC for '+label,()=>{
      const {context,calls}=harness({},active,effective);
      expect(()=>context.getAsgSetupConfig()).toThrow();expect(()=>context.selectAsgWorkbook('asg')).toThrow();expect(calls).toHaveLength(0);
    });
  }
  it('does not leak token when setup is disabled',()=>{
    const {context}=harness({ASG_SETUP_ENABLED:'false'});expect(()=>context.getAsgSetupConfig()).toThrow();
  });
  it('rejects owner selection of another file',()=>{
    const {context,calls}=harness();expect(()=>context.selectAsgWorkbook('unrelated')).toThrow();expect(calls).toHaveLength(0);
  });
  it('disables private setup after validating selected ASG',()=>{
    const {context,props,calls}=harness();context.selectAsgWorkbook('asg');
    expect(calls).toHaveLength(1);expect(props.ASG_SETUP_ENABLED).toBe('false');expect(()=>context.getAsgSetupConfig()).toThrow();
  });
});
