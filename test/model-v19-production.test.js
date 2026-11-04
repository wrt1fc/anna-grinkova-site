import {test} from 'node:test';
import assert from 'node:assert/strict';
import {astroFactProblems} from '../server/astro-fact-guard.js';
import {createLocalChat,firstPassSystem} from '../server/local-chat.js';
const stream=text=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});
async function withEnv(values,fn){const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));try{for(const [k,v]of Object.entries(values))if(v===undefined)delete process.env[k];else process.env[k]=v;return await fn();}finally{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}}

test('observed explicit factual errors are caught, including list and dignity variants',()=>{
 const bad=[
 ['Дева — фиксированная, Телец — мутабельный.','Чем отличаются модальности?'],
 ['Кардинальная земля — Козерог, фиксированная — Дева, мутабельная — Телец.','Что такое земные знаки?'],
 ['В каждой стихии тоже по четыре знака.','Сравни группы.'],
 ['Луна в обители Близнецов.','Что значит Луна в Близнецах?'],
 ['Южный узел — точка роста, Северный — привычный способ действовать.','Как понимать узлы?'],
 ['Узлы — направление: Десцендент показывает тему роста.','Как различить узлы и десятый дом?'],
 ['Да, входит. Разница 94 и 90 равна 4, при пределе3 аспект не входит.','Входит ли в допуск угол94?'],
 ['В доме один знак, а не два.','Что в моей карте?'],
 ['Для этого нужна проверенная причина, например свидетельство.','Где изменить время рождения?'],
 ['Это не слово из карты, а название приложения.','Я неизвестное слово из карты пока не привела.'],
 ['Не придумывай их и не обещай запись.','Как оплатить доступ?']
 ];
 for(const [a,q]of bad)assert.ok(astroFactProblems(a,{question:q}).length,a);
});

test('correct classifications, denials and comparisons are not rejected',()=>{
 for(const a of ['Телец — фиксированный, Дева — мутабельная.','Дева не является фиксированным знаком.','Лунные узлы не являются асцендентом и десцендентом.','Обитель Луны — Рак.','Луна не в обители Близнецов.','В каждой стихии по три знака, в модальности четыре.','Нет, при отклонении4 и пределе3 не входит в допуск.'])assert.deepEqual(astroFactProblems(a,{question:'Объясни узлы, модальности и допуск.'}),[],a);
 const calculated={positions:{sun:{sign:'Весы'}},angles:{asc:{sign:'Скорпион'}}};
 assert.ok(astroFactProblems('Солнце и асцендент стоят в противоположных знаках.',{chart:{calculated}}).length);
 assert.deepEqual(astroFactProblems('Солнце и асцендент не стоят в противоположных знаках.',{chart:{calculated}}),[]);
 calculated.angles.asc.sign='Овен';assert.deepEqual(astroFactProblems('Солнце и асцендент стоят в противоположных знаках.',{chart:{calculated}}),[]);
});

test('v19 model protocol uses its trained system while learned buttons remain off',async()=>withEnv({CHAT_MODEL_PROTOCOL:'19',CHAT_LEARNING_SIGNALS:undefined,ANNA_TRAINING_PROMPT_VERSION:'18',ANNA_REFERENCE_KNOWLEDGE:'19',ANNA_METHODICS_FILE:undefined},async()=>{
 let input;const chat=createLocalChat({model:'anna-v19',learningSignals:false,fetchImpl:async(url,opts)=>{input=JSON.parse(opts.body);return stream('Орбис — допустимое отклонение от точного угла аспекта.\n[[LEARNING_OFFER]]');}});
 const args={message:'Объясни орбис',history:[],forecast:{date:'2026-11-05'}};
 const r=await chat.answer(args);assert.equal(input.system,firstPassSystem({...args,learningSignals:true}));assert.equal(input.think,false);assert.doesNotMatch(r.answer,/LEARNING/);assert.equal(r.learningSuggested,undefined);
}));

test('fact guard retries once and records an honest fallback if the model repeats the mistake',async()=>withEnv({CHAT_MODEL_PROTOCOL:'19',CHAT_FACT_GUARD:'1'},async()=>{
 const traces=[],inputs=[];
 const chat=createLocalChat({model:'anna-v19',learningSignals:false,onTrace:t=>traces.push(t),fetchImpl:async(url,opts)=>{inputs.push(JSON.parse(opts.body));return stream('Луна в обители Близнецов, и это объясняет её потребность в общении.\n[[LEARNING_NONE]]');}});
 const r=await chat.answer({message:'Что значит Луна в Близнецах?',history:[],forecast:{date:'2026-11-05'}});
 assert.equal(inputs.length,2);assert.match(inputs[1].system,/Обитель Луны — Рак/);assert.equal(traces[1].factRetry,true);assert.equal(r.model,null);assert.equal(r.groundedFallback,true);assert.equal(r.factFiltered,true);assert.equal(r.learningSuggested,false);assert.match(r.answer,/Обитель Луны — Рак/);
}));

test('a corrected second attempt remains model output, without claiming a fallback',async()=>withEnv({CHAT_MODEL_PROTOCOL:'19',CHAT_FACT_GUARD:'1'},async()=>{
 let count=0;const chat=createLocalChat({model:'anna-v19',learningSignals:false,fetchImpl:async()=>stream(++count===1?'Дева — фиксированная, Телец — мутабельный.\n[[LEARNING_NONE]]':'Дева — мутабельная, а Телец — фиксированный знак.\n[[LEARNING_NONE]]')});
 const r=await chat.answer({message:'Сравни модальности Тельца и Девы',history:[],forecast:{date:'2026-11-05'}});assert.equal(count,2);assert.equal(r.model,'anna-v19');assert.equal(r.groundedFallback,undefined);
}));
