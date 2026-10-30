import assert from 'node:assert/strict';
import {test} from 'node:test';
import {conversationalOpening, hasFormalAddress} from '../server/chat-style.js';
import {createLocalChat, chatPrompt, wrongPlanetSign} from '../server/local-chat.js';

test('new conversation starts with one informal greeting, follow-ups do not greet again',()=>{
  for(const greeting of ['Здравствуйте!','Добрый день.','Доброе утро!','Привет!']){
    assert.equal(conversationalOpening(`${greeting} Давай разбираться.`),'Привет! Давай разбираться.');
    assert.equal(conversationalOpening(`${greeting} Давай разбираться.`,[{role:'user',content:'А дальше?'}]),'Давай разбираться.');
  }
  assert.equal(conversationalOpening('Тебе важен отдых.'),'Привет! Тебе важен отдых.');
  assert.equal(conversationalOpening('Привет! 💛 Давай разбираться.'),'Привет! 💛 Давай разбираться.');
  assert.equal(conversationalOpening('Здравствуйте! 💛 Давай разбираться.'),'Привет! 💛 Давай разбираться.');
});

test('formal address is rejected without matching unrelated Russian words',()=>{
  for(const text of ['Вам стоит отдохнуть.','Это ваш выбор.','Подумайте о паузе.','Вы с партнёром разные.','Попробуйте поговорить.','Прочитайте ответ и отдохните.'])assert.ok(hasFormalAddress(text),text);
  for(const text of ['Твой выбор за тобой.','Выйти из комнаты и выдохнуть.','У тебя есть время подумать.'])assert.equal(hasFormalAddress(text),false,text);
  assert.ok(wrongPlanetSign('Луна у тебя в Льве.',{planets:['Луна 12°00′ Водолей, 7 дом']}));
});

function stream(text){return {ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})};}
const input={message:'Что делать с усталостью?',history:[],forecast:{date:'2026-10-30',scope:'general'},length:'medium'};

test('formal model answer is retried before any text is emitted',async()=>{
  const deltas=[],payloads=[];const chat=createLocalChat({model:'test-style',fetchImpl:async(url,req)=>{payloads.push(JSON.parse(req.body));return stream(payloads.length===1?'Здравствуйте! Вам нужно больше отдыха.':'Тебе сейчас нужен отдых, а не ещё один список дел.');}});
  const result=await chat.answer({...input,onDelta:text=>deltas.push(text)});
  assert.equal(payloads.length,2);assert.deepEqual(deltas,[result.answer]);assert.match(result.answer,/^Привет!/);assert.equal(hasFormalAddress(result.answer),false);assert.match(payloads[1].system,/Исправь обращение/);
});

test('a second formal answer uses a friendly fallback and never leaks a formal prefix',async()=>{
  let calls=0;const deltas=[];const chat=createLocalChat({model:'test-style',fetchImpl:async()=>{calls++;return stream('Здравствуйте! Вы можете подробнее описать вашу ситуацию.');}});
  const result=await chat.answer({...input,onDelta:text=>deltas.push(text)});assert.equal(calls,2);assert.equal(result.styleFiltered,true);assert.equal(hasFormalAddress(result.answer),false);assert.deepEqual(deltas,[result.answer]);
});

test('normal or omitted tone inherits informal humour, including the sensitive-topic exception',()=>{
  for(const tone of [undefined,'normal','playful']){const p=JSON.parse(chatPrompt({...input,tone}));assert.equal(p.tone,'playful');assert.match(p.toneInstruction,/одна лёгкая шутка/);assert.match(p.toneInstruction,/горя.*без юмора/);}
});
