import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Counts are fixed by the reviewed preparation, not inferred from finished rows.
const expected={fresh:32,exposed:56,chat:19,natal:34,development:246};
export function servingReview27(root){
 const read=path=>JSON.parse(fs.readFileSync(join(root,path),'utf8'));
 const summarize=(prefix,model)=>Object.fromEntries(Object.entries(expected).map(([group,total])=>{
  const data=read(`reports/${prefix}-${group}.json`),{summary,rows}=data;
  assert.equal(data.model??summary.model,model,`${prefix}-${group}: unexpected evaluated model`);
  assert.equal(rows.length,total,`${prefix}-${group}: incomplete evaluation`);
  assert.equal(new Set(rows.map(row=>row.id)).size,total,`${prefix}-${group}: duplicate IDs`);
  const problems=row=>row.errors??row.problems;
  assert.ok(rows.every(row=>Array.isArray(problems(row))),`${prefix}-${group}: missing errors`);
  assert.ok(rows.every(row=>row.generationModel==null||row.generationModel===model),`${prefix}-${group}: unexpected writer`);
  const passed=rows.filter(row=>!problems(row).length).length;
  assert.equal(summary.passed,passed,`${prefix}-${group}: inconsistent summary`);
  const fallback=row=>row.groundedFallback||row.styleFiltered;
  return [group,{total,passed,generationErrors:rows.filter(row=>row.generationError).length,
   generated:rows.filter(row=>row.generationModel&&!fallback(row)).length,
   fallbacks:rows.filter(fallback).length,styleFiltered:rows.filter(row=>row.styleFiltered).length,
   retried:rows.filter(row=>(row.rawAttempts??[]).length>1).length}];
 }));
 const parentResults=summarize('parent','anna-v26'),candidateResults=summarize('candidate','anna-v27');
 const candidateTotal=Object.values(candidateResults).reduce((n,group)=>n+group.total,0);
 const candidatePassed=Object.values(candidateResults).reduce((n,group)=>n+group.passed,0);
 return {status:'SERVING_CHECKS_COMPLETE_REVIEW_REQUIRED',parent:'anna-v26',candidate:'anna-v27',
  productionModel:'anna-v19',sourceCommit:fs.readFileSync(join(root,'source-commit.txt'),'utf8').trim(),
  parentResults,candidateResults,candidateTotal,candidatePassed,
  automaticChecksPassed:candidateTotal===candidatePassed&&Object.values(candidateResults).every(group=>!group.generationErrors),
  automaticDeployment:false,manualReviewRequired:true,
  limitations:'New controls use separate wording and numbers, not independent source concepts. Existing development and previously exposed controls are regressions. Review raw attempts, retries, fallbacks and source fidelity separately. No automatic model switch.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[2];if(!root)throw Error('Expected review root');
 const report=servingReview27(root);
 fs.writeFileSync(join(root,'reports/serving-readiness.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
