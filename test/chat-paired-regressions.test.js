import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalChat,chatPrompt,firstPassSystem} from '../server/local-chat.js';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {incompleteMoneyExplanation} from '../server/chat-explanation.js';
import {groundingQuestion,wantsNoAstroTerms} from '../server/chat-topics.js';
import {astroFactProblems} from '../server/astro-fact-guard.js';

const profile={birthUtc:'1997-10-08T21:30:00Z',birthLatitude:48.48,birthLongitude:135.08};
const q='Назови управителей 1, 2, 3, 4, 5 и 6 домов моей натальной карты.';
const table='1 дом (Весы): Венера в 2 доме. 2 дом (Скорпион): Плутон и Марс в 2 доме. 3 дом (Стрелец): Юпитер и Нептун в 4 доме. 4 дом (Козерог): Сатурн в 6 доме и Уран в 4 доме. 5 дом (Водолей): Уран в 4 доме и Сатурн в 6 доме. 6 дом (Рыбы): Нептун в 4 доме и Юпитер в 4 доме.';
const stream=response=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response,done:true,done_reason:'stop'})+'\n'));c.close();}})});
const context=(message,p=profile,options={})=>chartContext(p,message,new Date('2026-11-14T09:00:00Z'),options).chart;
async function flags(fn){const names=['ANNA_FACT_ANSWERS','ANNA_FACT_EXPLANATIONS','ANNA_CHART_FOCUS','CHAT_FACT_GUARD'],old=names.map(n=>process.env[n]);names.forEach((n,i)=>process.env[n]=i===2?'30':'1');try{return await fn();}finally{names.forEach((n,i)=>{if(old[i]===undefined)delete process.env[n];else process.env[n]=old[i];});}}

test('the observed complete compact house table is kept after one generation',async()=>{
 const chart=context(q);assert.equal(incompleteMoneyExplanation(table,chart,q,'short'),false);
 let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(table);}});
 const r=await chat.answer({message:q,history:[],chart,forecast:null,length:'short'});
 assert.equal(calls,1);assert.equal(r.model,'fixture');assert.equal(r.answer,'Привет! '+table);
 assert.equal(incompleteMoneyExplanation(table.split(' 6 дом')[0],chart,q,'short'),true);
});

test('a malformed compact table never hides an incorrect shared placement',()=>{
 const chart=context(q);assert.equal(wrongCalculatedClaim(table.replace('Сатурн в 6 доме','Сатурн в 4 доме'),chart),true);
});

test('new simplification wording inherits its topic without inheriting a new subject',async()=>{
 const history=[{role:'user',content:'Что главное в моей натальной карте?'},{role:'assistant',content:'Солнце и асцендент в Весах, Луна в Козероге. Это разные показатели твоей карты.'}];
 const message='А если объяснить совсем по-простому?';
 assert.match(groundingQuestion(message,history),/Что главное/u);
 assert.equal(groundingQuestion('Объясни проще, почему не работает отопление?',history),'Объясни проще, почему не работает отопление?');
 await flags(async()=>{
  const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream(history[1].content)});
  const r=await chat.answer({message,history,chart:context(message,profile,{history}),forecast:null});
  assert.doesNotMatch(r.answer,/асцендент|Козерог|Весах/u);
 });
});

test('plain-language exclusions support planet, sign and house lists',async()=>flags(async()=>{
 const message='Расскажи о моих сильных сторонах обычными словами: без планет, знаков и домов.';
 assert.equal(wantsNoAstroTerms(message),true);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Солнце в Весах в 12 доме означает умение договариваться и искать равновесие.')});
 const r=await chat.answer({message,history:[],chart:context(message),forecast:null});
 assert.doesNotMatch(r.answer,/Солнц|Весах|12 доме/u);
}));

test('shared subjects keep their own calculated signs and houses',()=>{
 const first=context('Какая работа мне подходит?');
 assert.equal(wrongCalculatedClaim('Управители 10 дома, Луна и Солнце, стоят в Весах и в 12 доме.',first),true);
 assert.equal(wrongCalculatedClaim('Луна и Солнце, стоят в Козероге и Весах.',first),false);
 const second=context('Объясни мой Марс.',{...profile,birthUtc:'1998-05-31T14:30:00Z',birthLatitude:56.33,birthLongitude:44});
 assert.equal(wrongCalculatedClaim('Солнце и Марс в соединении в 8 доме.',second),true);
 assert.equal(wrongCalculatedClaim('Солнце в 8 доме, а Марс в 7 доме.',second),false);
});

test('a conjunction does not turn the Sun and ASC into one planet',()=>{
 const text='Солнце и асцендент в Весах: это одна планета, и она стоит в 12 доме.';
 assert.ok(astroFactProblems(text,{chart:context('Что главное в моей натальной карте?')}).some(p=>p.code==='angle_is_not_planet'));
 assert.ok(astroFactProblems('Солнце и асцендент в Весах, и это одна и та же планета.').some(p=>p.code==='angle_is_not_planet'));
 assert.ok(!astroFactProblems('Солнце и асцендент — не одна планета. Асцендент является углом карты.').some(p=>p.code==='angle_is_not_planet'));
 assert.ok(!astroFactProblems('Солнце и асцендент обозначают одну планету? Нет: асцендент — угол карты.').some(p=>p.code==='angle_is_not_planet'));
});

test('uncertain signs cannot be asserted from their placeholder positions',async()=>flags(async()=>{
 const message='Скажи мой асцендент и в каком доме Луна, если время рождения неизвестно.';
 const chart=context(message,{...profile,birthTime:null});assert.ok(chart.uncertainPositions.includes('moon'));
 assert.equal(wrongCalculatedClaim('Знак Луны у тебя Козерог, но дом и асцендент неизвестны.',chart),true);
 assert.equal(wrongCalculatedClaim('Луна может быть в Козероге или в Водолее; без времени точный знак не определяю.',chart),false);
 assert.equal(wrongCalculatedClaim('Нельзя утверждать, что знак Луны — Лев: время рождения неизвестно.',chart),false);
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Асцендент и дома нельзя определить. Знак Луны у тебя Козерог.')});
 const r=await chat.answer({message,history:[],chart,forecast:null});assert.doesNotMatch(r.answer,/Козерог/u);assert.match(r.answer,/врем|не определ/iu);
}));

test('every chart projection carries an explicit owner and no birth identifiers',async()=>flags(async()=>{
 for(const focus of ['26','30']){
  process.env.ANNA_CHART_FOCUS=focus;
  for(const message of ['Что главное в моей натальной карте?','Как мне зарабатывать?','Какие планеты управляют денежным домом моей карты?']){
   const chart=context(message);const payload=JSON.parse(chatPrompt({message,history:[],chart,forecast:null}));
   assert.equal(payload.chart.subject.kind,'visitor');assert.doesNotMatch(JSON.stringify(payload.chart.subject),/birth|email|latitude|longitude/iu);
  }
 }
 const chart=context('Где Марс моей сестры?',profile,{subject:{relation:'sibling',label:'Сестра',gender:'female'}});
 assert.equal(chart.subject.kind,'selected');assert.equal(chart.subject.relation,'sibling');
 const missing=context('Что главное в моей натальной карте?',null,{subject:{relation:'sibling',label:'Сестра'}});assert.equal(missing.subject.kind,'selected');
}));

test('native and stored charts produce the same private model payload',async()=>flags(async()=>{
 for(const focus of ['26','30'])for(const message of ['Что главное в моей натальной карте?','Как мне зарабатывать?','Где мой Марс?']){
  process.env.ANNA_CHART_FOCUS=focus;
  const chart=context(message);
  const stored={...chart,calculated:chart.calculated};
  const input={message,history:[],forecast:null};
  const native=chatPrompt({...input,chart});const restored=chatPrompt({...input,chart:stored});
  assert.equal(native,restored);assert.equal('calculated' in JSON.parse(native).chart,false);
 }
 const owner=context('Что главное в моей натальной карте?');
 assert.match(firstPassSystem({message:'Что главное в моей натальной карте?',chart:owner}),/расчёт принадлежит посетителю/u);
 const sister=context('Что главное в моей натальной карте?',profile,{subject:{relation:'sibling',label:'Сестра'}});
 assert.match(firstPassSystem({message:'Что главное в её карте?',chart:sister}),/выбранному близкому человеку/u);
}));

test('uncertain overview fallbacks cannot reintroduce a placeholder through anchoring',async()=>flags(async()=>{
 const message='Расскажи о моих сильных сторонах по натальной карте.';
 const chart=context(message,{...profile,birthUtc:'1997-03-20T12:00:00Z',birthTime:null});assert.equal(chart.solarSignUncertain,true);
 const writer=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Ты Овен. Солнце в Овне определяет твой характер.')});
 const result=await writer.answer({message,history:[],chart,forecast:null});
 assert.doesNotMatch(result.answer,/Овен|Овне|Рыбах/u);assert.equal(wrongCalculatedClaim(result.answer,chart),false);
 assert.equal(wrongCalculatedClaim('Возможно, Солнце в Овне; без времени точный знак не определяю.',chart),false);
 const simple=await writer.answer({message:message+' Обычными словами, без планет, знаков и домов.',history:[],chart,forecast:null});
 assert.doesNotMatch(simple.answer,/использовать воображение|начинать дело и проверять идеи/u);
}));

test('new shared-placement forms preserve quoted, conditional and transit examples',()=>{
 const chart=context('Что главное в моей натальной карте?');
 for(const answer of ['Если Солнце и Марс в соединении в 8 доме, это лишь пример.','Транзитные Солнце и Марс в соединении в 8 доме.','Пример: «Луна и Солнце, стоят в Весах и в 12 доме».'])assert.equal(wrongCalculatedClaim(answer,chart),false,answer);
});

test('compact ruler tables reject missing and additional incorrect rulers',()=>{
 const message='Назови управителей 1 и 2 домов моей натальной карты.';const chart=context(message);
 assert.equal(incompleteMoneyExplanation('1 дом: Венера. 2 дом: Плутон и Марс.',chart,message,'short'),false);
 assert.equal(incompleteMoneyExplanation('1 дом: Венера и Солнце. 2 дом: Плутон и Марс.',chart,message,'short'),true);
 assert.equal(incompleteMoneyExplanation('1 дом: Венера. 2 дом: Плутон.',chart,message,'short'),true);
});

test('an actually oversized compact list asks for more space instead of dropping houses',async()=>flags(async()=>{
 const message='Назови управителей 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 и 12 домов моей натальной карты.';
 const writer=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Управитель 1 дома — Венера.')});
 const result=await writer.answer({message,history:[],chart:context(message),forecast:null,length:'short'});
 assert.match(result.answer,/не помещается/u);assert.doesNotMatch(result.answer,/1 дом:|Венера/u);
}));
