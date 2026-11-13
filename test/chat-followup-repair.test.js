import {test}from'node:test';import assert from'node:assert/strict';
import{groundingQuestion,repeatedSimplification}from'../server/chat-topics.js';
import{chartContext}from'../server/chat-grounding.js';
import{createLocalChat}from'../server/local-chat.js';
import{plainNatalAnswer}from'../server/chart-answer-check.js';
import{chatIntent}from'../server/chat-intent.js';
const profile={birthUtc:'1990-05-15T09:30:00Z',birthTime:'12:30',birthLatitude:55.75,birthLongitude:37.62};
const stream=text=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});

test('counted follow-ups retain the last independent budget question rather than an older chart topic',async()=>{
 const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:'Ответ про карту.'},{role:'user',content:'А как это проявляется в отношениях?'},{role:'assistant',content:'Ответ про отношения.'},{role:'user',content:'Почему мне сложно откладывать деньги?'},{role:'assistant',content:'Запиши расходы.'}];
 const message='Дай три конкретных шага.';const q=groundingQuestion(message,history);
 assert.match(q,/Почему мне сложно откладывать деньги/u);assert.doesNotMatch(q,/главное|отношениях/u);assert.equal(chatIntent(q),'budget');
 let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Солнце в Тельце. Деньги связаны с самоощущением и спокойствием.');}});
 const{chart}=chartContext(profile,message,new Date(),{history});const result=await chat.answer({message,history,chart,forecast:null});
 assert.equal(calls,2);assert.equal((result.answer.match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,3);assert.match(result.answer,/расход|покуп|накоп/iu);
 assert.equal(groundingQuestion('Дай три шага для отношений.',history),'Дай три шага для отношений.');
});

test('meaning clarification follows the calculated solar sign without generating a new zodiac classification',async()=>{
 const history=[{role:'user',content:'Я спрашиваю только знак зодиака. Назови его.'},{role:'assistant',content:'Твой знак — Телец.'}];
 const message='Что это значит простыми словами?';const{chart}=chartContext(profile,message,new Date(),{history});assert.ok(chart);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('Calculated meaning must not call generation');}});
 const result=await chat.answer({message,history,chart,forecast:null});assert.match(result.answer,/Солнце в Тельце/u);assert.doesNotMatch(result.answer,/триад|Водолей/iu);assert.match(result.answer,/опыт/iu);
 assert.ok(plainNatalAnswer(chart,'Солнце','detailed').length>=400);
});

test('a simplification cannot merely remove the word main from a repeated natal answer',async()=>{
 const previous='Главное — Солнце в Тельце: стремление к надёжности и спокойствию. Эти свойства можно рассматривать как тему для размышления, а не гарантию результата.';
 const repeated=previous.replace('Главное — ','');const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:previous}];
 assert.equal(repeatedSimplification(repeated,'Объясни проще.',history),true);
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
 for(const simpler of ['Скажи проще.','Объясни простыми словами.'])assert.match(groundingQuestion(simpler,history),/Что главное/);
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
