import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groundingQuestion,isSimplificationRequest} from '../server/chat-topics.js';
import {chartContext} from '../server/chat-grounding.js';
import {chatPrompt,createLocalChat} from '../server/local-chat.js';
import {astroFactProblems} from '../server/astro-fact-guard.js';
import {answerContractProblems} from '../server/chat-answer-contract.js';

const profile={birthUtc:'1997-10-08T21:30:00Z',birthLatitude:48.48,birthLongitude:135.08};
const history=[{role:'user',content:'Что самое важное в моей натальной карте?'},{role:'assistant',content:'Солнце в Весах, Луна в Козероге.'}];
const stream=response=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response,done:true,done_reason:'stop'})+'\n'));c.close();}})});

test('simplification with a list of exclusions keeps the calculated chart',()=>{
 for(const message of ['А если совсем простыми словами, без планет и домов?','Объясни проще, без планет, знаков и домов.','Можно по-простому, без терминов?']){
  assert.equal(isSimplificationRequest(message),true,message);
  assert.match(groundingQuestion(message,history),/^Что самое важное/u);
  const chart=chartContext(profile,message,new Date('2026-11-14T09:00:00Z'),{history}).chart;
  assert.ok(chart?.calculated,message);
  assert.ok(JSON.parse(chatPrompt({message,history,forecast:null,chart})).chart);
 }
 for(const message of ['Объясни проще, почему не работает отопление?','Можно по-простому объяснить совместимость моей сестры?','А если совсем простыми словами, какая работа мне подходит?'])assert.equal(groundingQuestion(message,history),message);
});

test('a time zone is not an invented psychological indicator',()=>{
 const bad='В первой часовой зоне работают интуиция и умение слушать.';
 assert.ok(astroFactProblems(bad).some(p=>p.code==='timezone_is_not_natal_indicator'));
 assert.ok(astroFactProblems('В первой часовой зоне много скрытого.').some(p=>p.code==='timezone_is_not_natal_indicator'));
 for(const text of ['Часовой пояс нужен для перевода времени рождения в UTC.','В первой часовой зоне местное время отличается от UTC на час.','Неверно, что в первой часовой зоне работают интуиция и умение слушать.','Пример ошибки: «В первой часовой зоне работают интуиция и умение слушать».'])assert.ok(!astroFactProblems(text).some(p=>p.code==='timezone_is_not_natal_indicator'),text);
 for(const text of ['Разве часовой пояс определяет характер? Нет, он нужен для перевода времени.','Если в выдуманной системе часовой пояс определяет характер, это лишь условие примера.','В первой часовой зоне не работают интуиция и умение слушать.','Уточни часовой пояс рождения, а затем обсудим характер.','Часовой пояс не влияет на характер: он нужен для перевода времени в UTC.','Часовой пояс нужен для расчёта времени, а интуицию обсуждают по Луне.'])assert.ok(!astroFactProblems(text).some(p=>p.code==='timezone_is_not_natal_indicator'),text);
});

test('unknown gender requires neutral direct advice and past-tense address',()=>{
 const options={message:'Объясни мою карту проще.',visitorGender:null,forecast:null};
 for(const answer of ['Не нужно быть идеальной подругой, чтобы быть хорошей.','Тебе не обязательно быть сильным и идеальным.','Ты не ввела дату рождения.'])assert.ok(answerContractProblems(answer,options).length,answer);
 for(const answer of ['Не нужно стараться всем понравиться.','Ей не нужно быть идеальной подругой.','Можно обсудить, как поддержать хорошую подругу.','Ты не указал(а) дату рождения.','Фраза «Не нужно быть идеальной подругой» — пример обращения.'])assert.equal(answerContractProblems(answer,options).length,0,answer);
 assert.equal(answerContractProblems('Не нужно быть идеальной подругой, чтобы быть хорошей.',{...options,visitorGender:'female'}).length,0);
 assert.equal(answerContractProblems('Тебе не обязательно быть сильным и идеальным.',{...options,visitorGender:'male'}).length,0);
 for(const answer of ['Нужно быть хорошим примером для ребёнка.','Не нужно быть идеальным человеком, чтобы поддержать близкого.','Нужно быть хорошим и сильным человеком.'])assert.equal(answerContractProblems(answer,options).length,0,answer);
 assert.ok(answerContractProblems('А внутри иногда хочется побыть одной и сказать своё.',options).length);
 for(const answer of ['Ей иногда хочется побыть одной.','Можно побыть в одиночестве.','Женщине иногда хочется побыть одной.','Можно остаться одним целым.'])assert.equal(answerContractProblems(answer,options).length,0,answer);
});

test('a correct timezone denial is published without a retry',async()=>{
 const old=process.env.CHAT_FACT_GUARD;process.env.CHAT_FACT_GUARD='1';
 try{
  const raw='Часовой пояс не влияет на характер: он нужен для перевода времени в UTC.';
  let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(raw);}});
  const result=await chat.answer({message:'Часовой пояс влияет на характер?',history:[],forecast:null,chart:null});
  assert.equal(calls,1);assert.equal(result.answer,'Привет! '+raw);
 }finally{if(old===undefined)delete process.env.CHAT_FACT_GUARD;else process.env.CHAT_FACT_GUARD=old;}
});

test('a planet at an unknown relatives chart is clarified before generation',async()=>{
 for(const message of ['А где Венера у моего брата? Его дату я не вводил.','Где Марс у моей сестры?']){
  const chart=chartContext(profile,message).chart;
  const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw new Error('No relative birth data: must not generate');}});
  const result=await chat.answer({message,history:[],forecast:null,chart});
  assert.equal(result.answerSource,'context');assert.match(result.answer,/данные рождения|выбранный профиль/u);
 }
 const message='Как моя Луна влияет на выбор партнёра?';
 assert.ok(chartContext(profile,message).chart);
});

test('bad generated terminology and gender cannot escape through retries',async()=>{
 const old=process.env.CHAT_FACT_GUARD;process.env.CHAT_FACT_GUARD='1';
 try{
  const message=history[0].content;const chart=chartContext(profile,message).chart;
  for(const raw of ['Солнце в Весах: в первой часовой зоне работают интуиция и умение слушать.','Солнце в Весах: в первой часовой зоне много скрытого.','А внутри иногда хочется побыть одной и сказать своё.','Не нужно быть идеальной подругой, чтобы быть хорошей.']){
   let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(raw);}});
   const result=await chat.answer({message,history:[],forecast:null,chart,visitorGender:null});
   assert.ok(calls>=2);assert.doesNotMatch(result.answer,/часовой зоне|идеальной подругой|быть хорошей|побыть одной/u);
  }
 }finally{if(old===undefined)delete process.env.CHAT_FACT_GUARD;else process.env.CHAT_FACT_GUARD=old;}
});
