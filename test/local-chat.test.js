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
function chatReturning(chunks, options, capture = {}) {
  return createLocalChat({ model: 'qwen3.5:4b', fetchImpl: async (url, request) => {
    Object.assign(capture, { url, request, payload: JSON.parse(request.body) });
    return ollamaStream(chunks, options);
  } });
}

test('chat streams plain text built from calculated facts and the approved project context', async () => {
  const capture = {};
  const deltas = [];
  const reply = await chatReturning(['Карта поднимает ', 'тему выбора. ', 'Сначала проверьте факты.'], {}, capture)
    .answer({ message: 'Что значит карта?', history: [], forecast, visitorName: 'Мария', onDelta: (delta) => deltas.push(delta) });
  assert.equal(reply.answer, 'Карта поднимает тему выбора. Сначала проверьте факты.');
  assert.deepEqual(deltas, ['Карта поднимает ', 'тему выбора. ', 'Сначала проверьте факты.']);
  assert.equal(reply.truncated, false);
  assert.equal(capture.url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(capture.payload.stream, true);
  assert.equal(capture.payload.format, undefined);
  const prompt = JSON.parse(capture.payload.prompt);
  assert.equal(prompt.forecast.card.name, forecast.card.name);
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

test('the day card reaches the model only for questions about the day', async () => {
  const { asksAboutDay, forecastForQuestion } = await import('../server/local-chat.js');
  for (const q of ['Что означает моя карта дня?', 'На что обратить внимание сегодня?', 'Какой прогноз на неделю?']) assert.equal(asksAboutDay(q), true, q);
  for (const q of ['Почему мы часто ссоримся?', 'Как понять, что отношения созависимые?', 'Что делать с бывшим?']) assert.equal(asksAboutDay(q), false, q);
  const trimmed = forecastForQuestion(forecast, 'Почему мы часто ссоримся?');
  assert.deepEqual(Object.keys(trimmed).sort(), ['date', 'scope', 'subject']);
  assert.equal(forecastForQuestion(forecast, 'Что значит карта?').card.name, forecast.card.name);
});
