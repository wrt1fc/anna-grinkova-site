import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastForDate } from '../server/daily-forecast.js';
import { chatForecastContext, createLocalChat } from '../server/local-chat.js';

test('chat receives calculated facts and only the approved project context', async () => {
  let request;
  const chat = createLocalChat({ model: 'qwen3.5:4b', fetchImpl: async (url, options) => {
    request = { url, options, payload: JSON.parse(options.body) };
    return { ok: true, async json() { return { response: JSON.stringify({ answer: 'Карта поднимает тему выбора. Сначала проверьте, на какие факты вы опираетесь.' }), done_reason: 'stop' }; } };
  } });
  const forecast = chatForecastContext(forecastForDate('2026-10-07'));
  const reply = await chat.answer({ message: 'Что значит карта?', history: [], forecast });
  assert.equal(reply.model, 'qwen3.5:4b');
  assert.match(reply.answer, /Карта/);
  assert.equal(request.url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(request.payload.stream, false);
  const prompt = JSON.parse(request.payload.prompt);
  assert.equal(prompt.forecast.card.name, forecast.card.name);
  assert.ok(prompt.facts.some((fact) => fact.includes('Института астрологии')));
  assert.equal(JSON.stringify(prompt).includes('birthTime'), false);
  assert.match(request.payload.system, /не выдавайте себя за Анну/i);
});

test('chat rejects incomplete and empty model answers', async () => {
  const forecast = chatForecastContext(forecastForDate('2026-10-07'));
  for (const response of [
    { response: JSON.stringify({ answer: 'Слишком кратко' }), done_reason: 'stop' },
    { response: JSON.stringify({ answer: 'Достаточно длинный ответ для проверки.' }), done_reason: 'length' },
  ]) {
    const chat = createLocalChat({ model: 'qwen3.5:4b', fetchImpl: async () => ({ ok: true, async json() { return response; } }) });
    await assert.rejects(chat.answer({ message: 'Тест', history: [], forecast }));
  }
});
