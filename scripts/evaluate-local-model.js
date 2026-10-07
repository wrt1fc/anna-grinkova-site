import { forecastForDate } from '../server/daily-forecast.js';
import { createLocalForecastWriter } from '../server/local-writer.js';

const model = process.argv[2] || process.env.FORECAST_LOCAL_MODEL || 'qwen3.5:4b';
const startDate = process.argv[3] || '2026-10-07';
const count = Number(process.argv[4] || 10);
if (!Number.isSafeInteger(count) || count < 1 || count > 31) throw new Error('Count must be between 1 and 31');
const start = forecastForDate(startDate).date;
const writer = createLocalForecastWriter({ model });
let accepted = 0;
for (let index = 0; index < count; index++) {
  const date = new Date(`${start}T09:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  const forecast = forecastForDate(date.toISOString().slice(0, 10));
  const started = Date.now();
  try {
    const result = await writer.refine(forecast);
    accepted++;
    console.log(JSON.stringify({ date: forecast.date, card: forecast.tarot.name,
      durationMs: Date.now() - started, reading: result.reading }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ date: forecast.date, card: forecast.tarot.name,
      durationMs: Date.now() - started, error: error.message }));
  }
}
console.log(`Accepted: ${accepted}/${count}`);
if (accepted !== count) process.exitCode = 1;
