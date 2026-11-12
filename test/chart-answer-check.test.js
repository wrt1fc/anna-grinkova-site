import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartContext } from '../server/chat-grounding.js';
import { wrongCalculatedClaim, groundedNatalAnswer } from '../server/chart-answer-check.js';
import { createLocalChat, chatForecastContext } from '../server/local-chat.js';
import { forecastForDate } from '../server/daily-forecast.js';

const profile={birthUtc:'1990-05-15T09:30:00Z',birthTime:'12:30',birthLatitude:55.75,birthLongitude:37.62};
const chart=chartContext(profile,'Что означает мой Сатурн?').chart;

test('plural planetary and collective ruler placements cannot hide a wrong house or sign',()=>{
 const subject={calculated:{positions:{sun:{sign:'Телец',house:11},moon:{sign:'Близнецы',house:12}},aspects:[],houseRulers:[{house:2,sign:'Рак',rulers:[{planet:'moon',house:12},{planet:'sun',house:11}]}]}};
 for(const answer of ['Луна и Солнце стоят в 12 доме.','Луна и Солнце находятся в Тельце.','Управители 2 дома стоят в 11 доме.'])assert.equal(wrongCalculatedClaim(answer,subject),true,answer);
 for(const answer of ['Луна стоит в 12 доме, Солнце находится в 11 доме.','Управители 2 дома: Луна стоит в 12 доме, Солнце стоит в 11 доме.','Луна и Солнце не стоят в 12 доме.','Транзитные Луна и Солнце стоят в 12 доме.'])assert.equal(wrongCalculatedClaim(answer,subject),false,answer);
 for(const answer of ['Неверно, что управители 2 дома стоят в 11 доме.','Если управители 2 дома стоят в 11 доме, это другой пример, не твоя карта.'])assert.equal(wrongCalculatedClaim(answer,subject),false,answer);
 assert.equal(wrongCalculatedClaim('Неверно, что это приговор. Транзитные управители 2 дома стоят в 11 доме.',subject),false);
 assert.equal(wrongCalculatedClaim('Неверно, что это приговор. Управители 2 дома стоят в 11 доме.',subject),true);
});

test('explicit natal signs, angles, houses and aspects are compared with calculated facts',()=>{
  for(const answer of ['Сатурн у тебя в Овне.','Луна в Козероге в 8 доме.','Сатурн в восьмом доме.',
    'Трин Солнца и MC помогает карьере.','Солнце и асцендент соединены с MC.',
    'Венера в секстиле к Нептуну.','Асцендент в Рыбах.','Солнце и MC в Овне.'])assert.equal(wrongCalculatedClaim(answer,chart),true,answer);
  for(const answer of ['Сатурн у тебя в Козероге в 5 доме.','Сатурн в пятом доме.','Солнце и MC в Тельце.',
    'Квадрат Венеры и Нептуна.','Венера в квадрате к Нептуну.','Луна и Сатурн соединены.',
    'Трин Сатурна и Луны к MC.','Венера в Овне в 8-м доме.'])assert.equal(wrongCalculatedClaim(answer,chart),false,answer);
  assert.equal(wrongCalculatedClaim('Транзитный трин Солнца и MC рассматривают отдельно.',chart),false);
});

test('live three-planet lists and inverted house lists validate every named planet',()=>{
 const subject={calculated:{positions:{sun:{sign:'Телец',house:11},moon:{sign:'Близнецы',house:12},venus:{sign:'Весы',house:12}},aspects:[]}};
 assert.equal(wrongCalculatedClaim('Солнце, Луна и Венера в Близнецах и Весах в 12 доме.',subject),true);
 assert.equal(wrongCalculatedClaim('Луна и Венера в Близнецах и Весах в 12 доме.',subject),false);
 for(const text of ['Солнце, Луна и Венера стоят в Близнецах и Весах в 12 доме.','Солнце, Луна и Венера стоят в Близнецах в 12 доме.','В 12 доме собраны Солнце, Луна и Венера.','В 12 доме — Солнце и Луна.'])assert.equal(wrongCalculatedClaim(text,subject),true,text);
 for(const text of ['Луна и Венера стоят в Близнецах и Весах в 12 доме.','В 12 доме собраны Луна и Венера.','Транзитные Солнце, Луна и Венера стоят в Близнецах.','Луна и Венера не стоят в Тельце.'])assert.equal(wrongCalculatedClaim(text,subject),false,text);
 for(const text of ['В 12 доме Солнце и Луна не стоят.','Неверно, что в 12 доме собраны Солнце, Луна и Венера.','Если в 12 доме собраны Солнце, Луна и Венера, это пример.'])assert.equal(wrongCalculatedClaim(text,subject),false,text);
});

test('unknown time cannot acquire invented angles/houses and monetary context retains validation facts',()=>{
  const unknown=chartContext({...profile,birthTime:null},'Что означает мой Сатурн?').chart;
  assert.equal(wrongCalculatedClaim('Сатурн в пятом доме.',unknown),true);
  assert.equal(wrongCalculatedClaim('MC в Тельце.',unknown),true);
  const work=chartContext(profile,'А что с работой?').chart;
  assert.ok(work.calculated);assert.equal(wrongCalculatedClaim('Солнце и асцендент соединены.',work),true);
  assert.equal(JSON.stringify(work).includes('calculated'),false);
});

test('an invented aspect is retried before publication and receives a calculated fallback on repeat failure',async()=>{
  let calls=0;const deltas=[];
  const writer=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return{ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:'Привет! Трин Солнца и MC помогает тебе выбрать профессию.',done:true,done_reason:'stop'})+'\n'));c.close();}})};}});
  const result=await writer.answer({message:'В чём мои сильные стороны?',history:[],forecast:chatForecastContext(forecastForDate('2026-10-31')),chart,onDelta:d=>deltas.push(d)});
  assert.equal(calls,2);assert.equal(result.groundedFallback,true);assert.equal(deltas.join(''),result.answer);
  assert.equal(wrongCalculatedClaim(result.answer,chart),false);assert.doesNotMatch(result.answer,/Трин Солнца и MC/);
});

test('calculated fallback selects the requested planet and respects answer sizes',()=>{
  for(const length of ['short','medium','detailed']){
    const text=groundedNatalAnswer(chart,'Что означает мой Сатурн?',length);
    assert.match(text,/Сатурн в Козероге/);assert.ok(text.length<({short:390,medium:890,detailed:1790})[length]);
    assert.equal(wrongCalculatedClaim(text,chart),false);
  }
});

test('detailed full natal fallback develops multiple calculated indicators',()=>{
  const text=groundedNatalAnswer(chart,'Разбери мою натальную карту подробно.','detailed');
  assert.ok(text.length >= 400 && text.length <= 1800);
  for (const name of ['Солнце','Луна','Меркурий','Венера']) assert.ok(text.includes(name),name);
  assert.equal(wrongCalculatedClaim(text,chart),false);
});

test('a detailed money length retry cannot publish a generic natal fallback',async()=>{
  const message='Где мой доход по натальной карте?';
  const moneyChart=chartContext(profile,message).chart;
  let calls=0;const deltas=[];
  const writer=createLocalChat({model:'fixture',fetchImpl:async()=>{
    calls++;
    return {ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:'Доход зависит от выбранного дела.',done:true,done_reason:'stop'})+'\n'));c.close();}})};
  }});
  // Its topic-specific calculated fallback is currently too brief for detailed
  // mode. Fail honestly rather than replacing the money topic with Sun/Moon.
  await assert.rejects(writer.answer({message,history:[],forecast:chatForecastContext(forecastForDate('2026-10-31')),chart:moneyChart,length:'detailed',onDelta:d=>deltas.push(d)}),/incomplete detailed answer/);
  assert.equal(calls,2);assert.deepEqual(deltas,[]);
});

test('a repeated brief full natal reply publishes a validated developed natal fallback',async()=>{
  const message='Разбери мою натальную карту подробно.';
  const natalChart=chartContext(profile,message).chart;
  let calls=0;const deltas=[];
  const writer=createLocalChat({model:'fixture',fetchImpl:async()=>{
    calls++;
    return {ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:'В карте есть разные показатели.',done:true,done_reason:'stop'})+'\n'));c.close();}})};
  }});
  const result=await writer.answer({message,history:[],forecast:chatForecastContext(forecastForDate('2026-10-31')),chart:natalChart,length:'detailed',onDelta:d=>deltas.push(d)});
  assert.equal(calls,2);assert.ok(result.answer.length>=400);assert.equal(result.groundedFallback,true);
  assert.equal(wrongCalculatedClaim(result.answer,natalChart),false);assert.deepEqual(deltas,[result.answer]);
});

test('co-ruler keeps the explicit money-house topic across the first ruler placement',()=>{
  const moneyChart={calculated:{positions:{neptune:{house:1},jupiter:{house:11},mars:{house:11}},aspects:[],houseRulers:[
    {house:1,rulers:[{planet:'mars',house:11}]},
    {house:2,rulers:[{planet:'neptune',house:1},{planet:'jupiter',house:11}]},
  ]}};
  const first='Один из управителей денежного дома — Нептун — стоит в 1 доме. ';
  assert.equal(wrongCalculatedClaim(first+'Другой управитель — Юпитер — стоит в 11 доме.',moneyChart),false);
  assert.equal(wrongCalculatedClaim(first+'Второй управитель, Юпитер, стоит в 11 доме.',moneyChart),false);
  assert.equal(wrongCalculatedClaim(first+'Другой управитель — Марс — стоит в 11 доме.',moneyChart),true);
  assert.equal(wrongCalculatedClaim(first+'Теперь у 1 дома другой управитель — Юпитер.',moneyChart),true);
});

test('a cusp topic qualified by its first ruler anchors later co-rulers rather than planet placement houses',()=>{
  const facts={calculated:{positions:{jupiter:{house:12},neptune:{house:2},moon:{house:4},sun:{house:11},mars:{house:4},pluto:{house:8},venus:{house:9}},aspects:[],houseRulers:[
    {house:2,rulers:[{planet:'jupiter',house:12},{planet:'neptune',house:2}]},
    {house:4,rulers:[{planet:'venus',house:9}]},
    {house:7,rulers:[{planet:'mars',house:4},{planet:'pluto',house:8}]},
    {house:12,rulers:[{planet:'moon',house:4}]},
  ]}};
  const first='Куспид 2 дома в Стрельце, а его управитель Юпитер стоит в 12 доме. ';
  assert.equal(wrongCalculatedClaim(first+'Второй управитель, Нептун, стоит во 2 доме.',facts),false);
  assert.equal(wrongCalculatedClaim(first+'Другой управитель — Нептун — стоит во втором доме.',facts),false);
  assert.equal(wrongCalculatedClaim(first+'Второй управитель, Марс, стоит в 4 доме.',facts),true);
  assert.equal(wrongCalculatedClaim(first+'Второй управитель, Нептун, стоит в 4 доме.',facts),true);
  assert.equal(wrongCalculatedClaim(first+'Теперь у седьмого дома второй управитель — Плутон, он стоит в 8 доме.',facts),false);
  assert.equal(wrongCalculatedClaim(first+'Теперь седьмой дом. Второй управитель — Нептун, он стоит во 2 доме.',facts),true);
  assert.equal(wrongCalculatedClaim(first+'Седьмой дом. Второй управитель — Плутон, он стоит в 8 доме.',facts),false);
  assert.equal(wrongCalculatedClaim(first+'Куспид седьмого дома в Овне. Второй управитель — Плутон, он стоит в 8 доме.',facts),false);
  assert.equal(wrongCalculatedClaim(first+'Куспид седьмого дома в Овне. Второй управитель — Нептун, он стоит во 2 доме.',facts),true);
  assert.equal(wrongCalculatedClaim(first+'Управитель Юпитера — Марс. Его второй управитель — Плутон.',facts),false);
  // A dash before a placement is still a co-ruler assertion, not a dispositor transition.
  assert.equal(wrongCalculatedClaim(first+'Второй управитель Нептун — во 2 доме. Третий управитель — Марс.',facts),true);
  assert.equal(wrongCalculatedClaim(first+'Второй управитель Нептун, стоит во 2 доме. Третий управитель — Марс.',facts),true);
  assert.equal(wrongCalculatedClaim(first+'Второй управитель Нептун — во 2 доме.',facts),false);
  // Merely mentioning a cusp and another planet does not establish whose ruler follows.
  assert.equal(wrongCalculatedClaim('Куспид 2 дома в Стрельце. Венера стоит в 9 доме. Её управитель Марс.',facts),false);
  const cancer=structuredClone(facts);cancer.calculated.houseRulers[0].rulers=[{planet:'moon',house:4},{planet:'sun',house:11}];
  assert.equal(wrongCalculatedClaim('Куспид 2 дома в Раке, его управитель Луна стоит в 4 доме. Второй управитель, Солнце, стоит в 11 доме.',cancer),false);
  assert.equal(wrongCalculatedClaim('Начало второго дома в Раке, его управитель Луна стоит в 4 доме. Другой управитель — Юпитер.',cancer),true);
});

test('ruler claims are checked against the calculated table for all twelve houses',()=>{
  // 1990-05-15 chart: the 1st house (Дева) is ruled by Mercury, which stands in the 9th house.
  assert.equal(wrongCalculatedClaim('Управитель 1 дома — Меркурий, он стоит в 9 доме.',chart),false);
  assert.equal(wrongCalculatedClaim('Управитель 1 дома — Венера.',chart),true);
  assert.equal(wrongCalculatedClaim('Управитель 1 дома стоит в 7 доме.',chart),true);
  // Co-rulers both pass: the 11th house (Рак) is ruled by the Moon (5th) and the Sun (9th).
  assert.equal(wrongCalculatedClaim('У 11 дома два управителя: Луна в 5 доме и Солнце в 9 доме.',chart),false);
  assert.equal(wrongCalculatedClaim('Управитель 11 дома Луна стоит в 8 доме.',chart),true);
});

test('lunar node and Lilith claims are validated like planet claims',()=>{
  const nodeFacts={calculated:{positions:{},angles:null,houses:[],aspects:[{first:'uranus',second:'node',aspect:'conjunction',orb:1.5}]}};
  assert.equal(wrongCalculatedClaim('Соединение Урана и Северного узла тянет к нестандартному пути.',nodeFacts),false);
  const noAspect={calculated:{positions:{},angles:null,houses:[],aspects:[]}};
  assert.equal(wrongCalculatedClaim('Соединение Урана и Северного узла тянет к нестандартному пути.',noAspect),true);
});

test('ruler claims without a house number are checked against the house last mentioned in the answer',()=>{
  // Regression from the live chat: the model invented Pluto as a co-ruler of the house under discussion.
  assert.equal(wrongCalculatedClaim('В 11 доме у тебя Лев. Его управители Солнце и Плутон.',chart),true);
  // 11th house (Рак): the Moon and the Sun are both accepted.
  assert.equal(wrongCalculatedClaim('В 11 доме у тебя Рак. Его управители Луна и Солнце.',chart),false);
  assert.equal(wrongCalculatedClaim('В 11 доме у тебя Рак. Управители дома: Луна и Солнце.',chart),false);
  // Without any house mentioned the claim cannot be verified and passes.
  assert.equal(wrongCalculatedClaim('Его управитель Марс очень сильный.',chart),false);
});

test('dash-separated placements are checked while quotes and explicit negations are ignored',()=>{
  assert.equal(wrongCalculatedClaim('Венера — в 9 доме.',chart),true);
  assert.equal(wrongCalculatedClaim('Другой управитель — Венера — в 9 доме.',chart),true);
  assert.equal(wrongCalculatedClaim('Венера — стоит в 8-м доме.',chart),false);
  assert.equal(wrongCalculatedClaim('«Венера — в 9 доме» — неверный пример.',chart),false);
  assert.equal(wrongCalculatedClaim('Венера не в 9 доме.',chart),false);
});

test('direct birth-sign assertions use the calculated Sun rather than an invented sign',()=>{
  const libra = {calculated:{positions:{sun:{sign:'Весы'}},aspects:[]}};
  for (const answer of ['Ты родилась под знаком Рыб.','Ты родился под знаком Рыбы.','Вы родились под знаком Овна.', 'Твой солнечный знак — Рыбы.']) {
    assert.equal(wrongCalculatedClaim(answer,libra),true,answer);
  }
  for (const answer of ['Ты родилась под знаком Весы.','Ты родился под знаком Весов.','Твой солнечный знак — Весы.', 'Твой солнечный знак: Весов.']) {
    assert.equal(wrongCalculatedClaim(answer,libra),false,answer);
  }
});

test('birth-sign guard ignores negation, quotes, other people, unknown subjects and conditionals',()=>{
  const libra = {calculated:{positions:{sun:{sign:'Весы'}},aspects:[]}};
  for (const answer of [
    'Ты не родилась под знаком Рыб.', 'Ты родилась не под знаком Рыб.',
    'Твой солнечный знак — не Рыбы.', 'Неправда, что ты родилась под знаком Рыб.',
    'Не твой солнечный знак — Рыбы, а её.',
    'Не факт, что ты родилась под знаком Рыб.',
    'Нельзя утверждать, что ты родилась под знаком Рыб.',
    'Нет оснований считать, что твой солнечный знак — Рыбы.',
    '«Ты родилась под знаком Рыб» — ошибка.', '“Твой солнечный знак — Рыбы” — пример.',
    "'Ты родилась под знаком Рыб' — цитата.",
    'Твоя сестра родилась под знаком Рыб.', 'Анна родилась под знаком Рыб.',
    'Я родилась под знаком Рыб.', 'Родилась под знаком Рыб.',
    'Если ты родилась под знаком Рыб, это другой пример.',
    'Ты родилась под знаком Рыб, если принять эту гипотезу.',
    'Допустим, твой солнечный знак — Рыбы.',
    'Она сказала, что ты родилась под знаком Рыб.',
    'Ты родилась под знаком Рыб?',
  ]) assert.equal(wrongCalculatedClaim(answer,libra),false,answer);
  assert.equal(wrongCalculatedClaim('Ты родилась под знаком Рыб.',{...libra,partner:{}}),false);
  assert.equal(wrongCalculatedClaim('Ты родилась под знаком Рыб.',{calculated:{positions:{},aspects:[]}}),false);
  assert.equal(wrongCalculatedClaim('Если она родилась под знаком Рыб, это пример. Ты родилась под знаком Рыб.',libra),true);
});

const piscesRulers = {calculated:{positions:{neptune:{house:12},jupiter:{house:7},mars:{house:1},pluto:{house:4}},aspects:[],houseRulers:[
  {house:1,rulers:[{planet:'neptune',house:12},{planet:'jupiter',house:7}]},
  {house:7,rulers:[{planet:'mars',house:1},{planet:'pluto',house:4}]},
  {house:12,rulers:[{planet:'moon',house:9}]},
]}};

test('word-numbered ruler declarations and comma co-rulers cannot invent extra rulers',()=>{
  for (const answer of [
    'Управитель первого дома, Марс, помогает действовать.',
    'Управитель первого дома, Марс, не мешает действовать.',
    'Управитель первого дома — Марс, если говорить о твоей личности.',
    'Управитель первого дома — Марс, если смотреть на твою личность.',
    'Управитель первого дома — Марс, если сказать проще.',
    'Управители первого дома: Нептун, Марс.',
    'Управитель первого дома, Нептун, стоит в 12 доме. Юпитер стоит в 7 доме. Второй управитель, Марс, отвечает за действие. Третий управитель, Плутон, добавляет глубину.',
    'Управитель первого дома — Нептун в 12 доме. Второй управитель, Плутон.',
    'Управитель первого дома — Нептун в 12 доме. Второй управитель — Юпитер в 7 доме. Третий управитель, Марс.',
  ]) assert.equal(wrongCalculatedClaim(answer,piscesRulers),true,answer);
  for (const answer of [
    'Управитель первого дома, Нептун, стоит в 12 доме. Второй управитель, Юпитер, стоит в 7 доме.',
    'Управители первого дома: Нептун, Юпитер.',
    'Управитель первого дома находится в двенадцатом доме.',
    'Управитель первого дома — Нептун в 12 доме. Управитель седьмого дома, Марс, стоит в 1 доме. Второй управитель, Плутон, стоит в 4 доме.',
    'Управитель первого дома — Нептун в 12 доме. Теперь 7 дом. Второй управитель, Плутон, стоит в 4 доме.',
    'Управитель первого дома — Нептун в 12 доме. Теперь седьмой дом. Второй управитель — Плутон в 4 доме.',
    'Управитель первого дома — Нептун в 12 доме. Перейдём к седьмому дому. Второй управитель — Плутон в 4 доме.',
    'Управитель первого дома — Нептун в 12 доме. Управитель Нептуна — Марс.',
    'Управитель первого дома — Нептун в 12 доме. Управитель Нептуна, Марс, отвечает за действие.',
    'Нептун стоит в 12 доме. Его управитель Марс.',
  ]) assert.equal(wrongCalculatedClaim(answer,piscesRulers),false,answer);
});

test('all twelve genitive house ordinals are normalized for explicit ruler claims',()=>{
  const words = ['первого','второго','третьего','четвёртого','пятого','шестого','седьмого','восьмого','девятого','десятого','одиннадцатого','двенадцатого'];
  const facts = {calculated:{positions:{},aspects:[],houseRulers:words.map((_,i)=>({house:i+1,rulers:[{planet:'mercury',house:9}]}))}};
  for (const word of words) {
    assert.equal(wrongCalculatedClaim(`Управитель ${word} дома, Меркурий.`,facts),false,word);
    assert.equal(wrongCalculatedClaim(`Управитель ${word} дома, Марс.`,facts),true,word);
  }
});

test('quoted, conditional and explicitly negated ruler statements do not become chart facts',()=>{
  for (const answer of [
    '«Управитель первого дома, Марс» — ошибочная фраза.',
    'Если управитель первого дома — Марс, это другой пример.',
    'Если бы куспид был в Овне, управитель первого дома — Марс.',
    'Не управитель первого дома — Марс, а показатель активности.',
    'Неправда, что управитель первого дома — Марс.',
    'Управитель первого дома — не Марс.',
    'Управитель первого дома — Нептун. Второй управитель не Марс.',
  ]) assert.equal(wrongCalculatedClaim(answer,piscesRulers),false,answer);
});
