import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatPrompt, createLocalChat, firstPassSystem} from '../server/local-chat.js';
import {incompleteMoneyExplanation, wrongMoneyRulerClaim, calculatedMoneyExplanation, intentAnswerProblem} from '../server/chat-explanation.js';

const forecast = {date:'2026-11-09',scope:'general'};
const chart = {money:{source:'Управитель 2 дома в 9 доме: обучение. Управитель 2 дома в 11 доме: сообщества.'},
  calculated:{positions:{moon:{sign:'Рак',house:9},sun:{sign:'Лев',house:11}},aspects:[],houseRulers:[{house:2,sign:'Рак',rulers:[{planet:'moon',house:9},{planet:'sun',house:11}]}]}};
const stream = text => ({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});

test('career paraphrases reject unsolicited course promotion and chart-only deferrals',async()=>{
 assert.equal(intentAnswerProblem('Курс Анны Гриньковой не обязателен. Выбери рабочую задачу и проверь навык на практике.','Как расти в профессии?'),false);
 assert.equal(intentAnswerProblem('Я не предлагаю обучение у Анны Гриньковой. Выбери навык и потренируй его на практике.','Как расти в профессии?'),false);
 assert.equal(intentAnswerProblem('Для роста обучение у Анны Гриньковой не требуется. Выбери рабочий навык и проверь его на практике.','Как расти в профессии?'),false);
 assert.equal(intentAnswerProblem('Обучение в Институте прогрессивной психологии не является условием карьерного роста. Потренируй рабочий навык на практике.','Как расти в профессии?'),false);
 assert.equal(intentAnswerProblem('Обучение у Анны Гриньковой не требуется. Для роста выбери курс Анны Гриньковой.','Как расти в профессии?'),true);
 assert.equal(intentAnswerProblem('Уточни программу курса Анны Гриньковой и выбери обучение по своим задачам.','Как выбрать курс Анны Гриньковой для роста в профессии?'),false);
 for(const [message,answer]of [
  ['Как перейти к более сложным задачам?','Для углубления можно изучить астропсихологию у Анны Гриньковой в Институте прогрессивной психологии.'],
  ['Какими действиями повысить свой рабочий уровень?','Для роста выбери курс Анны Гриньковой в Институте прогрессивной психологии.'],
  ['Что освоить, чтобы улучшить результат в профессии?','Для ответа нужна натальная карта. Можно обсудить профессию, навыки и цели.'],
 ]){
  let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(answer);}});
  const result=await chat.answer({message,history:[],forecast,chart:null});
  assert.equal(calls,2,message);assert.equal(result.model,null);assert.match(result.answer,/Выбери|выбери/u);assert.doesNotMatch(result.answer,/Институт|Анн|нужна натальная карта/u);
 }
 const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Для роста выбери небольшой рабочий проект, проверь навык на практике и попроси обратную связь. Курс для этого не обязателен.')});
 assert.equal((await chat.answer({message:'Что освоить, чтобы улучшить результат в профессии?',history:[],forecast,chart:null})).model,'fixture');
});

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

 test('career, budgeting and emotional replies are not forced into income ruler explanations', async () => {
  for (const message of ['Как расти в выбранной профессии?', 'Какие навыки мне развить для работы?', 'Как получить повышение?', 'Почему мне трудно копить?', 'Как перестать тратить импульсивно?', 'Я тревожусь о доходе. Поддержи меня', 'Как восстановиться после работы?', 'Не перечисляй профессии, назови три конкретных шага для роста']) {
    assert.equal(incompleteMoneyExplanation('Выбери одну задачу и проверь результат через неделю.',chart,message,'medium'),false,message);
    let calls=0;
    const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(/три конкретных шага/u.test(message) ? '1. Выбери навык.\n2. Проверь его на практике.\n3. Запроси обратную связь.' : 'Выбери одну задачу и проверь результат через неделю.');}});
    const reply=await chat.answer({message,history:[],forecast,chart});
    assert.equal(calls,1,message);assert.equal(reply.model,'fixture',message);
    assert.doesNotMatch(reply.answer,/Возможные темы заработка/u,message);
  }
 });

 test('live income-source substitutions cannot pass as career growth or a savings explanation',async()=>{
  const bad=[
   ['Что поможет мне расти в профессии?','Куспид 10 дома в Рыбах. Управители 2 дома Луна и Солнце стоят в 9 и 11 домах. Луна связана с творчеством, а Солнце указывает на рост через сообщества.'],
   ['Какие навыки мне развивать для карьерного роста?','Для роста можно развивать работу с людьми и психологическую экспертизу. Управитель 2 дома Луна стоит в 9 доме: деньги идут через творчество. Доход возможен от сообщества.'],
   ['Почему мне сложно откладывать деньги?','Куспид 2 дома в Раке. Луна в 9 доме, Солнце в 11 доме. Деньги могут приходить из творческих сфер, знакомств и соцсетей.'],
   ['Что поможет мне расти в профессии?','Куспид 10 дома в Рыбах: работа лучше получается в комфортных условиях. Творчество, интеллект и легенды о себе — твои сильные стороны.'],
   ['Почему мне сложно откладывать деньги?','Куспид 2 дома в Раке: деньги нужны для дома, и откладывать кажется отказом от себя. Доход может приходить через сообщества.'],
  ];
  for(const [message,answer]of bad){
   const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream(answer)});
   const result=await chat.answer({message,history:[],forecast,chart});
   assert.equal(result.model,null,message);assert.equal(result.explanationFiltered,true,message);
   assert.doesNotMatch(result.answer,/управител|Возможные темы заработка/iu,message);
  }
  for(const [message,answer]of [
   ['Что поможет мне расти в профессии?','Один из управителей денежного дома стоит в 11 доме. Для роста выбери рабочий навык, проверь его на практике и запроси обратную связь.'],
   ['Почему мне сложно откладывать деньги?','Доход возможен от разных занятий, но для накоплений сначала запиши расходы и выбери посильную сумму, которую можно отложить.'],
   ['Как начать копить деньги?','Откладывай посильную часть денег после обязательных платежей. Сначала обеспечь базовые расходы и избегай новых долгов.'],
   ['Почему мне сложно копить?','По карте нельзя определить причину. Какие расходы сейчас самые большие?'],
  ]){
   let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream(answer);}});
   const result=await chat.answer({message,history:[],forecast,chart});assert.equal(calls,1);assert.equal(result.model,'fixture');
  }
 });

 test('household malfunctions are refused before generation, with stale money chart',async()=>{
  for(const message of ['Почему не работает отопление?', 'Интернет пропал, как починить?', 'Почему не работает код на Python?', 'Кран перестал работать, что делать?', 'Как работает двигатель автомобиля?']){
   const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('offtopic must not generate');}});
   const reply=await chat.answer({message,history:[],forecast,chart,length:'detailed'});
   assert.match(reply.answer,/С этой темой не помогу/u);assert.equal(reply.learningSuggested,false);
  }
 });

 test('counted practical steps and repeated income substitutions get appropriate fallbacks',async()=>{
  for(const message of ['Как расти в профессии? Дай три конкретных шага.', 'Как меньше тратить? Дай два шага.', 'Как восстановиться после работы? Дай три шага.']){
   let calls=0;const deltas=[];
   const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Возможные темы заработка: творчество и зарубежные темы.');}});
   const result=await chat.answer({message,history:[],forecast,chart,onDelta:d=>deltas.push(d)});
   assert.equal(calls,2);assert.equal(result.model,null);
   assert.equal((result.answer.replace(/^Привет!\s*/u,'').match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,/два шага/u.test(message)?2:3);
   assert.doesNotMatch(result.answer,/Возможные темы заработка|управител/iu);assert.deepEqual(deltas,[result.answer]);
  }
 });

 test('service refusals become clarifications rather than money templates',async()=>{
  let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Я разбираюсь в астрологии. С этой темой не помогу.');}});
  const result=await chat.answer({message:'Почему не работает вход в Фортуну?',history:[],forecast,chart});
  assert.equal(calls,2);assert.match(result.answer,/шаг|ошибк/u);assert.doesNotMatch(result.answer,/С этой темой не помогу|управител|заработ/u);
 });

 test('local chat resolves the personal solar sign directly before generation',async()=>{
  const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{throw Error('solar sign must be calculated');}});
  const result=await chat.answer({message:'Какой у меня знак зодиака?',history:[],forecast,chart});
  assert.match(result.answer,/Лев/u);assert.equal(result.model,null);
  const missing=await chat.answer({message:'Кто я по гороскопу?',history:[],forecast,chart:null});
  assert.match(missing.answer,/рождени/u);
 });

 test('detailed practical fallbacks remain substantial without money substitutions',async()=>{
  for(const message of ['Как расти в профессии?', 'Как восстановиться после работы?', 'Тревожусь о доходе', 'Как перестать тратить импульсивно?']){
   const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Возможные темы заработка: сообщества и творчество.')});
   const result=await chat.answer({message,history:[],forecast,chart,length:'detailed'});
   assert.ok(result.answer.length>=400,message);assert.doesNotMatch(result.answer,/Возможные темы заработка|управител/u);
  }
 });

 test('explicit action counts survive the short fallback publication budget',async()=>{
  const chat=createLocalChat({model:'fixture',fetchImpl:async()=>stream('Возможные темы заработка: сообщества и творчество.')});
  const result=await chat.answer({message:'Как расти в профессии? Дай пять шагов.',history:[],forecast,chart,length:'short'});
  assert.ok(result.answer.length<=400);assert.equal((result.answer.replace(/^Привет!\s*/u,'').match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,5);
 });

 test('small numbered savings actions cannot become a job search',async()=>{
  assert.equal(intentAnswerProblem('1. Запиши расходы.\n2. Отложи посильную сумму.\n3. Найди одну работу с гибким графиком.','Дай три шага для накоплений.'),true);
  for(const answer of ['Чтобы копить, не нужно искать новую работу. Запиши расходы.','Необязательно найти другую работу: запиши расходы.','«Найди новую работу» — это другой вопрос. Запиши расходы.'])assert.equal(intentAnswerProblem(answer,'Как начать копить?'),false,answer);
  assert.equal(intentAnswerProblem('Найди подработку без крупных расходов и проверь бюджет.','Как найти подработку и начать копить?'),false);
  for(const message of ['Теперь предложи три небольших действия для накоплений.','Дай два простых шага, чтобы начать копить.']){
   let calls=0;const chat=createLocalChat({model:'fixture',fetchImpl:async()=>{calls++;return stream('Выбери три небольшие задачи: составить список покупок, отложить сумму и найти одну работу с гибким графиком.');}});
   const result=await chat.answer({message,history:[{role:'user',content:'Какая работа мне подходит?'},{role:'assistant',content:'Проверь интересные занятия на практике.'}],forecast,chart});
   assert.equal(calls,2);assert.equal(result.model,null);
   assert.equal((result.answer.match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length,message.includes('три')?3:2);
   assert.doesNotMatch(result.answer,/найти.*работ/iu);
  }
 });
