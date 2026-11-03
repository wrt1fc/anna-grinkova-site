import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalChat,firstPassSystem} from '../server/local-chat.js';
import {learningInvitation} from '../server/learning.js';
import {systemFor} from '../server/local-chat.js';

test('training and inference share the actual first-pass system, including question guidance',async()=>{
 const message='Что такое управитель?',history=[],forecast={date:'2026-11-02',scope:'general'};
 let sent;
 const chat=createLocalChat({model:'test-candidate',learningSignals:true,fetchImpl:async(_url,options)=>{
  sent=JSON.parse(options.body);
  return{ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:'Привет! Управитель — планета, связанная со знаком. Например, Стрельцом управляет Юпитер.',done:true,done_reason:'stop'})+'\n'));c.close();}})};
 }});
 await chat.answer({message,history,forecast});
 assert.equal(sent.system,firstPassSystem({message,history,learningSignals:true}));
 assert.match(sent.system,/Сначала дай простое и точное объяснение/);
});

test('only the isolated learning candidate gets compact instructions; core safeguards remain',()=>{
 const message='Что такое управитель?',history=[];
 const compact=firstPassSystem({message,history,learningSignals:true});
 const original=firstPassSystem({message,history,learningSignals:false});
 assert.ok(compact.length<original.length);
 assert.ok(original.startsWith(systemFor(null)));
 for(const word of ['chart.money','chart.partner','не придумывай','Не ставь диагнозы','visitorGender','materials','LEARNING_NONE'])assert.ok(compact.includes(word),word);
 assert.ok(firstPassSystem({message,history,mode:'tarot',learningSignals:true}).startsWith(systemFor('tarot')));
});

test('grief inflections cannot turn a learned signal into a course invitation',()=>{
 for(const q of ['Я всё ещё горюю, объясни глубже','После утраты хочу понять, как это устроено','Научи понимать, почему я горевала так долго'])assert.equal(learningInvitation(q,[],true),null,q);
 assert.equal(learningInvitation('А можно подробнее?',[{role:'user',content:'Я горюю'}],true),null);
 assert.ok(learningInvitation('Как самой читать натальную карту?',[],true));
});
