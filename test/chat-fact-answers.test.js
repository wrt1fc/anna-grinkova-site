import {test} from 'node:test';import assert from 'node:assert/strict';
import {chartContext} from '../server/chat-grounding.js';
import {createLocalChat} from '../server/local-chat.js';
import {personalFactRequest,physicalInferenceQuestion,ownPointQuestion} from '../server/chat-fact-answers.js';
import {chartRecords} from '../server/chart-records.js';
import {spawnSync} from 'node:child_process';
const profile={birthUtc:'1997-10-08T21:30:00Z',birthLatitude:48.48,birthLongitude:135.08};
async function enabled(fn){const keys=['ANNA_FACT_ANSWERS','ANNA_FACT_EXPLANATIONS'],old=keys.map(k=>process.env[k]);for(const k of keys)process.env[k]='1';try{await fn();}finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}}

test('pure monetary ruler questions use computed membership without asking a model',async()=>enabled(async()=>{
 const message='Какие планеты управляют денежным домом моей натальной карты и где они расположены?';
 const{chart}=chartContext(profile,message);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Facts must not generate');}});
 for(const length of ['short','medium','detailed']){
  const r=await chat.answer({message,history:[],chart,forecast:null,length});
  assert.equal(r.model,null);assert.equal(r.calculatedFactAnswer,true);
  assert.match(r.answer,/Плутон/u);assert.match(r.answer,/Марс/u);assert.doesNotMatch(r.answer,/Венер/u);
  assert.equal((r.answer.match(/2-м доме/gu)??[]).length,2);
 }
 const q='Назови управителей 2 дома моей натальной карты.';
 const single=chartContext({birthUtc:'1990-05-15T09:30:00Z',birthLatitude:55.75,birthLongitude:37.62},q).chart;
 const s=await chat.answer({message:q,history:[],chart:single,forecast:null});
 assert.match(s.answer,/Управитель денежного дома — Меркурий/u);assert.doesNotMatch(s.answer,/Один из|Другой управитель|Плутон|Марс/u);
}));

test('named positions preserve time uncertainty and missing profiles',async()=>enabled(async()=>{
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Facts must not generate');}});
 const message='Где находится мой Марс в натальной карте?';
 const{chart}=chartContext(profile,message);
 const r=await chat.answer({message,history:[],chart,forecast:null});assert.match(r.answer,/Марс в Стрельце, в 2-м доме/u);
 const unknown=chartContext({...profile,birthTime:null},message).chart;
 const u=await chat.answer({message,history:[],chart:unknown,forecast:null});assert.doesNotMatch(u.answer,/\d+-м доме/u);assert.match(u.answer,/врем|дом не определ/iu);
 const q='Назови управителей 2 дома моей натальной карты.';
 const noTime=await chat.answer({message:q,history:[],chart:chartContext({...profile,birthTime:null},q).chart,forecast:null});assert.match(noTime.answer,/врем/iu);assert.doesNotMatch(noTime.answer,/Плутон|Марс/u);
 const missing=await chat.answer({message,history:[],chart:{missing:'Нет данных'},forecast:null});assert.match(missing.answer,/данные рождения/u);
}));

test('a conditional physical inference has no personal chart or invented aspect',async()=>enabled(async()=>{
 const message='Если Венера связана с Юпитером, правда ли партнёр будет крупнее меня?';
 const{chart}=chartContext(profile,message);assert.equal(chart,null);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Concept limit must not generate');}});
 const r=await chat.answer({message,history:[],chart,forecast:null});
 assert.equal(r.model,null);assert.match(r.answer,/нельзя определить/iu);assert.doesNotMatch(r.answer,/секстил|\d+.*дом|Стрельце/u);
}));

test('fact routing respects general concepts, other subjects and current questions',()=>{
 for(const q of ['Объясни, как определяют управителя дома.','Что означает мой Марс?','Не называй положения планет моей карты.','Где Марс партнёра?','Где мой Марс завтра?','Если мой Марс во втором доме, что это значит?','Карта не открывается.','Управителей обсудим позже.','Где мой Марс и Венера моей сестры в натальной карте?','Где Марс Анны в моей натальной карте?','Где посмотреть мой Марс в личном кабинете?','Где мой Марс и что у меня с отношениями?','Назови управителей 1 и 2 домов моей натальной карты.','Назови управителей первого и второго домов моей натальной карты.','Назови управителей денежного дома моей карты и Анны.'])assert.equal(personalFactRequest(q),null,q);
 for(const q of ['Если Венера в Весах, значит партнёр мне подходит?','Правда ли Юпитер связан с профессиональным ростом через партнёра?'])assert.equal(physicalInferenceQuestion(q),false,q);
 assert.equal(physicalInferenceQuestion('Назови управителей 2 дома моей карты и скажи, можно ли узнать рост партнёра по аспекту.'),false);
 assert.deepEqual(personalFactRequest('Назови управителей 2 дома моей карты.'),{kind:'rulers',houses:[2]});
 assert.equal(ownPointQuestion('Объясни мой Марс и как мне начать копить.','meaning'),null);
 assert.equal(ownPointQuestion('Как мой Марс влияет на карьеру?\nУточнение: Объясни проще.','meaning'),null);
 assert.equal(ownPointQuestion('Что означает мой Марс?\nУточнение: Скажи это проще, пожалуйста.','meaning'),'mars');
});

test('the monetary projection contains only its actual rulers and keeps advanced questions intact',async()=>enabled(async()=>{
 const q='Объясни управителей денежного дома моей натальной карты.';
 const{chart}=chartContext(profile,q);const records=chartRecords(chart,q);
 assert.equal(records.houseRulers.length,1);assert.equal(records.houseRulers[0].house,2);
 assert.deepEqual(records.positions.map(p=>p.planet),['Плутон','Марс']);
 assert.equal(chartRecords(chart,'Сравни управителей 2 и 10 домов моей карты.'),chart);
 assert.equal(chartRecords(chart,'Назови управителей 1 и 2 домов моей натальной карты.'),chart);
 assert.equal(chartRecords(chart,'Назови управителей первого и второго домов моей натальной карты.'),chart);
 assert.equal(chartRecords(chart,'Объясни управителей денежного дома и моё Солнце в моей натальной карте.'),chart);
}));

test('a solar sign near ingress remains uncertain in a direct position request',async()=>enabled(async()=>{
 const q='В каком знаке моё Солнце в натальной карте?';
 const{chart}=chartContext({...profile,birthUtc:'2000-03-20T12:00:00Z',birthTime:null},q);
 assert.equal(chart.solarSignUncertain,true);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Uncertainty must not generate');}});
 const r=await chat.answer({message:q,history:[],chart,forecast:null});assert.match(r.answer,/нельзя уверенно|без времени/iu);assert.doesNotMatch(r.answer,/Солнце в (?:Рыбах|Овне)/u);
}));

test('basic explanations use existing editorial meanings and computed facts, never generated advice',async()=>enabled(async()=>{
 const message='Объясни мой Марс в натальной карте простыми словами.';
 const{chart}=chartContext(profile,message);const deltas=[];
 const materials=[{text:'Марс связывают с инициативой и действиями. Полезно рассматривать это как тему для размышления, проверяя предположения на собственном опыте.',source:'reviewed-fixture'}];
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Basic meanings must not generate');}});
 const r=await chat.answer({message,history:[{role:'assistant',content:'Раньше тут были данные другой карты: Марс в 12 доме.'}],chart,materials,forecast:null,onDelta:t=>deltas.push(t)});
 assert.equal(r.model,null);assert.equal(r.basicExplanation,true);assert.match(r.answer,/Марс в Стрельце, в 2-м доме/u);assert.doesNotMatch(r.answer,/12 доме|кредит|рискован/iu);assert.deepEqual(deltas,[r.answer]);
 const history=[{role:'user',content:message},{role:'assistant',content:r.answer}];
 const simple=await chat.answer({message:'Скажи это проще, пожалуйста.',history,chart,materials,forecast:null});
 assert.notEqual(simple.answer,r.answer.replace(/^Привет!\s*/u,''));assert.ok(simple.answer.length<r.answer.length);assert.match(simple.answer,/Марс в Стрельце, в 2-м доме/u);
 const again=await chat.answer({message:'Объясни проще.',history:[...history,{role:'user',content:'Скажи это проще, пожалуйста.'},{role:'assistant',content:simple.answer}],chart,materials,forecast:null});
 assert.notEqual(again.answer,simple.answer);assert.match(again.answer,/Какую часть пояснить/u);
}));

test('untrusted source fragments cannot add advice to the basic editorial renderer',async()=>enabled(async()=>{
 const message='Объясни мой Марс в натальной карте.';const{chart}=chartContext(profile,message);
 const materials=[{text:'Марс требует выбрать кредит и вложить деньги в рискованные проекты.',source:'untrusted-fixture'}];
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Basic meanings must not generate');}});
 const r=await chat.answer({message,history:[],chart,materials,forecast:null});assert.equal(r.model,null);assert.equal(r.basicExplanation,true);assert.doesNotMatch(r.answer,/кредит|рискован|требует/iu);
 const {chart:mc}=chartContext(profile,'В каком доме мой MC в натальной карте?');assert.ok(mc?.calculated);
 const m=await chat.answer({message:'В каком доме мой MC в натальной карте?',history:[],chart:mc,forecast:null});assert.match(m.answer,/10-м доме/u);
}));

test('the original model path remains available when the fact feature is disabled',async()=>{
 const old=process.env.ANNA_FACT_ANSWERS;delete process.env.ANNA_FACT_ANSWERS;
 try{
  let calls=0;const message='Какие планеты управляют денежным домом моей натальной карты и где они расположены?';const{chart}=chartContext(profile,message);
  const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return {ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:'Плутон в Стрельце во 2 доме. Марс в Стрельце во 2 доме. [[LEARNING_NONE]]',done:true,done_reason:'stop'})+'\n'));c.close();}})};}});
  const r=await chat.answer({message,history:[],chart,forecast:null});assert.equal(r.model,'fixture');assert.equal(calls,1);
 }finally{if(old===undefined)delete process.env.ANNA_FACT_ANSWERS;else process.env.ANNA_FACT_ANSWERS=old;}
});

test('rollback smoke verifies the original and calculated modes without live generation',()=>{
 for(const mode of ['0','1']){
  const r=spawnSync(process.execPath,['scripts/verify-fact-runtime.mjs',process.cwd(),mode,'anna-v27'],{encoding:'utf8',env:{...process.env,CHAT_LOCAL_MODEL:'anna-v27',ANNA_FACT_ANSWERS:mode,ANNA_FACT_EXPLANATIONS:mode}});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout.trim()).factMode,mode);
 }
});
