import fs from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2];
if(!root)throw Error('Expected run root');
const read=name=>JSON.parse(fs.readFileSync(join(root,name),'utf8'));
const reports=join(root,'reports');
const brief=name=>{
  const data=read('reports/'+name+'.json');
  return {summary:data.summary,generated:data.rows.filter(r=>r.generationModel).length,
    generationErrors:data.rows.filter(r=>r.generationError).length,
    fallbacks:data.rows.filter(r=>r.groundedFallback).length,styleFiltered:data.rows.filter(r=>r.styleFiltered).length,
    retried:data.rows.filter(r=>(r.rawAttempts??[]).length>1).length};
};
const report={status:'CHECKS_COMPLETE_REVIEW_REQUIRED',candidate:'anna-v26',parent:'anna-v19',automaticDeployment:false,manualReviewRequired:true,
  preparation:read('preparation.json'),training:read('anna-v26/anna-training.json'),
  parentResults:{fresh:brief('parent-fresh'),serving:brief('parent-serving'),chat:brief('parent-chat'),natal:brief('parent-natal')},
  candidateResults:{fresh:brief('fresh'),serving:brief('serving'),exposedRegression:brief('exposed-regression'),learning:brief('learning'),chat:brief('eval-chat-anna-v26'),natal:brief('eval-natal-anna-v26')},
  limitations:'Synthetic editorial drafts are not Anna-approved. New wording and charts do not establish independent concepts. Raw attempts and fallbacks must be reviewed separately; passing automatic checks does not prove factual correctness or readable style. Production remains anna-v19.'};
fs.writeFileSync(join(reports,'after-train-anna-v26.json'),JSON.stringify(report,null,2));
fs.writeFileSync(join(reports,'after-train-anna-v26.md'),'# anna-v26: требуется просмотр\n\n```json\n'+JSON.stringify(report,null,2)+'\n```\n');
console.log(JSON.stringify(report));
