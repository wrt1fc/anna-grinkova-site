import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartContext} from '../server/chat-grounding.js';
import {chartRecords,recordAnswerProblem,anchorRecordReply} from '../server/chart-records.js';
import {createLocalChat} from '../server/local-chat.js';
import {namedChartPoints} from '../server/chart-answer-check.js';
const profile={birthUtc:'1992-01-07T03:05:00Z',birthLatitude:56.84,birthLongitude:60.61};
test('point names use word boundaries rather than fragments of professions',()=>{
 assert.deepEqual(namedChartPoints('Работа маркетологом и лунный календарь'),[]);
 assert.deepEqual(namedChartPoints('Объясни положение Марса и Луны'),['moon','mars']);
 assert.deepEqual(namedChartPoints('Что означает MC?'),['mc']);
});
test('separate position records cannot inherit another planet or cusp sign and preserve original facts',()=>{
 const chart=chartContext(profile,'Что главное в моей натальной карте?').chart;
 const records=chartRecords(chart,'Что главное в моей натальной карте?');
 assert.deepEqual(records.positions,[{planet:'Солнце',sign:'Козерог',house:1},{planet:'Луна',sign:'Водолей',house:1},{planet:'Асцендент',sign:'Стрелец',house:null}]);
 assert.equal(records.houseRulers.length,0);assert.equal(chart.calculated.positions.sun.sign,'Козерог');assert.equal(chart.houseRulers.length,12);
 assert.ok(JSON.stringify(records).length<JSON.stringify(chart).length/2);
});
test('income records retain both rulers with each own sign and house; complex questions keep full data',()=>{
 const chart=chartContext(profile,'Как мне зарабатывать?').chart;
 const records=chartRecords(chart,'Как мне зарабатывать?');
 assert.equal(records.money.rulerCount,2);
 assert.deepEqual(records.houseRulers[0].rulers.map(r=>[r.planet,r.sign,r.house]),[['Уран','Козерог',1],['Сатурн','Водолей',1]]);
 assert.equal(chartRecords(chart,'Сделай полный разбор моей карты'),chart);
 assert.equal(chartRecords(chart,'Мой Сатурн ретроградный?'),chart);
 assert.equal(chartRecords(chart,'Какие планеты находятся в первом доме моей карты?'),chart);
 assert.equal(chartRecords(chart,'Какие планеты есть в моей натальной карте?'),chart);
 assert.equal(chartRecords({...chart,partner:{}},'Расскажи про карту').partner!==undefined,true);
});
test('unknown birth time never acquires houses or angles in records',()=>{
 const chart=chartContext({...profile,birthTime:null},'Что главное в моей натальной карте?').chart;
 const records=chartRecords(chart,'Что главное в моей натальной карте?');
 assert.ok(records.positions.every(p=>p.house===null));assert.ok(records.positions.every(p=>p.planet!=='Асцендент'));
});

test('record publication rejects unsupported roles, missing anchors and first-person readings',async()=>{
 const old=process.env.ANNA_CHART_FOCUS;process.env.ANNA_CHART_FOCUS='30';
 const chart=chartContext(profile,'Что главное в моей натальной карте?').chart;
 const stream=text=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});
 try{
  for(const [message,bad]of [
   ['Что главное в моей натальной карте?','Солнце и Луна стоят в первом доме. Оба управителя стоят в первом доме.'],
   ['Как мне расти в профессии с учётом моей карты?','Выбери навык и потренируй его на небольшой задаче. Попроси обратную связь.'],
   ['Объясни мою натальную карту простыми словами.','Солнце в Козероге в первом доме: я живу через дела и цели.'],
  ]){
   let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(bad);}});
   const result=await chat.answer({message,chart,history:[],forecast:null});
   assert.equal(calls,2);assert.equal(result.model,null);assert.match(result.answer,/Солнце/);assert.equal(recordAnswerProblem(result.answer,chart,message),false);
  }
  assert.equal(recordAnswerProblem('Солнце в Козероге, Луна в Водолее. Не нужно называть их управителями без указания дома.',chart,'Что главное в моей натальной карте?'),false);
  assert.equal(recordAnswerProblem('Солнце в Козероге. Попробуй фразу «я чувствую спокойствие», если она тебе подходит.',chart,'Что главное в моей натальной карте?'),false);
  const service='В приложении не открывается моя натальная карта, что делать?';
  const help='Уточни, что именно происходит при открытии страницы, и попробуй обновить её.';
  assert.equal(chartRecords(chart,service),null);
  assert.equal(recordAnswerProblem(help,chart,service),false);
  assert.equal(anchorRecordReply(help,chart,service),help);
  const serviceChat=createLocalChat({model:'fixture',fetchImpl:async()=>stream(help)});
  assert.equal((await serviceChat.answer({message:service,chart,history:[],forecast:null})).model,'fixture');
  const support='Мне тревожно из-за моей натальной карты, поддержи.';
  assert.equal(recordAnswerProblem('Попробуй поговорить с близким человеком и выделить время для отдыха.',chart,support),false);
  const steps=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Выбери рабочий навык и потренируй его на небольшой задаче.')});
  const counted=await steps.answer({message:'Как расти в профессии по моей карте? Дай пять конкретных шагов.',chart,history:[],forecast:null,length:'short'});
  assert.ok(counted.answer.length<=400);
  assert.equal((counted.answer.match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,5);
 }finally{if(old===undefined)delete process.env.ANNA_CHART_FOCUS;else process.env.ANNA_CHART_FOCUS=old;}
});
