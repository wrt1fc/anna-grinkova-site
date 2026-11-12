// Raw generations before retries and server fallbacks; never used for serving.
import fs from 'node:fs';
import {join} from 'node:path';
import {extractLearningSignal} from '../server/learning-signals.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {chartContext} from '../server/chat-grounding.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import {intentAnswerProblem} from '../server/chat-explanation.js';
const [model,root,prefix]=process.argv.slice(2);
if(!model||!root||!prefix)throw Error('Expected model root prefix');
const read=p=>fs.readFileSync(join(root,p),'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const teachers=new Map(read('data/heldout.jsonl').map(c=>[c.id,c]));
const rows=[];
for(const card of read('holdout.jsonl')){
 const teacher=teachers.get(card.id);if(!teacher)throw Error('Missing frozen prompt '+card.id);
 const errors=[];let response=null,answer='';
 try{
  const result=await fetch((process.env.OLLAMA_URL??'http://127.0.0.1:11434')+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,think:false,system:teacher.prompt[0].content,prompt:teacher.prompt[1].content,options:{temperature:0,num_predict:500,num_ctx:8192}}),signal:AbortSignal.timeout(180000)});
  if(!result.ok)throw Error('HTTP '+result.status);response=await result.json();
  if(response.error)throw Error(response.error);
  answer=extractLearningSignal(response.response??'').answer;
  if(response.done_reason!=='stop')errors.push('incomplete generation');
  const profile=card.chartFor?{birthUtc:card.chartFor.birthUtc,birthLatitude:card.chartFor.latitude,birthLongitude:card.chartFor.longitude}:null;
  const {chart}=chartContext(profile,card.question,new Date('2026-11-12T09:00:00Z'),{history:card.history??[]});
  errors.push(...learningAnswerProblems(answer,card));
  if(wrongCalculatedClaim(answer,chart))errors.push('calculated fact contradiction');
  if(intentAnswerProblem(answer,card.question))errors.push('wrong practical intent');
  if(answer.length<30||answer.length>900)errors.push('answer length');
 }catch(e){errors.push(e.message);}
 rows.push({id:card.id,question:card.question,topic:card.topic,answer,raw:response,errors});
 fs.writeFileSync(prefix+'.partial.json',JSON.stringify(rows,null,2));console.log(card.id,errors.length?'FAIL '+errors.join('; '):'PASS');
}
const summary={model,total:rows.length,passed:rows.filter(r=>!r.errors.length).length,limitations:'Heuristic raw-generation checks; manual review required. No retry or calculated replacement.'};
fs.writeFileSync(prefix+'.json',JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary));
