// Re-evaluate saved responses; no new generation and no edits of frozen inputs.
import fs from 'node:fs';import {join} from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {chartContext} from '../server/chat-grounding.js';
import {revision31Card,quality31} from './quality-v31.mjs';
const [prepared,reports,out]=process.argv.slice(2);
assert.ok(out&&!fs.existsSync(out),'Need prepared v30, frozen reports and NEW output');
const cards=new Map(fs.readFileSync(join(prepared,'holdout.jsonl'),'utf8').trim().split(/\r?\n/u).map(JSON.parse).map(c=>[c.id,revision31Card(c)]));
const result={rubric:31,disclosedCases:true,manualReviewRequired:true,automaticDeployment:false,inputs:[],models:[]};
for(const name of ['parent-raw-focus','candidate-raw-focus']){
 const path=join(reports,name+'.json'),bytes=fs.readFileSync(path),data=JSON.parse(bytes);
 result.inputs.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
 const rows=data.rows.map(r=>{
  const c=cards.get(r.id);assert.ok(c);const p=c.chartFor;
  const {chart}=chartContext(p?{birthUtc:p.birthUtc,birthLatitude:p.latitude,birthLongitude:p.longitude}:null,c.question,new Date('2026-11-13T09:00:00Z'),{history:c.history??[]});
  return {...r,previousErrors:r.errors,errors:quality31(r.answer,c,chart)};
 });
 result.models.push({model:data.summary.model,total:rows.length,passed:rows.filter(r=>!r.errors.length).length,factContradictions:rows.filter(r=>r.errors.includes('calculated fact contradiction')).length,intentIssues:rows.filter(r=>r.errors.includes('wrong practical intent')).length,formatIssues:rows.filter(r=>r.errors.includes('requested numbered format')).length,rows});
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(join(out,'regrade.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result.models.map(({model,total,passed})=>({model,total,passed}))));
