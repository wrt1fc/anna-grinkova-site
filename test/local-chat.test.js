import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastForDate } from '../server/daily-forecast.js';
import { chatForecastContext, createLocalChat } from '../server/local-chat.js';

// Mimics Ollama's streaming body: one JSON object per line, split into the given text chunks.
function ollamaStream(chunks, { doneReason = 'stop', done = true } = {}) {
  const lines = chunks.map((text) => JSON.stringify({ response: text, done: false }));
  if (done) lines.push(JSON.stringify({ response: '', done: true, done_reason: doneReason }));
  const bytes = new TextEncoder().encode(lines.join('\n') + '\n');
  // Split mid-line on purpose so the reader has to buffer partial JSON.
  const parts = [bytes.slice(0, 7), bytes.slice(7)];
  return { ok: true, body: new ReadableStream({ start(controller) { parts.forEach((part) => controller.enqueue(part)); controller.close(); } }) };
}

const forecast = chatForecastContext(forecastForDate('2026-10-07'));

test('a fresh relationship question drops only day history, while a follow-up keeps it', async () => {
  const {historyForQuestion}=await import('../server/local-chat.js');
  const history=[{role:'user',content:'Что означает моя карта дня?'},{role:'assistant',content:'Карта предлагает остановиться.'},{role:'user',content:'Мы давно вместе.'},{role:'assistant',content:'Важно слышать друг друга.'}];
  assert.deepEqual(historyForQuestion(history,'как у меня будут обстоять дела с отношениями?'),history.slice(2));
  assert.deepEqual(historyForQuestion(history,'Что это значит для отношений?'),history);
  assert.deepEqual(historyForQuestion(history,'А какой прогноз на сегодня?'),history);
});

test('missing natal data produces a useful relationship clarification without invented planets', async () => {
  const deltas=[];
  const chat=createLocalChat({model:'test-model',fetchImpl:async()=>{throw Error('must not invent a chart')}});
  const reply=await chat.answer({message:'Как у меня будут обстоять дела с отношениями?',history:[],forecast,chart:{missing:'Нет данных рождения'},onDelta:d=>deltas.push(d)});
  assert.match(reply.answer,/дату, время и город рождения/);
  assert.match(reply.answer,/сейчас в паре/);
  assert.doesNotMatch(reply.answer,/карт[ае] дня|Венер|Сатурн|не могу предсказывать/iu);
  assert.deepEqual(deltas,[reply.answer]);
});

test('a repeated long sentence split across chunks never reaches the visitor or final answer', async () => {
  const sentence = 'Сатурн в Скорпионе в восьмом доме связан со страхом не выдержать давления.';
  const next = '\n\nПопробуйте выбрать одну небольшую задачу на сегодня.';
  const deltas = [];
  const reply = await chatReturning([sentence, ' ' + sentence.slice(0, 30), sentence.slice(30), ' ' + sentence, next], {})
    .answer({ message: 'Что значит Сатурн?', history: [], forecast, onDelta: (delta) => deltas.push(delta) });
  assert.equal(reply.answer, sentence + next);
  assert.equal(deltas.join(''), sentence + next);
});

test('different sentences about the same planet are preserved', async () => {
  const text = 'Луна в Водолее связана с потребностью в свободе и общении. Луна в седьмом доме подчёркивает важность партнёрских отношений.';
  const reply = await chatReturning([text], {}).answer({ message: 'Что значит Луна?', history: [], forecast });
  assert.equal(reply.answer, text);
});

function chatReturning(chunks, options, capture = {}) {
  return createLocalChat({ model: 'qwen3.5:4b', fetchImpl: async (url, request) => {
    Object.assign(capture, { url, request, payload: JSON.parse(request.body) });
    return ollamaStream(chunks, options);
  } });
}

test('a wrong natal sign is retried before any text reaches the visitor', async () => {
  const chart = { planets: ['Луна 12°00′ Водолей, 7 дом'] };
  let calls = 0;
  const deltas = [];
  const chat = createLocalChat({ model: 'anna-v4', fetchImpl: async () => ollamaStream([
    ++calls === 1 ? 'Луна в Льве подчёркивает желание признания и внимания.' : 'Луна в Водолее связана с потребностью в свободе и общении.',
  ]) });
  const reply = await chat.answer({ message: 'Расскажите про Луну', history: [], forecast, chart, onDelta: (delta) => deltas.push(delta) });
  assert.equal(calls, 2);
  assert.equal(deltas.join(''), reply.answer);
  assert.equal(reply.answer.includes('Льве'), false);
});

test('a second wrong natal sign fails without streaming the false claim', async () => {
  const deltas = [];
  await assert.rejects(chatReturning(['Луна в Льве подчёркивает желание признания и внимания.'], {}).answer({
    message: 'Расскажите про Луну', history: [], forecast, chart: { planets: ['Луна 12°00′ Водолей, 7 дом'] }, onDelta: (delta) => deltas.push(delta),
  }), /contradicted/);
  assert.deepEqual(deltas, []);
});

test('chat streams plain text built from calculated facts and the approved project context', async () => {
  const capture = {};
  const deltas = [];
  const reply = await chatReturning(['Карта поднимает ', 'тему выбора. ', 'Сначала проверьте факты.'], {}, capture)
    .answer({ message: 'На что обратить внимание сегодня?', history: [], forecast, visitorName: 'Мария', onDelta: (delta) => deltas.push(delta) });
  assert.equal(reply.answer, 'Карта поднимает тему выбора. Сначала проверьте факты.');
  assert.deepEqual(deltas, ['Карта поднимает тему выбора.', ' Сначала проверьте факты.']);
  assert.equal(reply.truncated, false);
  assert.equal(capture.url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(capture.payload.stream, true);
  assert.equal(capture.payload.format, undefined);
  const prompt = JSON.parse(capture.payload.prompt);
  assert.deepEqual(prompt.forecast.sky, forecast.sky);
  assert.equal(prompt.forecast.reading.theme, forecast.reading.theme);
  assert.equal(prompt.forecast.card, undefined);
  assert.equal(prompt.visitorName, 'Мария');
  assert.deepEqual(prompt.materials, []);
  assert.ok(prompt.facts.some((fact) => fact.includes('Института прогрессивной психологии')));
  assert.equal(JSON.stringify(prompt).includes('birthTime'), false);
  assert.match(capture.payload.system, /не выдавайте себя за Анну/i);
});

test('chat passes retrieved materials and the profile subject into the prompt', async () => {
  const capture = {};
  const subjectForecast = chatForecastContext(forecastForDate('2026-10-07'), { relation: 'partner', label: 'Партнёр' });
  await chatReturning(['Ответ про партнёра по расчёту.'], {}, capture)
    .answer({ message: 'Что у партнёра?', history: [], forecast: subjectForecast, materials: [{ text: 'Луна показывает заботу.' }] });
  const prompt = JSON.parse(capture.payload.prompt);
  assert.deepEqual(prompt.forecast.subject, { relation: 'partner', label: 'Партнёр' });
  assert.equal(prompt.materials[0].text, 'Луна показывает заботу.');
});

test('chat rejects a stream that ends early or leaves no usable sentence', async () => {
  await assert.rejects(chatReturning(['Достаточно длинный ответ'], { done: false }).answer({ message: 'Тест', history: [], forecast }));
  await assert.rejects(chatReturning(['Слишком кратко'], {}).answer({ message: 'Тест', history: [], forecast }));
  await assert.rejects(chatReturning(['обрыв без точки и без конца'], { doneReason: 'length' }).answer({ message: 'Тест', history: [], forecast }));
});

test('a reply cut by the length budget ends at its last full sentence', async () => {
  const reply = await chatReturning(['Луна показывает заботу. Венера показывает притяжение. А дальше обры'], { doneReason: 'length' })
    .answer({ message: 'Тест', history: [], forecast });
  assert.equal(reply.truncated, true);
  assert.equal(reply.answer, 'Луна показывает заботу. Венера показывает притяжение.');
});

test('chat passes the visitor abort signal to the model request', async () => {
  const capture = {};
  const controller = new AbortController();
  await chatReturning(['Карта поднимает тему выбора и паузы.'], {}, capture)
    .answer({ message: 'Тест', history: [], forecast, signal: controller.signal });
  assert.equal(capture.request.signal.aborted, false);
  controller.abort();
  assert.equal(capture.request.signal.aborted, true);
});

test('chat prompt carries the length instruction and keeps answers within its size', async () => {
  const capture = {};
  const short = await chatReturning(['Луна показывает, через что вы чувствуете заботу.'], {}, capture)
    .answer({ message: 'Тест', history: [], forecast, length: 'short' });
  assert.equal(short.length, 'short');
  const prompt = JSON.parse(capture.payload.prompt);
  assert.equal(prompt.length, 'short');
  assert.match(prompt.lengthInstruction, /1–2 предложения/);
  assert.ok(capture.payload.options.num_predict < 300);
  const tooLong = await chatReturning(Array(80).fill('Слово. ')).answer({ message: 'Тест', history: [], forecast, length: 'short' });
  assert.equal(tooLong.truncated, true);
  assert.ok(tooLong.answer.length <= 400 && tooLong.answer.endsWith('.'));
  const detailed = await chatReturning(Array(80).fill('Слово. ')).answer({ message: 'Тест', history: [], forecast, length: 'detailed' });
  assert.equal(detailed.truncated, false);
  await assert.rejects(chatReturning(['Тест']).answer({ message: 'Тест', history: [], forecast, length: 'huge' }));
});

test('the calculated day context reaches the model only for questions about the day', async () => {
  const { asksAboutDay, forecastForQuestion } = await import('../server/local-chat.js');
  for (const q of ['Что означает моя карта дня?', 'На что обратить внимание сегодня?', 'Какой прогноз на неделю?']) assert.equal(asksAboutDay(q), true, q);
  for (const q of ['Почему мы часто ссоримся?', 'Как понять, что отношения созависимые?', 'Что делать с бывшим?']) assert.equal(asksAboutDay(q), false, q);
  const trimmed = forecastForQuestion(forecast, 'Почему мы часто ссоримся?');
  assert.deepEqual(Object.keys(trimmed).sort(), ['date', 'scope', 'subject']);
  assert.deepEqual(forecastForQuestion(forecast, 'На что обратить внимание сегодня?').reading, forecast.reading);
  assert.equal(forecastForQuestion(forecast, 'Что значит натальная карта?').reading, undefined);
});

test('the model address comes from OLLAMA_URL and must be http(s)', async () => {
  const { ollamaGenerateUrl } = await import('../server/ollama.js');
  assert.equal(ollamaGenerateUrl('http://10.0.0.2:11434'), 'http://10.0.0.2:11434/api/generate');
  assert.equal(ollamaGenerateUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434/api/generate');
  assert.throws(() => ollamaGenerateUrl('file:///etc/passwd'), /http/);
});

test('a card reading adds its own rules and mode, and ordinary chat keeps the trained prompt shape', async () => {
  const { tarotForDate } = await import('../server/daily-forecast.js');
  const { tarotReadingContext } = await import('../server/local-chat.js');
  const reading = tarotReadingContext('2026-10-07', tarotForDate('2026-10-07', 5, 2));
  const tarotCapture = {};
  await chatReturning(['Карта показывает возможную линию. Присмотритесь к одному шагу.'], {}, tarotCapture)
    .answer({ message: 'Что со мной будет в работе?', history: [], forecast: reading, mode: 'tarot', length: 'medium' });
  const prompt = JSON.parse(tarotCapture.payload.prompt);
  assert.equal(prompt.mode, 'tarot');
  assert.equal(prompt.question, 'Что со мной будет в работе?');
  assert.equal(prompt.forecast.card.position, 3);
  assert.equal(JSON.stringify(prompt).includes('sky'), false);
  assert.match(tarotCapture.payload.system, /Метафорическая карта/);
  assert.match(tarotCapture.payload.system, /Не обещайте исход/);
  assert.match(tarotCapture.payload.system, /не выдавайте себя за Анну/i);

  const chatCapture = {};
  await chatReturning(['Карта поднимает тему выбора. Сначала проверьте факты.'], {}, chatCapture)
    .answer({ message: 'Что значит карта?', history: [], forecast });
  assert.equal('mode' in JSON.parse(chatCapture.payload.prompt), false);
  assert.equal(/Метафорическая карта/.test(chatCapture.payload.system), false);
});

test('a reading has its own answer size, ordinary chat keeps the length of its mode', async () => {
  const { tarotForDate } = await import('../server/daily-forecast.js');
  const { tarotReadingContext, TAROT_ANSWER } = await import('../server/local-chat.js');
  const reading = tarotReadingContext('2026-10-07', tarotForDate('2026-10-07', 5, 1));
  const tarotCapture = {};
  await chatReturning(['Карта показывает возможную линию. Присмотритесь к одному шагу.'], {}, tarotCapture)
    .answer({ message: 'Что со мной будет?', history: [], forecast: reading, mode: 'tarot', length: 'short' });
  assert.equal(JSON.parse(tarotCapture.payload.prompt).lengthInstruction, TAROT_ANSWER.instruction);
  assert.match(TAROT_ANSWER.instruction, /абзац/);
  assert.equal(tarotCapture.payload.options.num_predict, TAROT_ANSWER.numPredict);
  const chatCapture = {};
  await chatReturning(['Карта поднимает тему выбора. Сначала проверьте факты.'], {}, chatCapture)
    .answer({ message: 'Что значит карта?', history: [], forecast, length: 'short' });
  assert.notEqual(chatCapture.payload.options.num_predict, TAROT_ANSWER.numPredict);
  assert.match(JSON.parse(chatCapture.payload.prompt).lengthInstruction, /1–2 предложения/);
});
