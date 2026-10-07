import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastForDate } from '../server/daily-forecast.js';
import { createLocalForecastWriter } from '../server/local-writer.js';

const INTERPRETATION = 'Если знакомый вопрос возвращается в разговор, не обязательно отвечать сразу. Вы можете вспомнить прежнее решение и проверить, подходит ли оно сейчас.';

test('local writer adds a bounded interpretation without changing calculated facts or advice', async () => {
  const forecast = forecastForDate('2026-10-03');
  let url, request;
  const writer = createLocalForecastWriter({ model: 'qwen3.5:4b', fetchImpl: async (target, options) => {
    url = target;
    request = JSON.parse(options.body);
    return { ok: true, async json() { return { done_reason: 'stop', response: JSON.stringify({ interpretation: INTERPRETATION }) }; } };
  } });
  const result = await writer.refine(forecast);
  assert.equal(url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(request.model, 'qwen3.5:4b');
  assert.equal(request.stream, false);
  assert.equal(request.think, false);
  assert.equal(request.options.temperature, 0);
  assert.ok(request.options.num_predict <= 256);
  assert.ok(request.options.num_ctx <= 1024);
  assert.deepEqual(JSON.parse(request.prompt), { theme: forecast.tarot.focus, action: forecast.reading.action });
  assert.match(request.system, /устного эфира/);
  assert.deepEqual(result.astronomy, forecast.astronomy);
  assert.deepEqual(result.tarot, forecast.tarot);
  assert.equal(result.reading.body, `${forecast.reading.body} ${INTERPRETATION}`);
  assert.equal(result.reading.action, forecast.reading.action);
  assert.equal(result.reading.question, forecast.reading.question);
  assert.deepEqual(result.generation, { kind: 'local-llm', model: 'qwen3.5:4b' });
});

test('local writer rejects fabricated astronomy and incomplete model responses', async () => {
  const forecast = forecastForDate('2026-10-03');
  for (const result of [
    { done_reason: 'stop', response: JSON.stringify({ interpretation: 'В 14:30 Луна перейдёт в другой знак. Попробуйте начать новый разговор вечером и посмотреть, изменится ли ваше настроение после этой встречи.' }) },
    { done_reason: 'stop', response: JSON.stringify({ interpretation: 'Солнце в новом знаке гарантирует вам успех. Вы можете ничего не менять сегодня, потому что всё важное обязательно произойдёт само собой.' }) },
    { done_reason: 'stop', response: JSON.stringify({ interpretation: 'Если разговор кажется трудным, можно сперва записать основную мысль. Вы заметите, как собеседник сразу согласится с вами после этого.' }) },
    { done_reason: 'length', response: JSON.stringify({ interpretation: INTERPRETATION }) },
  ]) {
    const writer = createLocalForecastWriter({ model: 'qwen3.5:4b', fetchImpl: async () => ({ ok: true, async json() { return result; } }) });
    await assert.rejects(writer.refine(forecast));
  }
});
