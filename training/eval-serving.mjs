// Production protocol, without the experimental learning invitation. Raw attempts stay in reports.
// node training/eval-serving.mjs <model> <cards.jsonl> <report-prefix>
import fs from 'node:fs';
import {createLocalChat,chatForecastContext,forecastForQuestion,ANSWER_LENGTHS} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {wrongMoneyRulerClaim,incompleteMoneyExplanation} from '../server/chat-explanation.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {hasFormalAddress} from '../server/chat-style.js';
import {evaluationTelemetry} from './evaluation-telemetry.mjs';
const [model,input,prefix]=process.argv.slice(2);
if(!model||!input||!prefix)throw Error('Expected model, cards, report prefix');
if(process.env.CHAT_FACT_GUARD!=='1'||process.env.CHAT_MODEL_PROTOCOL!=='19')throw Error('Production guard and protocol required');
const date=process.env.ANNA_EVAL_DATE??'2026-11-09';
const forecast=chatForecastContext(forecastForDate(date));
let traces=[];
const chat=createLocalChat({model,learningSignals:false,onTrace:t=>traces.push(t)});
const rows=[];
for(const card of fs.readFileSync(input,'utf8').trim().split(/\r?\n/u).map(JSON.parse).filter(c=>c.split==='eval')){
  traces=[];let result={},failure=null;const errors=[];
  try{
    const history=card.history??[],length=card.length??'medium';
    const profile=card.chartFor?{birthUtc:card.chartFor.birthUtc,birthLatitude:card.chartFor.latitude,birthLongitude:card.chartFor.longitude}:null;
    const {chart}=chartContext(profile,card.question,new Date(date+'T09:00:00Z'),{history});
    result=await chat.answer({message:card.question,history,forecast:forecastForQuestion(forecast,card.question),chart,length});
    errors.push(...learningAnswerProblems(result.answer,card));
    if(unsafeChatAnswer(result.answer,date)||hasFormalAddress(result.answer))errors.push('safety/style');
    if(result.answer.length<(card.minAnswerChars??30)||result.answer.length>ANSWER_LENGTHS[length].maxChars)errors.push('answer length');
    if(wrongCalculatedClaim(result.answer,chart)||wrongMoneyRulerClaim(result.answer,chart,card.question))errors.push('calculated fact contradiction');
    if(incompleteMoneyExplanation(result.answer,chart,card.question,length))errors.push('missing calculated co-ruler');
    if(/\[\[LEARN/u.test(result.answer))errors.push('internal marker leaked');
  }catch(error){failure=error;errors.push(error.message);}
  rows.push({id:card.id,question:card.question,answer:result.answer??'',errors,...evaluationTelemetry(result,traces,failure)});
  fs.writeFileSync(prefix+'.partial.json',JSON.stringify(rows,null,2));
  console.log(card.id,errors.length?'FAIL':'PASS');
}
const summary={model,protocol:'production-learning-off',total:rows.length,passed:rows.filter(r=>!r.errors.length).length,
  errors:rows.filter(r=>r.errors.length).length,fallbacks:rows.filter(r=>r.groundedFallback).length,retried:rows.filter(r=>r.rawAttempts.length>1).length,
  rawAttempts:rows.reduce((n,r)=>n+r.rawAttempts.length,0),automaticDeployment:false};
fs.writeFileSync(prefix+'.json',JSON.stringify({summary,rows},null,2));
console.log(JSON.stringify(summary));
process.exitCode=summary.errors?1:0;
