// Reuse completed comparisons only when their owning code and inputs are identical.
// Recorded failures remain failures; this never fabricates successful answers.
import fs from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const rows=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
function files(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(root,entry.name)):entry.isFile()?[join(root,entry.name)]:[]);}
export function verifyBaselineReports(source,target){
 const expected={learning:rows(join(target,'cards.jsonl')).filter(r=>r.split==='eval').map(r=>r.id),fresh:rows(join(target,'holdout.jsonl')).map(r=>r.id),natal:read(join(target,'natal-plan.json')).filter(r=>r.split==='eval').map(r=>r.id),chat:read(join(target,'eval-code/training/eval-questions.json')).questions.map(r=>r.id)};
 const reports=[];
 for(const [prefix,model]of [['baseline','anna-v10'],['parent','anna-v19']])for(const [kind,ids]of Object.entries(expected)){
  const name=prefix+'-'+kind+'.json',path=join(source,'reports',name),report=read(path),field=['learning','fresh'].includes(kind)?'errors':'problems';
  assert.equal(report.model??report.summary?.model,model,name+' model');
  assert.equal(report.rows.length,ids.length,name+' incomplete');
  assert.deepEqual([...new Set(report.rows.map(r=>r.id))].sort(),[...ids].sort(),name+' wrong IDs');
  if(['natal','chat'].includes(kind))assert.equal(report.day,'2026-11-02',name+' date');
  for(const row of report.rows){
   assert.equal(typeof row.answer,'string',name+' missing answer');
   assert.ok(Array.isArray(row[field])&&Array.isArray(row.rawAttempts),name+' missing telemetry');
   assert.ok(row.answer.trim()||row[field].length,name+' silent empty answer');
  }
  reports.push({file:name,sha256:sha(path),model,rows:ids.length});
 }
 return reports;
}
export function reuseBaselines(source,target){
 assert.notEqual(resolve(source),resolve(target),'Source and target must be isolated');
 assert.equal(process.env.ANNA_EVAL_DATE,'2026-11-02');
 assert.equal(process.env.ANNA_TRAINING_PROMPT_VERSION,'18');
 assert.equal(process.env.ANNA_REFERENCE_KNOWLEDGE,'19');
 assert.equal(process.env.CHAT_LEARNING_SIGNALS,'1');
 assert.notEqual(process.env.CHAT_FACT_GUARD,'1');
 const checked=[];
 const match=(a,b)=>{assert.equal(sha(a),sha(b),'Changed evaluation input: '+relative(target,b));checked.push({file:relative(target,b).replaceAll('\\','/'),sha256:sha(b)});};
 for(const name of ['cards.jsonl','holdout.jsonl','methodics.json','natal-plan.json','data/train.jsonl','data/eval.jsonl','data/manifest.json'])match(join(source,name),join(target,name));
 for(const name of ['package.json','package-lock.json'])match(join(source,'eval-code',name),join(target,'eval-code',name));
 for(const dir of ['server','config'])for(const path of files(join(target,'eval-code',dir)))match(join(source,'eval-code',dir,relative(join(target,'eval-code',dir),path)),path);
 // Every existing training JS/JSON file is checked except the report writer;
 // added orchestrators have no role in prompts, calculations or grading.
 for(const path of files(join(source,'eval-code/training'))){
  const name=relative(join(source,'eval-code'),path).replaceAll('\\','/');
  if(/\.(?:mjs|js|json)$/u.test(name)&&!name.startsWith('training/server/')&&!name.startsWith('training/report-'))match(path,join(target,'eval-code',name));
 }
 const reports=verifyBaselineReports(source,target);
 for(const {file}of reports){
  assert.equal(fs.existsSync(join(target,'reports',file)),false,'Already populated comparison');
 }
 for(const {file}of reports){
  fs.copyFileSync(join(source,'reports',file),join(target,'reports',file));
  for(const ext of ['md','log']){const name=file.replace(/json$/u,ext);if(fs.existsSync(join(source,'reports',name)))fs.copyFileSync(join(source,'reports',name),join(target,'reports',name));}
 }
 const receipt={status:'VERIFIED_REUSE',sourceRoot:source,sourceCommit:fs.readFileSync(join(source,'code-commit.txt'),'utf8').trim(),evaluationDate:'2026-11-02',checked, reports,limitation:'Reused recorded comparisons, not fresh generations; evaluation code/data/context are unchanged. Original failures and raw attempts preserved.'};
 fs.writeFileSync(join(target,'reports/baseline-reuse.json'),JSON.stringify(receipt,null,2));
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [source,target]=process.argv.slice(2);console.log(JSON.stringify(reuseBaselines(source,target)));}
