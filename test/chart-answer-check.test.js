import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartContext } from '../server/chat-grounding.js';
import { wrongCalculatedClaim, groundedNatalAnswer } from '../server/chart-answer-check.js';
import { createLocalChat, chatForecastContext } from '../server/local-chat.js';
import { forecastForDate } from '../server/daily-forecast.js';

const profile={birthUtc:'1990-05-15T09:30:00Z',birthTime:'12:30',birthLatitude:55.75,birthLongitude:37.62};
const chart=chartContext(profile,'Что означает мой Сатурн?').chart;

test('explicit natal signs, angles, houses and aspects are compared with calculated facts',()=>{
  for(const answer of ['Сатурн у тебя в Овне.','Луна в Козероге в 8 доме.','Сатурн в восьмом доме.',
    'Трин Солнца и MC помогает карьере.','Солнце и асцендент соединены с MC.',
    'Венера в секстиле к Нептуну.','Асцендент в Рыбах.','Солнце и MC в Овне.'])assert.equal(wrongCalculatedClaim(answer,chart),true,answer);
  for(const answer of ['Сатурн у тебя в Козероге в 5 доме.','Сатурн в пятом доме.','Солнце и MC в Тельце.',
    'Квадрат Венеры и Нептуна.','Венера в квадрате к Нептуну.','Луна и Сатурн соединены.',
    'Трин Сатурна и Луны к MC.','Венера в Овне в 8-м доме.'])assert.equal(wrongCalculatedClaim(answer,chart),false,answer);
  assert.equal(wrongCalculatedClaim('Транзитный трин Солнца и MC рассматривают отдельно.',chart),false);
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
