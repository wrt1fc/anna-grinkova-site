import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const expected={fresh:24,exposed:32,chat:19,natal:34,development:246};
export function servingReview(root){
  const read=path=>JSON.parse(fs.readFileSync(join(root,path),'utf8'));
  const summarize=(prefix,groups)=>Object.fromEntries(groups.map(group=>{
    const {summary,rows}=read(`reports/${prefix}-${group}.json`);
    assert.equal(rows.length,expected[group],`${prefix}-${group}: incomplete evaluation`);
    const problems=row=>row.errors??row.problems;
    assert.ok(rows.every(row=>Array.isArray(problems(row))),`${prefix}-${group}: missing errors`);
    const passed=rows.filter(row=>!problems(row).length).length;
    assert.equal(summary.passed,passed,`${prefix}-${group}: inconsistent summary`);
    const fallback=row=>row.groundedFallback||row.styleFiltered;
    return [group,{total:rows.length,passed,generationErrors:rows.filter(row=>row.generationError).length,
      generated:rows.filter(row=>row.generationModel&&!fallback(row)).length,fallbacks:rows.filter(fallback).length,
      styleFiltered:rows.filter(row=>row.styleFiltered).length,
      retried:rows.filter(row=>(row.rawAttempts??[]).length>1).length}];
  }));
  const groups=['fresh','exposed','chat','natal'];
  const parent=summarize('parent',groups),candidate=summarize('candidate',[...groups,'development']);
  const total=Object.values(candidate).reduce((n,group)=>n+group.total,0);
  const passed=Object.values(candidate).reduce((n,group)=>n+group.passed,0);
  return {status:'SERVING_CHECKS_COMPLETE_REVIEW_REQUIRED',sourceCommit:fs.readFileSync(join(root,'source-commit.txt'),'utf8').trim(),
    parent:'anna-v19',candidate:'anna-v26',protocol:'production-learning-off',parentResults:parent,candidateResults:candidate,
    candidateTotal:total,candidatePassed:passed,automaticChecksPassed:total===passed&&Object.values(candidate).every(group=>!group.generationErrors),
    automaticDeployment:false,manualReviewRequired:true,
    limitations:'Development is the existing 246-case regression set, not an independent exam. Held-out controls cover familiar concepts; v25 controls are exposed regressions. Raw attempts, retries and calculated fallbacks require separate factual/style review. Experimental learned invitations remain disabled and their training-pipeline report is separate.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=process.argv[2];if(!root)throw Error('Expected review root');
  const report=servingReview(root);
  fs.writeFileSync(join(root,'reports/serving-readiness.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
