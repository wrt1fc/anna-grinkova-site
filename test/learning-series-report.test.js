import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';

test('series report blocks a fluent candidate with false sensitive signals and preserves all failed attempts',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'learning-series-'));
 const json=(path,value)=>writeFileSync(path,JSON.stringify(value));
 try {
  mkdirSync(join(root,'reports'));
  const good={total:41,passed:41,recall:1,precision:1,falsePositives:0,sensitiveOffers:0,sensitiveButtons:0,meaningFailures:0,errors:0};
  for(const name of ['learning','fresh'])json(join(root,`reports/baseline-${name}.json`),{summary:good});
  writeFileSync(join(root,'reports/baseline-natal.md'),'Прошли 32 из 34');
  writeFileSync(join(root,'reports/baseline-chat.md'),'Прошли 19 из 19');
  for(const [version,metrics,expected]of [['v12',{...good,sensitiveOffers:1},'RUNNING next-attempt'],['v13',good,'CHECKS_COMPLETE_PASS']]) {
   const folder=join(root,'attempt-'+version);mkdirSync(join(folder,'reports'),{recursive:true});mkdirSync(join(folder,'anna-'+version));
   const rows=[{question:'Контроль',answer:'Пример ответа.',expected:true,suggested:true,button:true,errors:[]}];
   for(const name of ['learning','fresh'])json(join(folder,`reports/${name}.json`),{summary:metrics,rows});
   writeFileSync(join(folder,`reports/eval-natal-anna-${version}.md`),'Прошли 32 из 34');
   writeFileSync(join(folder,`reports/eval-chat-anna-${version}.md`),'Прошли 19 из 19');
   json(join(folder,`anna-${version}/anna-training.json`),{processed_train_examples:327,max_length:3400,reject_truncation:true,training_metrics:{train_loss:1.1},final_eval_metrics:{eval_loss:1.5}});
   writeFileSync(join(folder,`anna-${version}-q8_0.gguf`),'fixture only');
   execFileSync(process.execPath,[resolve('training/report-learning-series.mjs'),root,'anna-'+version],{stdio:'pipe'});
   const result=JSON.parse(readFileSync(join(root,'reports/series-summary.json')));
   assert.equal(result.status,expected);assert.equal(result.productionModel,'anna-v10');assert.equal(result.automaticDeployment,false);
  }
  const result=JSON.parse(readFileSync(join(root,'reports/series-summary.json')));
  assert.equal(result.attempts.length,2);assert.equal(result.best,'anna-v13');
  assert.equal(result.attempts[0].checks.noSensitiveSignals,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
