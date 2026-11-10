import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatPrompt, createLocalChat, firstPassSystem} from '../server/local-chat.js';
import {incompleteMoneyExplanation, wrongMoneyRulerClaim, calculatedMoneyExplanation} from '../server/chat-explanation.js';

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

const singleRuler = {money:{},calculated:{positions:{venus:{house:11}},aspects:[],houseRulers:[{house:2,rulers:[{planet:'venus',house:11}]}]}};

test('a single money ruler cannot acquire a second ruler or contradictory placement', () => {
  for (const answer of [
    'Управитель денежного дома — Венера — стоит в 11 доме. Другой управитель — Венера — в 9 доме.',
    'Второй управитель — Венера — стоит в 11 доме.',
    'Другой управитель — Марс — в 11 доме.',
    'Один из управителей денежного дома — Венера в 11 доме.',
    'Венера — в девятом доме.',
  ]) assert.equal(wrongMoneyRulerClaim(answer,singleRuler,'Как мне зарабатывать?'),true,answer);
  for (const answer of [
    'Управитель денежного дома — Венера — стоит в 11 доме.',
    '«Другой управитель — Венера — в 9 доме» — ошибочная фраза. Венера в 11 доме.',
    'Второй управитель не нужен. Венера в 11 доме.',
    'Венера не в 9 доме. Венера в 11 доме.',
    'Второй управитель 7 дома — Марс. Венера в 11 доме.',
  ]) assert.equal(wrongMoneyRulerClaim(answer,singleRuler,'Как мне зарабатывать?'),false,answer);
  assert.equal(wrongMoneyRulerClaim('Другой управитель — Марс.',singleRuler,'Что такое оппозиция?'),false);
  const fallback = calculatedMoneyExplanation(singleRuler,'Как мне зарабатывать?','medium');
  assert.match(fallback,/Управитель денежного дома — Венера — стоит в 11 доме/u);
  assert.doesNotMatch(fallback,/один из|другой управитель|несколько показателей/iu);
});

test('each co-ruler needs its own asserted house, not a house borrowed from another planet', () => {
  assert.equal(incompleteMoneyExplanation('Луна и Солнце стоят в 9 доме. Солнце в 11 доме.',chart,'Как мне зарабатывать?','medium'),true);
  assert.equal(incompleteMoneyExplanation('«Луна в 9 доме». Солнце в 11 доме.',chart,'Как мне зарабатывать?','medium'),true);
  assert.equal(incompleteMoneyExplanation('Луна не в 9 доме. Солнце в 11 доме.',chart,'Как мне зарабатывать?','medium'),true);
  assert.equal(incompleteMoneyExplanation('Луна — в девятом доме, Солнце — в одиннадцатом доме.',chart,'Как мне зарабатывать?','medium'),false);
  assert.equal(wrongMoneyRulerClaim('Луна в 11 доме, Солнце в 9 доме.',chart,'Как мне зарабатывать?'),true);
});

test('money guards distinguish unrelated negation and transit or other-house claims',()=>{
  for(const answer of ['Венера в 9 доме и не боится перемен.','Венера в 9 доме — это не ошибка.']){
    assert.equal(wrongMoneyRulerClaim(answer,singleRuler,'Как мне зарабатывать?'),true,answer);
  }
  for(const answer of ['Венера в 11 доме. Транзитная Венера в 9 доме.','Венера в 11 доме. У 7 дома другая тема. Его управитель — Марс.','Венера в 11 доме и не в 9 доме.','Венера в 11 доме. У 7 дома другая тема. Другой управитель — Марс.']){
    assert.equal(wrongMoneyRulerClaim(answer,singleRuler,'Как мне зарабатывать и что с партнёрами?'),false,answer);
  }
});

test('a strategy explanation is not replaced by an unrelated list of income rulers',async()=>{
 const answer='Привет! Это название стратегии в материалах. Разберём её смысл простыми словами, без списка домов.';
 let calls=0;
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(answer);}});
 const result=await chat.answer({message:'Что означает финансовая стратегия «котик»?',history:[],forecast,chart});
 assert.equal(result.answer,answer);assert.equal(calls,1);assert.equal(result.model,'fixture');
 assert.equal(incompleteMoneyExplanation(answer,chart,'Объясни стратегию по стихиям.','medium'),false);
 assert.equal(incompleteMoneyExplanation(answer,chart,'Объясни стратегию и обоих управителей денежного дома.','medium'),true);
 assert.equal(incompleteMoneyExplanation(answer,chart,'Предложи мне стратегию заработка по карте.','medium'),true);
 // Factual claims still undergo validation even when the question is about a strategy.
 assert.equal(wrongMoneyRulerClaim('Луна в 11 доме.',chart,'Объясни финансовую стратегию.'),true);
});
