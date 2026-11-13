// Rebuild every prompt with the same records projection used by the current site.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {curriculum30} from './curriculum-v30.mjs';
import {chartContext} from '../server/chat-grounding.js';
import {groundingQuestion} from '../server/chat-topics.js';
import {chatPrompt,firstPassSystem,historyForQuestion,chatForecastContext,forecastForQuestion} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {hasFormalAddress,conversationalOpening} from '../server/chat-style.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import {assertTeacherChartInput} from './teacher-chart-contract.mjs';

const [previous,out]=process.argv.slice(2);
assert.ok(previous&&out&&!fs.existsSync(out),'Need frozen v29 data and NEW output');
for(const [k,v]of Object.entries({ANNA_TRAINING_PROMPT_VERSION:'29',ANNA_REFERENCE_KNOWLEDGE:'19',CHAT_MODEL_PROTOCOL:'19',ANNA_CHART_FOCUS:'30'}))assert.equal(process.env[k],v,k);
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const names=['cards.jsonl','holdout.jsonl','regression.jsonl','data/train.jsonl','data/eval.jsonl','methodics.json'];
const inputs=names.map(name=>({path:join(previous,name),sha256:hash(fs.readFileSync(join(previous,name)))}));
const original=read(join(previous,'cards.jsonl')),extra=curriculum30();
assert.equal(original.filter(c=>c.split==='train').length,608);
let train=[...original.filter(c=>c.split==='train'),...extra.filter(c=>c.split==='train')];
const development=[...original.filter(c=>c.split==='eval'),...extra.filter(c=>c.split==='eval')];
const fresh=extra.filter(c=>c.split==='holdout').map(c=>({...c,split:'eval',evaluationStatus:'new synthetic profiles and wording, related concepts; manual semantic review required'}));
const controls=[...read(join(previous,'holdout.jsonl')),...read(join(previous,'regression.jsonl'))];
const all=[...train,...development,...fresh,...controls];
assert.equal(new Set(all.map(c=>c.id)).size,all.length,'Duplicate example');
const seenBirths=new Set([...train,...development,...controls].filter(c=>c.chartFor).map(c=>c.chartFor.birthUtc));
for(const c of fresh)assert.ok(!seenBirths.has(c.chartFor.birthUtc),'Held-out profile overlap');
const oldData=new Map([...read(join(previous,'data/train.jsonl')),...read(join(previous,'data/eval.jsonl'))].map(r=>[r.id,r]));
const forecast=chatForecastContext(forecastForDate('2026-11-13'));
const quarantine=[];
function serialize(c){
 const old=oldData.has(c.id)?JSON.parse(oldData.get(c.id).prompt[1].content):{};
 const history=c.history??old.history??[];
 const profile=c.chartFor?{birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude}:null;
 const {chart}=chartContext(profile,c.question,new Date('2026-11-13T09:00:00Z'),{history});
 assert.equal(wrongCalculatedClaim(c.answer,chart),false,'Teacher fact contradiction '+c.id);
 assert.ok(!unsafeChatAnswer(c.answer,'2026-11-13')&&!hasFormalAddress(c.answer),c.id);
 if(c.id.startsWith('v30-'))assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
 const question=groundingQuestion(c.question,history);
 const prompt=chatPrompt({message:c.question,history:historyForQuestion(history,c.question),chart,forecast:forecastForQuestion(forecast,question),materials:c.materials??old.materials??[],visitorName:old.visitorName??null,visitorGender:old.visitorGender??null,length:c.length??'medium',tone:c.tone??null});
 if(c.chartFor)assertTeacherChartInput(c.answer,JSON.parse(prompt),c.id);
 return {id:c.id,prompt:[{role:'system',content:firstPassSystem({message:c.question,chart,history,learningSignals:true,length:c.length??'medium'})},{role:'user',content:prompt}],completion:[{role:'assistant',content:conversationalOpening(c.answer,history)+'\n'+(c.learning?'[[LEARNING_OFFER]]':'[[LEARNING_NONE]]')}],chat_template_kwargs:{enable_thinking:false}};
}
const dataTrain=[];
train=train.filter(c=>{
 try{dataTrain.push(serialize(c));return true;}
 catch(error){
  if(!c.id.startsWith('v30-')&&/Personal teacher claim without chart|Teacher object absent from records/u.test(error.message)){
   quarantine.push({id:c.id,split:c.split,reason:error.message});return false;
  }
  throw error;
 }
});
assert.equal(quarantine.length,8,'Review any changed replay quarantine before training');
const dataEval=development.map(serialize),heldout=fresh.map(serialize);
process.env.ANNA_TRAINING_PROMPT_VERSION='18';
let production;
try{production=fresh.map(serialize);}finally{process.env.ANNA_TRAINING_PROMPT_VERSION='29';}
fs.mkdirSync(join(out,'data'),{recursive:true});
const write=(name,rows)=>fs.writeFileSync(join(out,name),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
write('cards.jsonl',[...train,...development]);write('holdout.jsonl',fresh);write('regression.jsonl',controls);
fs.writeFileSync(join(out,'quarantined-replay.json'),JSON.stringify(quarantine,null,2));
write('data/train.jsonl',dataTrain);write('data/eval.jsonl',dataEval);write('data/heldout.jsonl',heldout);write('data/heldout-production18.jsonl',production);
fs.copyFileSync(join(previous,'methodics.json'),join(out,'methodics.json'));
const manifest={version:30,parent:'anna-v27',parentAdapterSha256:'62edafbe44d5110035ec6f2ca992c5d8b0d8ef8c6cfbdc0d26c752b745cdaa7c',replay:600,quarantinedReplay:8,newTrain:96,totalTrain:696,development:294,heldout:24,exposedRegression:165,promptVersion:29,chartFocus:30,epochs:1,lr:3e-6,maxLength:4096,automaticDeployment:false,restoreModel:'anna-v27',sourceReplayCoverage:new Set(train.filter(c=>c.sourceId).map(c=>c.sourceId)).size,inputs,limitations:'Editorial teachers, not Anna-approved. New wording/profiles share concepts. Eight legacy teachers with unavailable projected objects quarantined, originals unchanged. Heuristic tests do not establish semantic correctness; manual source/meaning/grammar review required before any user-approved promotion. Private user profile excluded.'};
assert.equal(manifest.sourceReplayCoverage,61);
assert.equal(train.length,manifest.totalTrain);assert.equal(development.length,manifest.development);assert.equal(fresh.length,manifest.heldout);assert.equal(controls.length,manifest.exposedRegression);
for(const i of inputs)assert.equal(hash(fs.readFileSync(i.path)),i.sha256,'Input changed');
fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
