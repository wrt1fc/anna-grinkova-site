import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalChat,firstPassSystem} from '../server/local-chat.js';
import {chartContext} from '../server/chat-grounding.js';
import {incompleteMoneyExplanation,intentAnswerProblem} from '../server/chat-explanation.js';
import {groundingQuestion} from '../server/chat-topics.js';
import {foreignChartClarification} from '../server/chat-answer-contract.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

const profile={birthUtc:'1997-10-08T21:30:00Z',birthLatitude:48.48,birthLongitude:135.08};
const forecast={date:'2026-11-13',scope:'personal',subject:null};
const stream=text=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});
const chat=text=>createLocalChat({model:'fixture',fetchImpl:async()=>stream(text)});
const chartFor=message=>chartContext(profile,message).chart;

test('an unknown relative cannot borrow the visitors planets',async()=>{
 const message='Где мой Марс и Венера моей сестры в натальной карте?';
 const result=await chat('Марс и Венера твоей сестры в Стрельце во 2 доме.').answer({message,history:[],chart:chartFor(message),forecast});
 assert.equal(result.model,null);assert.match(result.answer,/данн|профил/iu);assert.doesNotMatch(result.answer,/в Стрельце|во 2 доме/u);
});

test('a joint placement is not discarded by money completeness checks',()=>{
 const message='Назови управителей 1 и 2 домов моей натальной карты.';
 const text='Управитель 1 дома — Венера, она стоит во 2 доме. Управители 2 дома — Плутон и Марс, оба стоят во 2 доме.';
 assert.equal(incompleteMoneyExplanation(text,chartFor(message),message,'medium'),false);
});

test('career growth requires development rather than choosing a profession',()=>{
 assert.equal(intentAnswerProblem('Для роста можно выбрать психологию, обучение или творческую работу. Солнце в Весах в 12 доме даёт чуткость.','Что поможет мне расти в профессии?'),true);
 assert.equal(intentAnswerProblem('Выбери один рабочий навык, проверь его на задаче и попроси обратную связь.','Что поможет мне расти в профессии?'),false);
 assert.equal(intentAnswerProblem('Для роста можно выбрать направление, где ты используешь свои сильные стороны. Важно проверить, что из выбранного тебе действительно нравится.','Что поможет мне расти в профессии?'),true);
 assert.equal(intentAnswerProblem('Отработай активное слушание: перескажи коллеге услышанное и уточни, верно ли понимаешь смысл.','Что поможет мне расти в профессии?'),false);
});

test('no-terms clarification retains its original topic and really simplifies',async()=>{
 const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:'Солнце и асцендент в Весах. Луна в Козероге в 3 доме показывает сдержанность.'}];
 const message='Можно без терминов?';
 assert.match(groundingQuestion(message,history),/Что главное/u);
 const result=await chat(history[1].content).answer({message,history,chart:chartContext(profile,message,new Date(),{history}).chart,forecast});
 assert.doesNotMatch(result.answer,/Солнц|асцендент|Луна|Козерог|Весах|\d.*дом/u);
 assert.notEqual(result.answer,history[1].content);
});

test('explicit no-planets instruction survives server fallback anchoring',async()=>{
 const message='Объясни мою натальную карту простыми словами, без домов и названий планет.';
 const result=await chat('Солнце в Весах и Луна в Козероге в 3 доме определяют твой характер.').answer({message,history:[],chart:chartFor(message),forecast});
 assert.doesNotMatch(result.answer,/Солнц|Лун|асцендент|\d.*дом/u);
});

test('an unsupported strategy premise is not filled in by the model',async()=>{
 const message='Что значит моя стратегия котика?';
 const result=await chat('Стратегия котик — сочетание воздуха и воды.').answer({message,history:[],chart:chartFor(message),forecast,materials:[]});
 assert.equal(result.model,null);assert.match(result.answer,/не определ|нет.*описан|недостаточ/iu);
 assert.doesNotMatch(result.answer,/сочетание воздуха и воды/u);
});

test('partner timing never invents an unmentioned age',async()=>{
 const message='Когда я встречу партнёра?';
 const result=await chat('Партнёр появится не только в тридцать пять. Создай в карте условия для отношений.').answer({message,history:[],chart:chartFor(message),forecast});
 assert.doesNotMatch(result.answer,/тридцать|создай в карте/iu);
});

test('unknown gender does not publish a guessed address',async()=>{
 const message='Какие у меня сильные стороны?';
 const result=await chat('Ты вежливая и гармоничная, а внутри тревожная. Солнце в Весах.').answer({message,history:[],chart:chartFor(message),forecast,visitorGender:null});
 assert.doesNotMatch(result.answer,/ты вежливая|гармоничная|тревожная/iu);
});

test('planet navigation uses verified screens rather than invented display settings',async()=>{
 const message='Как включить настройки просмотра планет?';
 const result=await chat('В настройках просмотра включи отображение планет.').answer({message,history:[],chart:null,forecast});
 assert.equal(result.model,null);assert.match(result.answer,/Твоя натальная карта/u);assert.doesNotMatch(result.answer,/в настройках просмотра/iu);
});

test('production prompt includes topic guidance and permits requested practical steps',()=>{
 const old=process.env.ANNA_TRAINING_PROMPT_VERSION;process.env.ANNA_TRAINING_PROMPT_VERSION='18';
 try{const system=firstPassSystem({message:'Какой партнёр мне подходит?',chart:{partnerMissing:'нет'},learningSignals:true});assert.match(system,/Для текущего вопроса/u);}
 finally{if(old===undefined)delete process.env.ANNA_TRAINING_PROMPT_VERSION;else process.env.ANNA_TRAINING_PROMPT_VERSION=old;}
});

test('ownership guard respects an explicitly selected single owner and an available pair',()=>{
 assert.equal(foreignChartClarification('Назови Марс и Венеру моей сестры в натальной карте.',{subject:{relation:'sibling',label:'Сестра'}},{}),null);
 assert.equal(foreignChartClarification('Сравни мою натальную карту и карту партнёра: подходим ли мы друг другу?',forecast,{partner:{planets:['Венера в Весах']}}),null);
 assert.ok(foreignChartClarification('Где Марс моей сестры?',{subject:{relation:'partner',label:'Партнёр'}},{}));
 assert.equal(foreignChartClarification('Как моя Луна влияет на выбор партнёра?',forecast,{}),null);
 assert.ok(foreignChartClarification('Где Венера моего брата?',{subject:{relation:'sibling',label:'Сестра',gender:'female'}},{}));
});

test('no-terms applies to the direct solar branch and to detailed fallback',async()=>{
 const history=[{role:'user',content:'Какой у меня знак зодиака?'},{role:'assistant',content:'Твой знак — Весы.'}];
 const message='Можно без терминов?';
 const solar=await chat('Солнце в Весах.').answer({message,history,chart:chartContext(profile,message,new Date(),{history}).chart,forecast});
 assert.doesNotMatch(solar.answer,/Солнц|Лун|трет\p{L}* дом|Весы/u);
 const q='Объясни подробно мою натальную карту без терминов.';
 const long=('Солнце в Весах. Луна в Козероге в 3 доме. ').repeat(15);
 const result=await chat(long).answer({message:q,history:[],chart:chartFor(q),forecast,length:'detailed'});
 assert.ok(result.answer.length>=400);assert.doesNotMatch(result.answer,/Солнц|Лун|Весах|Козерог|3 доме/u);
});

test('all requested ruler houses survive an incomplete model answer',async()=>{
 const message='Назови управителей 1 и 2 домов моей натальной карты.';
 const result=await chat('Управители денежного дома — Плутон и Марс. Плутон стоит во 2 доме, Марс стоит во 2 доме.').answer({message,history:[],chart:chartFor(message),forecast});
 assert.match(result.answer,/Венера/u);assert.match(result.answer,/Плутон/u);assert.match(result.answer,/Марс/u);assert.match(result.answer,/1-го дома/u);
});

test('a long ruler list is never truncated into an incomplete list',async()=>{
 const message='Назови управителей 1, 2, 3, 4, 5 и 6 домов моей натальной карты.';
 const raw='Управитель 1 дома — Венера во 2 доме. Управители 2 дома — Плутон и Марс, оба стоят во 2 доме. Управители 3 дома — Юпитер в 4 доме и Нептун в 4 доме. Управители 4 дома — Сатурн в 6 доме и Уран в 4 доме.';
 const result=await chat(raw).answer({message,history:[],chart:chartFor(message),forecast,length:'short'});
 for(const house of [1,2,3,4,5,6])assert.match(result.answer,new RegExp(`${house} дом:`,'u'));
 assert.match(result.answer,/Сатурн в 6 доме/u);
 assert.ok(result.answer.length<=400);
});

test('safety permits a date explicitly asked about but still rejects an invented date',()=>{
 const answer='Вопрос про 8 апреля 2024 года можно разобрать как общий астрологический пример.';
 assert.equal(unsafeChatAnswer(answer,'2026-11-13',{question:'Что означает затмение 8 апреля 2024 года?'}),false);
 assert.equal(unsafeChatAnswer('Встреча будет 8 апреля 2024 года.','2026-11-13',{question:'Когда я встречу партнёра?'}),true);
 assert.equal(unsafeChatAnswer('Разберём 8 апреля 2026 года.','2026-11-13',{question:'Сравни 8 апреля 2024 года и 13 ноября 2026 года.'}),true);
});

test('a focused relationship question is not replaced with the ideal-partner fallback',async()=>{
 const message='Где мой Марс и что это значит для отношений?';
 const chart=chartContext({...profile,birthUtc:'1998-05-31T14:30:00Z',birthLatitude:56.33,birthLongitude:44},message).chart;
 const result=await chat('Марс в Тельце в 2 доме: ты активная и прямая.').answer({message,history:[],chart,forecast});
 assert.match(result.answer,/Марс в Близнецах/u);assert.doesNotMatch(result.answer,/портрет партнёра|7-й дом в/u);
});

test('written ruler labels and shared written placements preserve a correct generation',async()=>{
 const message='Назови управителей 1 и 2 домов моей натальной карты.';
 const raw='Управитель первого дома — Венера, она стоит во втором доме. Управители второго дома — Плутон и Марс, оба стоят во втором доме.';
 let calls=0;const writer=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(raw);}});
 const result=await writer.answer({message,history:[],chart:chartFor(message),forecast});
 assert.equal(calls,1);assert.equal(result.model,'fixture');assert.equal(result.answer,'Привет! '+raw);
});

test('a selected relative is not returned as the visitors own solar sign',async()=>{
 const message='Кто я по гороскопу?';
 const result=await chat('Твой знак — Весы.').answer({message,history:[],chart:chartFor(message),forecast:{...forecast,subject:{relation:'sibling',label:'Сестра',gender:'female'}}});
 assert.equal(result.answerSource,'context');assert.match(result.answer,/выбран|сво\p{L}*\s+профил/iu);assert.doesNotMatch(result.answer,/Твой знак/u);
});

test('an explicit relatives position is grounded rather than sent as general theory',()=>{
 const chart=chartFor('Где Марс моей сестры?');
 assert.ok(chart?.calculated?.positions?.mars);
});

test('multi-house fallback also works when no adjacent money-house wording selected the income intent',async()=>{
 const message='Назови управителей 1, 2, 3, 4, 5 и 6 домов моей натальной карты.';
 const raw='1 дом: Венера в 2 доме. 2 дом: Плутон и Марс в 2 доме. 3 дом: Юпитер и Нептун в 4 доме. 4 дом: Сатурн и Уран в 4 доме. 5 дом: Уран и Сатурн в 4 доме. 6 дом: Нептун и Юпитер в 4 доме.';
 const result=await chat(raw).answer({message,history:[],chart:chartFor(message),forecast,length:'short'});
 assert.match(result.answer,/4 дом: Сатурн в 6 доме/u);assert.match(result.answer,/6 дом: Нептун в 4 доме, Юпитер в 4 доме/u);assert.equal(result.model,null);
});

test('pure ruler membership does not require unrequested placements or discard correct pronouns',async()=>{
 const message='Назови управителей 1 и 2 домов моей натальной карты.';
 for(const raw of ['Управитель 1 дома — Венера. Управители 2 дома — Плутон и Марс.','Управитель 1 дома — Венера. Она стоит во 2 доме. Управители 2 дома — Плутон и Марс. Оба стоят во 2 доме.']){
  let calls=0;const writer=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(raw);}});
  const result=await writer.answer({message,history:[],chart:chartFor(message),forecast});
  assert.equal(calls,1);assert.equal(result.model,'fixture');assert.equal(result.answer,'Привет! '+raw);
 }
});

test('a pure selected-relative position never adds a generated house-rulership interpretation',async()=>{
 const message='Где Марс моей сестры?';
 const chart=chartContext({...profile,birthUtc:'1998-05-31T14:30:00Z',birthLatitude:56.33,birthLongitude:44},message).chart;
 const old=process.env.ANNA_FACT_ANSWERS;process.env.ANNA_FACT_ANSWERS='1';
 try{
  let calls=0;const writer=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Марс сестры управляет вторым домом.');}});
  const result=await writer.answer({message,history:[],chart,forecast:{...forecast,subject:{relation:'sibling',label:'Сестра',gender:'female'}}});
  assert.equal(calls,0);assert.equal(result.model,null);assert.match(result.answer,/Марс в Близнецах, в 7-м доме/u);assert.doesNotMatch(result.answer,/управля/u);
 }finally{if(old===undefined)delete process.env.ANNA_FACT_ANSWERS;else process.env.ANNA_FACT_ANSWERS=old;}
});
