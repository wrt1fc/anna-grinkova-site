import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {servingReview27} from '../training/report-serving-v27.mjs';

test('v27 comparison requires complete distinct results from both pinned writers',()=>{
 const root=fs.mkdtempSync(join(process.env.TMPDIR??tmpdir(),'anna-v27-review-'));
 try{
  fs.mkdirSync(join(root,'reports'));fs.writeFileSync(join(root,'source-commit.txt'),'fixture\n');
  for(const prefix of ['parent','candidate'])for(const [group,total]of Object.entries({fresh:32,exposed:56,chat:19,natal:34,development:246})){
   const model=prefix==='parent'?'anna-v26':'anna-v27';
   const rows=Array.from({length:total},(_,i)=>({id:`${group}-${i}`,errors:[],generationModel:i?model:null,groundedFallback:i===0,rawAttempts:[{}]}));
   fs.writeFileSync(join(root,`reports/${prefix}-${group}.json`),JSON.stringify({model,summary:{passed:total},rows}));
  }
  const report=servingReview27(root);
  assert.equal(report.candidateTotal,387);assert.equal(report.automaticChecksPassed,true);
  assert.equal(report.automaticDeployment,false);assert.equal(report.manualReviewRequired,true);
  assert.equal(report.candidateResults.fresh.generated,31);assert.equal(report.candidateResults.fresh.fallbacks,1);
  const path=join(root,'reports/candidate-development.json'),original=JSON.parse(fs.readFileSync(path,'utf8'));
  const write=data=>fs.writeFileSync(path,JSON.stringify(data));
  let data=structuredClone(original);data.rows[0].generationError='failed generation';write(data);
  assert.equal(servingReview27(root).automaticChecksPassed,false);
  data=structuredClone(original);data.model='anna-v19';write(data);assert.throws(()=>servingReview27(root),/unexpected evaluated model/u);
  data=structuredClone(original);data.rows[1].id=data.rows[0].id;write(data);assert.throws(()=>servingReview27(root),/duplicate IDs/u);
  data=structuredClone(original);data.rows.pop();write(data);assert.throws(()=>servingReview27(root),/incomplete evaluation/u);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
