import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastForDate } from '../server/daily-forecast.js';
import { createLocalForecastWriter } from '../server/local-writer.js';

test('local writer uses a bounded Qwen request and preserves calculated facts', async () => {
  const forecast = forecastForDate('2026-10-03');
  let url, request;
  const writer = createLocalForecastWriter({ model: 'qwen3:4b', fetchImpl: async (target, options) => {
    url = target;
    request = JSON.parse(options.body);
    return { ok: true, async json() { return { response: JSON.stringify({
      body: forecast.reading.body,
      action: forecast.reading.action,
      question: forecast.reading.question,
    }) }; } };
  } });
  const result = await writer.refine(forecast);
  assert.equal(url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(request.model, 'qwen3:4b');
  assert.equal(request.stream, false);
  assert.ok(request.options.num_predict <= 256);
  assert.match(request.system, /устный эфир/);
  assert.match(request.system, /бытовую ситуацию/);
  assert.match(request.system, /непереданные аспекты/);
  assert.deepEqual(result.astronomy, forecast.astronomy);
  assert.deepEqual(result.tarot, forecast.tarot);
  assert.equal(result.generation.kind, 'local-llm');
});

test('local writer rejects output that omits calculated facts', async () => {
  const writer = createLocalForecastWriter({ model: 'qwen3:4b', fetchImpl: async () => ({ ok: true,
    async json() { return { response: JSON.stringify({ body: 'Сегодня будет удача.', action: 'Улыбнитесь.', question: 'Что дальше?' }) }; },
  }) });
  await assert.rejects(writer.refine(forecastForDate('2026-10-03')));
});
