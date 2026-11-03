import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';

test('scope report cannot approve a candidate that refuses an allowed question or regresses chat',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'scope-report-'));
 const json=(p,value)=>writeFileSync(join(root,p),JSON.stringify(value));
 try{
  for(const dir of ['reports','data','anna-v15'])mkdirSync(join(root,dir));
  const good={offTopicTotal:12,offTopicPassed:12,falseScopeRefusals:0,sensitiveOffers:0,sensitiveButtons:0,meaningFailures:0,recall:1,falsePositives:0};
  for(const name of ['baseline-learning','baseline-fresh','learning','fresh'])json('reports/'+name+'.json',{summary:good,rows:[]});
  for(const [name,passed,total]of [['baseline-natal',33,34],['baseline-chat',19,19],['eval-natal-anna-v15',34,34],['eval-chat-anna-v15',18,19]])writeFileSync(join(root,'reports/'+name+'.md'),`Прошли ${passed} из ${total}`);
  json('data/manifest.json',{train:427});json('reports/memory-smoke-result.json',{status:'PASS'});
  json('anna-v15/anna-training.json',{processed_train_examples:427,max_length:3400,reject_truncation:true,training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:2}});
  json('reports/fresh.json',{summary:{...good,falseScopeRefusals:1},rows:[]});
  execFileSync(process.execPath,[resolve('training/report-scope-run.mjs'),root]);
  const result=JSON.parse(readFileSync(join(root,'reports/after-train-anna-v15.json')));
  assert.equal(result.status,'CHECKS_COMPLETE_REVIEW_REQUIRED');assert.equal(result.checks.noFalseRefusals,false);assert.equal(result.checks.chatAll,false);assert.equal(result.automaticDeployment,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
