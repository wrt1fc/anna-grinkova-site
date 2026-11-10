import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {servingReview} from '../training/report-serving-v26.mjs';

test('serving readiness rejects incomplete results and keeps raw/fallback evidence separate from permission',()=>{
 const root=fs.mkdtempSync(join(process.env.TMPDIR??tmpdir(),'anna-review-'));
 try{
  fs.mkdirSync(join(root,'reports'));fs.writeFileSync(join(root,'source-commit.txt'),'fixture\n');
  const sizes={fresh:24,exposed:32,chat:19,natal:34,development:246};
  for(const prefix of ['parent','candidate'])for(const [group,total]of Object.entries(sizes)){
   if(prefix==='parent'&&group==='development')continue;
   const rows=Array.from({length:total},(_,i)=>({errors:[],generationModel:i?'fixture':null,groundedFallback:i===0,styleFiltered:i===1,rawAttempts:i===0?[{},{}]:[{}]}));
   fs.writeFileSync(join(root,`reports/${prefix}-${group}.json`),JSON.stringify({summary:{passed:total},rows}));
  }
  const report=servingReview(root);
  assert.equal(report.candidateTotal,355);assert.equal(report.automaticChecksPassed,true);
  assert.equal(report.automaticDeployment,false);assert.equal(report.manualReviewRequired,true);
  assert.equal(report.candidateResults.fresh.fallbacks,2);assert.equal(report.candidateResults.fresh.generated,22);
  assert.equal(report.candidateResults.fresh.styleFiltered,1);
  const path=join(root,'reports/candidate-development.json'),data=JSON.parse(fs.readFileSync(path,'utf8'));
  data.rows[0].errors=['missing fact'];data.summary.passed--;
  fs.writeFileSync(path,JSON.stringify(data));assert.equal(servingReview(root).automaticChecksPassed,false);
  data.rows.pop();fs.writeFileSync(path,JSON.stringify(data));assert.throws(()=>servingReview(root),/incomplete evaluation/u);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
