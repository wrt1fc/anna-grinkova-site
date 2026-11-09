import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatPrompt, createLocalChat, firstPassSystem} from '../server/local-chat.js';
import {incompleteMoneyExplanation} from '../server/chat-explanation.js';

const forecast = {date:'2026-11-09',scope:'general'};
const chart = {money:{source:'Управитель 2 дома в 9 доме: обучение. Управитель 2 дома в 11 доме: сообщества.'},
  calculated:{positions:{moon:{sign:'Рак',house:9},sun:{sign:'Лев',house:11}},aspects:[],houseRulers:[{house:2,sign:'Рак',rulers:[{planet:'moon',house:9},{planet:'sun',house:11}]}]}};
const stream = text => ({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});

test('plain explanations apply to both the regular and trained production prompts', () => {
  const old = {...process.env};
  try {
    for (const trained of [false,true]) {
      process.env.ANNA_TRAINING_PROMPT_VERSION = '18';
      process.env.ANNA_REFERENCE_KNOWLEDGE = '19';
      const system = firstPassSystem({message:'Как мне зарабатывать?',chart,history:[],learningSignals:trained});
      assert.match(system,/Сначала понятный смысл/u);
      assert.match(system,/без обязательных шуток/u);
      assert.match(system,/один из управителей/u);
      assert.match(system,/9 доме/u);
      assert.match(system,/11 доме/u);
    }
  } finally {
    for (const key of ['ANNA_TRAINING_PROMPT_VERSION','ANNA_REFERENCE_KNOWLEDGE']) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  }
});

test('an everyday question has a neutral default; humour remains opt-in', () => {
  const args = {message:'Какую работу выбрать?',history:[],forecast};
  assert.equal(JSON.parse(chatPrompt(args)).tone,undefined);
  assert.equal(JSON.parse(chatPrompt({...args,tone:'normal'})).tone,undefined);
  assert.equal(JSON.parse(chatPrompt({...args,tone:'playful'})).tone,'playful');
});

test('a money answer naming one of two rulers is rewritten before reaching the visitor', async () => {
  const inputs = [], traces = [], deltas = [];
  const chat = createLocalChat({model:'test-model',onTrace:t=>traces.push(t),fetchImpl:async (_url,opts) => {
    inputs.push(JSON.parse(opts.body));
    return stream(inputs.length === 1
      ? 'Управитель 2 дома Луна стоит в 9 доме. Доход связан с обучением.'
      : 'Для заработка можно рассмотреть обучение и работу с сообществами. Один из управителей денежного дома — Луна — стоит в 9 доме, другой — Солнце — в 11 доме.');
  }});
  const reply = await chat.answer({message:'Как мне зарабатывать?',history:[],forecast,chart,onDelta:d=>deltas.push(d)});
  assert.equal(inputs.length,2);
  assert.match(inputs[1].system,/Солнце/u);
  assert.match(reply.answer,/один из управителей/iu);
  assert.deepEqual(deltas,[reply.answer]);
  assert.equal(traces[1].explanationRetry,true);
  assert.equal(reply.model,'test-model');
});

test('a repeated incomplete explanation returns calculated facts and marks the fallback honestly', async () => {
  let calls = 0;
  const chat = createLocalChat({model:'test-model',fetchImpl:async()=>{calls++;return stream('Управитель 2 дома Луна стоит в 9 доме. Работа через знания.');}});
  const reply = await chat.answer({message:'Как мне зарабатывать?',history:[],forecast,chart});
  assert.equal(calls,2);
  assert.equal(reply.model,null);
  assert.equal(reply.groundedFallback,true);
  assert.equal(reply.explanationFiltered,true);
  assert.match(reply.answer,/Луна/u);
  assert.match(reply.answer,/Солнце/u);
  assert.match(reply.answer,/9 доме/u);
  assert.match(reply.answer,/11 доме/u);
});

test('simple terms and the selected card are not replaced by money explanations', async () => {
  let calls = 0;
  const chat = createLocalChat({model:'test-model',fetchImpl:async()=>{calls++;return stream('Оппозиция — связь между двумя точками под углом 180 градусов.');}});
  const reply = await chat.answer({message:'Что такое оппозиция?',history:[],forecast});
  assert.equal(calls,1);
  assert.match(reply.answer,/180/u);
});

test('an unrelated mention of the second planet does not count as explaining its calculated house', () => {
  assert.equal(incompleteMoneyExplanation('Управитель денежного дома — Луна — стоит в 9 доме. Это доход от обучения. Солнце связано с твоим характером.',chart,'Как мне зарабатывать?','medium'),true);
  assert.equal(incompleteMoneyExplanation('Луна стоит в 9 доме, а Солнце — в 11-м доме.',chart,'Как мне зарабатывать?','medium'),false);
  assert.equal(incompleteMoneyExplanation('Один из управителей — Луна — стоит в 9 доме.',chart,'Как мне зарабатывать?','short'),false);
});
