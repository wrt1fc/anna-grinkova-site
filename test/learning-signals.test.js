import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractLearningSignal, LEARNING_SIGNAL} from '../server/learning-signals.js';
import {learningInvitation} from '../server/learning.js';
import {createLocalChat} from '../server/local-chat.js';

test('model signal is separate from visible text; malformed or embedded signals cannot request an invitation',()=>{
 assert.deepEqual(extractLearningSignal('Понятное объяснение.\n'+LEARNING_SIGNAL),{answer:'Понятное объяснение.',learningSuggested:true});
 for(const raw of ['Обычный ответ.','Текст [[LEARNING_OFFER','[[LEARNING_OFFER]] Внутри ответа.']){
  const result=extractLearningSignal(raw);assert.equal(result.learningSuggested,false);assert.doesNotMatch(result.answer,/\[\[LEARN/);
 }
});

test('learned educational intent covers new wording but cannot advertise in sensitive or ordinary personal requests',()=>{
 assert.ok(learningInvitation('Хочу понимать, откуда берётся такой вывод, а не просто читать результат',[],true));
 assert.ok(learningInvitation('Как самому расшифровать мою карту?',[],true));
 assert.equal(learningInvitation('Какой мужчина мне нужен?',[],true),null);
 assert.equal(learningInvitation('Почему у меня долги?',[],true),null);
 assert.equal(learningInvitation('А подробнее?',[{role:'user',content:'Мне тяжело после развода'}],true),null);
 assert.equal(learningInvitation('Просто расскажи подробнее',[],false),null);
 assert.ok(learningInvitation('Что такое управитель?'));
 assert.equal(learningInvitation('Что такое управитель?',[],false),null);
 assert.equal(learningInvitation('Что такое управитель? Только без курсов.',[],true),null);
});

test('the real chat parser removes the learned marker before streaming and returns its decision as metadata',async()=>{
 const seen=[],deltas=[];
 const writer=createLocalChat({model:'candidate-test',learningSignals:true,fetchImpl:async(_url,options)=>{
  seen.push(JSON.parse(options.body));const text='Привет! Орбис — допустимое отклонение от точного угла аспекта.\n'+LEARNING_SIGNAL;
  return{ok:true,body:new ReadableStream({start(c){for(const chunk of [text.slice(0,72),text.slice(72)])c.enqueue(new TextEncoder().encode(JSON.stringify({response:chunk,done:false})+'\n'));c.enqueue(new TextEncoder().encode(JSON.stringify({done:true,done_reason:'stop'})+'\n'));c.close();}})};
 }});
 const result=await writer.answer({message:'Хочу понять, как выбирают допустимый разброс угла',history:[],forecast:{date:'2026-11-02',scope:'general'},onDelta:d=>deltas.push(d)});
 assert.equal(result.learningSuggested,true);assert.doesNotMatch(result.answer,/LEARNING/);assert.doesNotMatch(deltas.join(''),/LEARNING/);assert.match(seen[0].system,/LEARNING_OFFER/);
});
