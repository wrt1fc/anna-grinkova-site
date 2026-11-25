import {test}from'node:test';import assert from'node:assert/strict';
import{groundingQuestion,repeatedSimplification,requestsDetailedAnswer}from'../server/chat-topics.js';
import{chartContext}from'../server/chat-grounding.js';
import{createLocalChat}from'../server/local-chat.js';
import{plainNatalAnswer}from'../server/chart-answer-check.js';
import{chatIntent}from'../server/chat-intent.js';
import{hasInstructionEcho}from'../server/chat-style.js';
import{astroFactProblems}from'../server/astro-fact-guard.js';
import{intentAnswerProblem}from'../server/chat-explanation.js';
import{answerContractProblems}from'../server/chat-answer-contract.js';
const profile={birthUtc:'1990-05-15T09:30:00Z',birthTime:'12:30',birthLatitude:55.75,birthLongitude:37.62};
const stream=text=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});

test('suggested questions get a direct strength, a work plan and distinct money answers',async()=>{
 const strengths='Какие у меня сильные стороны?';
 const work='Какая работа мне подходит?';
 const style='Какой подход к деньгам мне ближе?';
 const confidence='Как мне увереннее обращаться с деньгами?';
 const income='Что помогает мне больше зарабатывать?';
 assert.deepEqual([style,confidence,income].map(chatIntent),['moneyStyle','moneyConfidence','income']);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>assert.fail('A standard question should use its prepared answer')});
 const answer=async message=>(await chat.answer({message,history:[],chart:chartContext(profile,message).chart,forecast:null})).answer;
 assert.match(await answer(strengths),/^Привет! Возможно, одна из твоих сильных сторон — умение последовательно доводить дело/u);
 const career=await answer(work);
 assert.match(career,/^Привет! Сначала стоит разобраться, какие задачи тебе интересно делать даже в обычный рабочий день\./u);
 assert.equal(career.match(/^\d\. /gmu)?.length,3);
 const preferences=await answer(style), habits=await answer(confidence);
 assert.match(preferences,/чётким планом или удобнее с гибким лимитом/u);
 assert.match(habits,/обязательные платежи/u);
 assert.notEqual(preferences,habits);
 for(const text of [preferences,habits])assert.doesNotMatch(text,/управител|темы заработка/u);
 for(const question of [style,confidence]){
  assert.equal(intentAnswerProblem('Не нужно перечислять управителей: попробуй удобный лимит на неделю.',question),false);
  assert.equal(intentAnswerProblem('Для этого необходимо пройти обучение у Анны Гриньковой.',question),true);
 }
});

test('requesting more detail expands the previous topic even with short selected and rejects a repeated reply',async()=>{
 const previous='Возможно, одна из твоих сильных сторон — доводить дело до результата. Вспомни, когда это помогло закончить непростую задачу.';
 const history=[{role:'user',content:'Какие у меня сильные стороны?'},{role:'assistant',content:previous}];
 const message='А расскажи поподробнее, пожалуйста.';
 assert.match(groundingQuestion(message,history),/^Какие у меня сильные стороны/u);
 assert.equal(requestsDetailedAnswer(message,history.slice(0,1)),false);
 assert.equal(requestsDetailedAnswer('Расскажи подробнее о моей Луне.',[]),true);
 assert.equal(groundingQuestion('Расскажи подробнее о моей Луне.',history),'Расскажи подробнее о моей Луне.');
 const calls=[];
 const chat=createLocalChat({model:'fixture',fetchImpl:async(_url,{body})=>{
  calls.push(JSON.parse(body));
  return stream(previous);
 }});
 const {chart}=chartContext(profile,message,new Date(),{history});
 const result=await chat.answer({message,history,chart,forecast:null,length:'short'});
 assert.equal(result.length,'detailed');
 assert.ok(calls.every(call=>JSON.parse(call.prompt).length==='detailed'));
 assert.match(calls[0].system,/что даёт рассчитанный знак/u);
 assert.notEqual(result.answer,previous);
 assert.ok(result.answer.length>=400);
 assert.match(result.answer,/Луна в .+доме/u);
 assert.match(result.answer,/разговор с коллегой/u);
});

test('the standard work follow-up develops the practical advice and uses a calculated MC when available',async()=>{
 const original='Какая работа мне подходит?';
 const history=[{role:'user',content:original},{role:'assistant',content:'Сначала стоит разобраться, какие задачи тебе интересно делать даже в обычный рабочий день.'}];
 const message='Можно подробнее?';
 const {chart}=chartContext(profile,message,new Date(),{history});
 assert.ok(chart.calculated.angles.mc);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>assert.fail('The standard work follow-up should use the expanded explanation')});
 const result=await chat.answer({message,history,chart,forecast:null,length:'short'});
 assert.equal(result.length,'detailed');
 assert.ok(result.answer.length>=400);
 assert.match(result.answer,/обычный вторник/u);
 assert.match(result.answer,/MC — середина неба/u);
 assert.doesNotMatch(result.answer,/управител/u);
});

test('elaboration stays with the applied topic rather than an older standard question',async()=>{
 const history=[
  {role:'user',content:'Какая работа мне подходит?'},
  {role:'assistant',content:'Попробуй разобраться, какие задачи тебе интересны.'},
  {role:'user',content:'А как это проявляется в отношениях?'},
  {role:'assistant',content:'В отношениях можно обсудить, как вы договариваетесь о планах.'},
 ];
 const message='Расскажи подробнее.';
 const {chart}=chartContext(profile,message,new Date(),{history});
 const raw='В отношениях пригодится умение говорить о своих планах заранее. Например, если на выходные у каждого свои дела, попробуй сначала назвать, сколько времени хочется оставить для себя. Потом можно решить, чем заняться вместе и где нужен запас времени.\n\nПри таком разговоре легче понять, когда хочется близости, а когда нужно спокойно побыть в одиночестве. Если один план не сработал, обсуди с близким человеком, что можно поменять в следующий раз.';
 let calls=0;
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(raw);}});
 const result=await chat.answer({message,history,chart,forecast:null});
 assert.equal(calls,1);
 assert.match(result.answer,/В отношениях пригодится/u);
 assert.doesNotMatch(result.answer,/обычный рабочий день/u);
});

test('the expanded Moon fallback connects its real sign and house to an example',async()=>{
 const history=[{role:'user',content:'Что означает моя Луна в натальной карте?'},{role:'assistant',content:'Луну связывают с ощущением опоры.'}];
 const message='Можно подробнее?';
 const {chart}=chartContext(profile,message,new Date(),{history});
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Луна связана с ощущением опоры.')});
 const result=await chat.answer({message,history,chart,forecast:null});
 assert.equal(result.length,'detailed');
 assert.ok(result.answer.length>=400);
 assert.match(result.answer,new RegExp(`в ${chart.calculated.positions.moon.house}-м доме`,'u'));
 assert.match(result.answer,/день вышел суматошным/u);
 assert.doesNotMatch(result.answer,/Солнце|Меркурий/u);
});

test('detailed strengths fallback preserves the selected owner and does not guess the visitor gender',async()=>{
 const previous='Возможно, сестра умеет терпеливо доводить дело до результата. Это может быть видно по её работе и в обычной жизни.';
 const history=[{role:'user',content:'Какие сильные стороны у моей сестры по натальной карте?'},{role:'assistant',content:previous}];
 const subject={relation:'sibling',label:'Сестра',gender:'female'};
 const message='Расскажи подробнее.';
 const {chart}=chartContext(profile,message,new Date(),{history,subject});
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream(previous)});
 const result=await chat.answer({message,history,chart,forecast:{subject}});
 assert.equal(result.length,'detailed');
 assert.match(result.answer,/сильных сторон этого человека/u);
 assert.match(result.answer,/Солнцем в Тельце/u);
 assert.doesNotMatch(result.answer,/твоих сильных сторон|в твоей карте/u);
 assert.ok(answerContractProblems('Выбери ситуацию, где ты могла бы применить этот навык.',{message,visitorGender:null,forecast:null}).length);
 assert.ok(answerContractProblems('Может показаться, что ты холодна.',{message,visitorGender:null,forecast:null}).length);
});

test('counted follow-ups retain the last independent budget question rather than an older chart topic',async()=>{
 const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:'Ответ про карту.'},{role:'user',content:'А как это проявляется в отношениях?'},{role:'assistant',content:'Ответ про отношения.'},{role:'user',content:'Почему мне сложно откладывать деньги?'},{role:'assistant',content:'Запиши расходы.'}];
 const message='Дай три конкретных шага.';const q=groundingQuestion(message,history);
 assert.match(q,/Почему мне сложно откладывать деньги/u);assert.doesNotMatch(q,/главное|отношениях/u);assert.equal(chatIntent(q),'budget');
 let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Солнце в Тельце. Деньги связаны с самоощущением и спокойствием.');}});
 const{chart}=chartContext(profile,message,new Date(),{history});const result=await chat.answer({message,history,chart,forecast:null});
 assert.equal(calls,2);assert.equal((result.answer.match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,3);assert.match(result.answer,/расход|покуп|накоп/iu);
 assert.equal(groundingQuestion('Дай три шага для отношений.',history),'Дай три шага для отношений.');
 for(const q of ['Дай три небольших действия.','Дай два простых шага.'])assert.equal(chatIntent(groundingQuestion(q,history)),'budget');
});

test('meaning clarification follows the calculated solar sign without generating a new zodiac classification',async()=>{
 const history=[{role:'user',content:'Я спрашиваю только знак зодиака. Назови его.'},{role:'assistant',content:'Твой знак — Телец.'}];
 const message='Что это значит простыми словами?';const{chart}=chartContext(profile,message,new Date(),{history});assert.ok(chart);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Calculated meaning must not call generation');}});
 const result=await chat.answer({message,history,chart,forecast:null});assert.match(result.answer,/доводить дело/u);assert.doesNotMatch(result.answer,/Солнце|Тельце|триад|Водолей/iu);assert.match(result.answer,/опыт/iu);
 assert.ok(plainNatalAnswer(chart,'Солнце','detailed').length>=400);
});

test('overview retries and falls back when generation opens with astrology terms', async()=>{
 const message='Что главное в моей натальной карте?';
 const {chart}=chartContext(profile,message);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Главное — Солнце в Тельце. Тебе важно доводить дело до результата.')});
 const result=await chat.answer({message,history:[],chart,forecast:null});
 assert.equal(result.answerSource,'server-fallback');
 assert.match(result.answer,/^Привет! Возможно, тебе хорошо удаётся/u);
 assert.match(result.answer,/Солнце в Тельце/u);
});

test('a misspelled meaning follow-up keeps the career topic and drops jargon',async()=>{
 const history=[{role:'user',content:'Какая работа мне подходит?'},{role:'assistant',content:'Стоит попробовать работу, где нужно объяснять сложное. Это видно по положению планеты.'}];
 for(const message of ['а что это хначит?','что это зачит','И как это понять?']){
  assert.equal(chatIntent(groundingQuestion(message,history)),'workfit');
  const {chart}=chartContext(profile,message,new Date(),{history});
  const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('В астрологической методике управители денежного дома связывают с профессиями.')});
  const result=await chat.answer({message,history,chart,forecast:null});
  assert.match(result.answer,/задач|рабоч/iu);
  assert.doesNotMatch(result.answer,/Сатурн|Уран|дом|Водол/iu);
 }
 assert.equal(groundingQuestion('Что означает Сатурн в моей карте?',history),'Что означает Сатурн в моей карте?');
});

test('a plain relationship explanation does not have to repeat house facts',async()=>{
 const history=[{role:'user',content:'Какой партнёр мне подходит?'},{role:'assistant',content:'В отношениях тебе может быть важна самостоятельность.'}];
 const message='Что это значит?';
 const {chart}=chartContext(profile,message,new Date(),{history});
 assert.ok(chart?.relationship);
 const raw='Представь, что у каждого в паре есть время на свои дела. А планы на выходные можно обсудить заранее, чтобы обоим было удобно.';
 let calls=0;
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(raw);}});
 const result=await chat.answer({message,history,chart,forecast:null});
 assert.equal(calls,1);
 assert.equal(result.answer,raw);
});

test('a simplification cannot merely remove the word main from a repeated natal answer',async()=>{
 const previous='Главное — Солнце в Тельце: стремление к надёжности и спокойствию. Эти свойства можно рассматривать как тему для размышления, а не гарантию результата.';
 const repeated=previous.replace('Главное — ','');const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:previous}];
 assert.equal(repeatedSimplification(repeated,'Объясни проще.',history),true);
 assert.equal(repeatedSimplification(repeated.replace('результата','успеха'),'Объясни проще.',history),true);
 assert.equal(repeatedSimplification(repeated,'Кто я по гороскопу?',history),false);
 let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(repeated);}});
 const{chart}=chartContext(profile,'Объясни проще.',new Date(),{history});const result=await chat.answer({message:'Объясни проще.',history,chart,forecast:null});
 assert.equal(calls,2);assert.equal(result.model,null);assert.match(result.answer,/Тельце/);assert.notEqual(result.answer,repeated);
});

test('application clarifications keep the chart topic while selecting the new relationship section',()=>{
 const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:'Ответ по карте.'},{role:'user',content:'Как это проявляется в работе?'},{role:'assistant',content:'Ответ про работу.'}];
 const message='А как это проявляется в отношениях?';assert.match(groundingQuestion(message,history),/Что главное/u);
 const{chart}=chartContext(profile,message,new Date(),{history});assert.ok(chart.relationship);assert.equal(chart.relationship.requireOverview,false);
 const chain=[...history,{role:'user',content:message},{role:'assistant',content:'Ответ про отношения.'}];
 const q=groundingQuestion('Дай три конкретных шага.',chain);assert.match(q,/отношениях/);assert.doesNotMatch(q,/в работе/);
 assert.equal(chatIntent(q),'other');assert.ok(chartContext(profile,'Дай три конкретных шага.',new Date(),{history:chain}).chart.relationship);
 for(const simpler of ['Скажи проще.','Объясни простыми словами.','Скажи это проще, пожалуйста.'])assert.match(groundingQuestion(simpler,history),/Что главное/);
 const relationshipHistory=[{role:'user',content:'Что важно в отношениях по моей натальной карте?'},{role:'assistant',content:'Ответ об отношениях.'}];
 const workChart=chartContext(profile,'Как это проявляется в работе?',new Date(),{history:relationshipHistory}).chart;
 assert.ok(workChart);assert.equal(workChart.relationship,undefined);assert.equal(workChart.partnerMissing,undefined);
 const compatibilityHistory=[{role:'user',content:'Что показывает наша совместимость по натальной карте?'},{role:'assistant',content:'Ответ о совместимости.'}];
 assert.equal(chartContext(profile,'Как это проявляется в работе?',new Date(),{history:compatibilityHistory}).chart.partnerMissing,undefined);
 const ascChart=chartContext(profile,'Что означает мой асцендент?').chart;
 assert.match(plainNatalAnswer(ascChart,'Что означает мой асцендент?'),/Асцендент/);assert.doesNotMatch(plainNatalAnswer(ascChart,'Что означает мой асцендент?'),/Солнце/);
});

test('applying a solar sign to a life topic must not return only the sign name',async()=>{
 const history=[{role:'user',content:'Какой у меня знак зодиака?'},{role:'assistant',content:'Телец.'}];
 for(const message of ['Как это проявляется в работе?','Как это проявляется в отношениях?']){
  let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Солнце в Тельце. Это тема для разговора о твоём опыте и привычках.');}});
  const{chart}=chartContext(profile,message,new Date(),{history});assert.ok(chart);
  await chat.answer({message,history,chart,forecast:null});assert.ok(calls>0,'Application must use normal writer path');
 }
});

test('valid numbered actions cannot publish a copied instruction header',async()=>{
 const history=[{role:'user',content:'Почему мне сложно откладывать деньги?'},{role:'assistant',content:'Запиши расходы.'}];
 const message='Дай три конкретных шага.';let calls=0;
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Сначала ответь по делу, затем можно пояснить по карте.\n1. Запиши расходы.\n2. Проверь покупки.\n3. Выбери посильную сумму.');}});
 const{chart}=chartContext(profile,message,new Date(),{history});const result=await chat.answer({message,history,chart,forecast:null});
 assert.equal(calls,2);assert.equal(hasInstructionEcho(result.answer),false);assert.equal((result.answer.match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,3);
 assert.equal(hasInstructionEcho('Сначала запиши расходы и сравни их с планом.'),false);
 assert.equal(hasInstructionEcho('Сначала ответь по делу и приведи пример из своего опыта.'),false);
 assert.equal(hasInstructionEcho('Фраза «Сначала ответь по делу» означает просьбу отвечать кратко.'),false);
});

test('a repeated false Sun domicile is replaced by a checked personal answer',async()=>{
 const old=process.env.CHAT_FACT_GUARD;process.env.CHAT_FACT_GUARD='1';
 try{
  let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Возможно, тебе нравится доводить начатое до конца. Солнце в Тельце стоит в своём знаке.');}});
  const message='Что главное в моей натальной карте?';const{chart}=chartContext(profile,message);
  const result=await chat.answer({message,chart,history:[],forecast:null});assert.equal(calls,2);assert.equal(result.model,null);assert.equal(result.factFiltered,true);assert.deepEqual(astroFactProblems(result.answer,{question:message,chart}),[]);
 }finally{if(old===undefined)delete process.env.CHAT_FACT_GUARD;else process.env.CHAT_FACT_GUARD=old;}
});
