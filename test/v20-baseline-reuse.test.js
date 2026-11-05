import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyBaselineReports} from '../training/reuse-v20-baselines.mjs';
test('reused baseline rejects missing IDs and preserves recorded generation failures',()=>{
 const root=mkdtempSync(join(tmpdir(),'anna-reuse-'));
 try{
  for(const p of ['reports','eval-code/training'])mkdirSync(join(root,p),{recursive:true});
  const save=(p,x)=>writeFileSync(join(root,p),JSON.stringify(x));
  save('cards.jsonl',{id:'l',split:'eval'});save('holdout.jsonl',{id:'f',split:'eval'});save('natal-plan.json',[{id:'n',split:'eval'}]);save('eval-code/training/eval-questions.json',{questions:[{id:'c'}]});
  for(const [prefix,model]of [['baseline','anna-v10'],['parent','anna-v19']])for(const [kind,id]of [['learning','l'],['fresh','f'],['natal','n'],['chat','c']])save('reports/'+prefix+'-'+kind+'.json',{model,day:'2026-11-02',rows:[{id,answer:'',rawAttempts:[],[['learning','fresh'].includes(kind)?'errors':'problems']:['recorded generation failure']}]});
  assert.equal(verifyBaselineReports(root,root).length,8);
  save('reports/parent-chat.json',{model:'anna-v19',day:'2026-11-02',rows:[{id:'other',answer:'Ответ',problems:[],rawAttempts:[]}]});
  assert.throws(()=>verifyBaselineReports(root,root),/wrong IDs/u);
 }finally{rmSync(root,{recursive:true,force:true});}
});
