// Derived snapshot only: immutable parent examples and private audit stay untouched.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {curriculum29} from './curriculum-v29.mjs';
import {chartContext} from '../server/chat-grounding.js';
import {chatPrompt,firstPassSystem,historyForQuestion,chatForecastContext,forecastForQuestion} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {hasFormalAddress,conversationalOpening} from '../server/chat-style.js';
import {learningAnswerProblems} from './learning-quality.mjs';

const [parent,v28,auditFile,out]=process.argv.slice(2);
assert.ok(out&&!fs.existsSync(out),'Require parent, v28, reviewed private audit and NEW output');
assert.equal(process.env.ANNA_TRAINING_PROMPT_VERSION,'29');
assert.equal(process.env.ANNA_REFERENCE_KNOWLEDGE,'19');
assert.equal(process.env.CHAT_MODEL_PROTOCOL,'19');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const before=new Map([join(parent,'cards.jsonl'),join(parent,'data/train.jsonl'),join(parent,'data/eval.jsonl'),join(parent,'methodics.json'),join(v28,'regression.jsonl'),join(v28,'holdout.jsonl'),auditFile].map(p=>[p,hash(fs.readFileSync(p))]));
const original=read(join(parent,'cards.jsonl')), audit=JSON.parse(fs.readFileSync(auditFile));
assert.equal(audit.sourceCardsSha256,before.get(join(parent,'cards.jsonl')));
const changes=new Map(audit.rewrites.map(r=>[r.id,r]));
assert.equal(changes.size,22,'Review all known answer conflicts before launch');
const replay=original.filter(c=>c.split==='train').map(c=>{
 const r=changes.get(c.id);if(!r)return structuredClone(c);
 assert.equal(hash(c.answer),r.originalAnswerSha256,'Wrong original teacher '+c.id);
 return {...c,answer:r.replacementAnswer,revision:'v29-private-audit',origin:'derived-editorial-not-Anna-approved'};
});
assert.equal(replay.length,448);
assert.equal(replay.filter(c=>c.revision==='v29-private-audit').length,22);
const oldData=new Map([...read(join(parent,'data/train.jsonl')),...read(join(parent,'data/eval.jsonl'))].map(r=>[r.id,r]));
const extra=curriculum29(),fresh=extra.filter(c=>c.split==='holdout').map(c=>({...c,split:'eval',evaluationStatus:'new profile/wording; shared concepts, not blind after baseline'}));
const newer=extra.filter(c=>c.split!=='holdout');
assert.equal(newer.filter(c=>c.split==='train').length,160);assert.equal(newer.filter(c=>c.split==='eval').length,24);assert.equal(fresh.length,48);
const controls=[...read(join(v28,'regression.jsonl')),...read(join(v28,'holdout.jsonl'))];
assert.equal(controls.length,117);
const train=[...replay,...newer.filter(c=>c.split==='train')];
const development=[...original.filter(c=>c.split==='eval'),...newer.filter(c=>c.split==='eval')];
assert.equal(new Set([...train,...development,...fresh,...controls].map(c=>c.id)).size,train.length+development.length+fresh.length+controls.length);
const trainBirths=new Set(train.filter(c=>c.chartFor).map(c=>c.chartFor.birthUtc));
for(const c of fresh.filter(c=>c.chartFor))assert.ok(!trainBirths.has(c.chartFor.birthUtc),'Held-out birth leaked '+c.id);
const forecast=chatForecastContext(forecastForDate('2026-11-12'));
function serialize(c){
 const previous=oldData.get(c.id), old=previous?JSON.parse(previous.prompt[1].content):{};
 const history=c.history??old.history??[];
 const profile=c.chartFor?{birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude}:null;
 const {chart}=chartContext(profile,c.question,new Date('2026-11-12T09:00:00Z'),{history});
 assert.ok(!unsafeChatAnswer(c.answer,'2026-11-12')&&!hasFormalAddress(c.answer),c.id);
 assert.ok(c.answer.length<=900,c.id);
 if(c.length==='detailed')assert.ok(c.answer.length>=400,'Detailed teacher shortened '+c.id);
 assert.equal(wrongCalculatedClaim(c.answer,chart),false,'Teacher fact contradiction '+c.id);
 // Legacy quality tags include historical heuristics. New/revised teachers must pass current ones.
 if(c.id.startsWith('v29-')||c.revision)assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
 const prompt=chatPrompt({message:c.question,history:historyForQuestion(history,c.question),chart,forecast:forecastForQuestion(forecast,c.question),materials:old.materials??[],visitorName:old.visitorName??null,visitorGender:old.visitorGender??null,length:c.length??'medium',tone:c.tone??null});
 const system=firstPassSystem({message:c.question,chart,history,learningSignals:true,length:c.length??'medium'});
 return {id:c.id,prompt:[{role:'system',content:system},{role:'user',content:prompt}],completion:[{role:'assistant',content:conversationalOpening(c.answer,history)+'\n'+(c.learning?'[[LEARNING_OFFER]]':'[[LEARNING_NONE]]')}],chat_template_kwargs:{enable_thinking:false}};
}
const dataTrain=train.map(serialize),dataEval=development.map(serialize),dataFresh=fresh.map(serialize);
process.env.ANNA_TRAINING_PROMPT_VERSION='18';
let productionFresh;
try{productionFresh=fresh.map(serialize);}finally{process.env.ANNA_TRAINING_PROMPT_VERSION='29';}
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(join(out,'data'));
const write=(file,rows)=>fs.writeFileSync(join(out,file),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
write('cards.jsonl',[...train,...development]);write('holdout.jsonl',fresh);write('regression.jsonl',controls);
write('data/train.jsonl',dataTrain);write('data/eval.jsonl',dataEval);write('data/heldout.jsonl',dataFresh);
write('data/heldout-production18.jsonl',productionFresh);
fs.copyFileSync(join(parent,'methodics.json'),join(out,'methodics.json'));fs.copyFileSync(auditFile,join(out,'audit-parent.json'));
const manifest={version:29,parent:'anna-v27',parentAdapterSha256:'62edafbe44d5110035ec6f2ca992c5d8b0d8ef8c6cfbdc0d26c752b745cdaa7c',replay:448,revisedTeachers:22,newTrain:160,totalTrain:608,development:270,oldDevelopment:246,newValidation:24,heldout:48,exposedRegression:117,promptVersion:29,epochs:1,lr:5e-6,maxLength:4096,automaticDeployment:false,sourceReplayCoverage:new Set(replay.filter(c=>c.sourceId).map(c=>c.sourceId)).size,inputs:[...before].map(([path,sha256])=>({path,sha256})),limitations:'Editorial corrections, not Anna-approved. Prompt29 and rebuilt contexts differ from v28, therefore rerun v27 baseline under identical new prompts. Existing controls remain exposed regressions; new profile/wording tests share concepts. Raw scores are heuristic and require manual review.'};
assert.equal(manifest.sourceReplayCoverage,61);
for(const [p,h]of before)assert.equal(hash(fs.readFileSync(p)),h,'Input changed '+p);
fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
