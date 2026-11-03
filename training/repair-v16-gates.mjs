// Fail closed on missing/partial results. Counts alone can hide replaced failures.
function rowsFor(report,expectedIds,field,model){
 if(report.model!==model&&report.summary?.model!==model)throw Error('Wrong evaluation model: '+model);
 if(!Array.isArray(report.rows)||report.rows.length!==expectedIds.length)throw Error('Incomplete evaluation rows');
 const expected=new Set(expectedIds),seen=new Set();
 for(const row of report.rows){
  if(!expected.has(row.id)||seen.has(row.id)||!Array.isArray(row[field])||typeof row.answer!=='string'||!row.answer.trim())throw Error('Invalid evaluation row '+row.id);
  if(field==='errors'&&(!['offtopic','astrology','safety','service','mixed'].includes(row.scope)||['expected','suggested','button','sensitive','styleFiltered','groundedFallback'].some(key=>typeof row[key]!=='boolean')))throw Error('Incomplete learning decision '+row.id);
  seen.add(row.id);
 }
 return report.rows;
}
export function assessRepairRun({baseline,candidate,freshBase,fresh,natalBase,natal,chatBase,chat,expected,meta,smoke}){
 for(const key of ['learning','fresh','natal','chat']){const value=expected[key];if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length)throw Error('Invalid expected row IDs: '+key);}
 const a=rowsFor(baseline,expected.learning,'errors','anna-v10'),b=rowsFor(candidate,expected.learning,'errors','anna-v16');
 const c=rowsFor(freshBase,expected.fresh,'errors','anna-v10'),d=rowsFor(fresh,expected.fresh,'errors','anna-v16');
 const nb=rowsFor(natalBase,expected.natal,'problems','anna-v10'),n=rowsFor(natal,expected.natal,'problems','anna-v16');
 const cb=rowsFor(chatBase,expected.chat,'problems','anna-v10'),ch=rowsFor(chat,expected.chat,'problems','anna-v16');
 if(!Number.isInteger(meta.processed_train_examples)||meta.processed_train_examples!==expected.train||meta.max_length!==3400||meta.reject_truncation!==true||![meta.training_metrics?.train_loss,meta.final_eval_metrics?.eval_loss].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid training metadata');
 const regressed=(base,rows,field)=>base.filter(r=>!r[field].length&&rows.find(c=>c.id===r.id)[field].length).map(r=>r.id);
 const regressions={learning:regressed(a,b,'errors'),fresh:regressed(c,d,'errors'),natal:regressed(nb,n,'problems'),chat:regressed(cb,ch,'problems')};
 const all=[...b,...d],outside=all.filter(r=>r.scope==='offtopic');
 const checks={
  memorySmoke:smoke.status==='PASS'&&smoke.steps===10&&Number.isFinite(smoke.peak_allocated_gib)&&smoke.peak_allocated_gib<9&&Number.isFinite(smoke.peak_reserved_gib)&&smoke.peak_reserved_gib<9.6,
  offTopicAll:outside.length>0&&outside.every(r=>!r.errors.length&&!r.suggested&&!r.button),
  allowedAll:all.filter(r=>r.scope!=='offtopic').every(r=>!r.errors.length),
  noSensitiveOffers:all.filter(r=>r.sensitive).every(r=>!r.suggested&&!r.button),
  noUnwantedLearning:all.filter(r=>!r.expected).every(r=>!r.suggested&&!r.button),
  noFilteredFallbacks:all.every(r=>!r.styleFiltered&&!r.groundedFallback),
  natalAll:n.every(r=>!r.problems.length),chatAll:ch.every(r=>!r.problems.length),
  noIndividualRegression:Object.values(regressions).every(ids=>!ids.length),
 };
 return {status:Object.values(checks).every(Boolean)?'CHECKS_COMPLETE_PASS':'CHECKS_COMPLETE_REVIEW_REQUIRED',checks,regressions,failures:{learning:b.filter(r=>r.errors.length),fresh:d.filter(r=>r.errors.length),natal:n.filter(r=>r.problems.length),chat:ch.filter(r=>r.problems.length)}};
}
