import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartContext } from '../server/chat-grounding.js';
import { asksAboutChart, natalChart } from '../server/astro-chart.js';
import { relationshipContext, relationshipAnswerProblems, groundedRelationshipAnswer } from '../server/relationship-context.js';
import { SIGN_RULERS } from '../server/anna-method.js';
import { createLocalChat, chatForecastContext } from '../server/local-chat.js';
import { forecastForDate } from '../server/daily-forecast.js';

const profile = { birthUtc:'1990-05-15T09:30:00Z', birthTime:'12:30', birthLatitude:55.75, birthLongitude:37.62 };
const forecast = chatForecastContext(forecastForDate('2026-10-31'));
const chart = chartContext(profile,'Какой мужчина мне нужен?').chart;
const stream = (text) => ({ ok:true, body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}}) });

test('everyday partner wording actually sends the calculated natal chart', () => {
  for(const message of ['Какой мужчина мне нужен?','Какая женщина мне подходит?','Как найти своего партнёра?']) {
    assert.ok(asksAboutChart(message),message);
    const result=chartContext(profile,message).chart;
    assert.ok(result.relationship.seventhHouse);
    assert.equal(result.houses.length,12);
  }
  const natal=natalChart({birthUtc:profile.birthUtc,latitude:profile.birthLatitude,longitude:profile.birthLongitude});
  const cusp=natal.cusps.find(c=>c.house===7),r=chart.relationship.seventhHouse;
  assert.equal(r.sign,cusp.sign);assert.equal(r.rulers[0].key,SIGN_RULERS[cusp.sign][0]);
  assert.equal(r.rulers[0].house,natal.planets[r.rulers[0].key].house);
  assert.ok(chart.relationship.aspects.length);
});

test('unknown time never invents house seven or its ruler', () => {
  const result=chartContext({...profile,birthTime:null},'Какой мужчина мне нужен?').chart;
  assert.equal(result.relationship.seventhHouse,null);assert.equal(result.houses,undefined);
  assert.equal(result.relationship.needs[0].house,null);
  assert.match(groundedRelationshipAnswer(result),/Точного времени рождения нет/);
});

test('generic alternatives and contradictory ruler houses fail validation', () => {
  assert.ok(relationshipAnswerProblems('Если Венера в Водолее, тебе нужен свободный человек. Если она в Тельце — надёжный.',chart));
  assert.ok(relationshipAnswerProblems('В отношениях важны уважение и доверие.',chart));
  assert.ok(relationshipAnswerProblems('Марс в Рыбах в 7 доме добавляет чуткости, а Венера и Нептун — воображения.',chart));
  const valid=groundedRelationshipAnswer(chart);
  assert.equal(relationshipAnswerProblems(valid,chart),false);
  const ruler=chart.relationship.seventhHouse.rulers[0];
  assert.ok(relationshipAnswerProblems(valid+` ${ruler.name} в ${ruler.house===9?8:9}-м доме.`,chart));
  assert.ok(relationshipAnswerProblems(valid+' 7-й дом в '+(chart.relationship.seventhHouse.sign==='Стрелец'?'Овне':'Стрельце')+'.',chart));
  for(const length of ['short','medium','detailed'])assert.ok(groundedRelationshipAnswer(chart,length).length<({short:390,medium:890,detailed:1790})[length]);
});

test('failed relationship generation retries before streaming and falls back to actual placements', async () => {
  let calls=0;const deltas=[],payloads=[];
  const chat=createLocalChat({model:'fixture',fetchImpl:async(url,req)=>{calls++;payloads.push(JSON.parse(req.body));return stream('Привет! Если Венера в Водолее, тебе нужен свободный человек, а если в Тельце — надёжный.');}});
  const result=await chat.answer({message:'Какой мужчина мне нужен?',history:[],forecast,chart,onDelta:d=>deltas.push(d)});
  assert.equal(calls,2);assert.equal(result.groundedFallback,true);
  assert.equal(deltas.join(''),result.answer);assert.equal(relationshipAnswerProblems(result.answer,chart),false);
  assert.ok(JSON.parse(payloads[0].prompt).chart.relationship.seventhHouse);
  assert.match(payloads[0].system,/Основной управитель/);assert.doesNotMatch(result.answer,/Если Венера/);
});

test('the observed malformed opening is repaired before publication', async () => {
  const result=await createLocalChat({model:'fixture',fetchImpl:async()=>stream('Смотр, натальная карта помогает разобрать привычный способ общения.')}).answer({message:'Что такое натальная карта?',history:[],forecast});
  assert.match(result.answer,/Смотри,/);assert.doesNotMatch(result.answer,/Смотр,/);
});
