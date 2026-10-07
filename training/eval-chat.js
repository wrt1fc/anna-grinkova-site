// Usage: node training/eval-chat.js <model> [report.md]
// Runs the control questions through the live local model with today's calculation and checks each reply.
// Exit code 1 if any check fails, so it can gate a model, rules or materials change.
import { writeFileSync } from 'node:fs';
import evalSet from './eval-questions.json' with { type: 'json' };
import { forecastForDate, moscowDate } from '../server/daily-forecast.js';
import { chatForecastContext, createLocalChat, forecastForQuestion } from '../server/local-chat.js';
import { evaluateAnswer } from './eval-checks.js';
import { CRISIS_ANSWER, isCrisisMessage } from '../server/crisis.js';

const [model, reportPath] = process.argv.slice(2);
if (!model) {
  console.error('Usage: node training/eval-chat.js <model> [report.md]');
  process.exit(2);
}
const chat = createLocalChat({ model });
const day = moscowDate();
const forecast = chatForecastContext(forecastForDate(day));
const rows = [];
for (const item of evalSet.questions) {
  const started = performance.now();
  let answer = '';
  let problems;
  try {
    // Mirrors the chat route: crisis messages get the fixed reply and never reach the model.
    answer = isCrisisMessage(item.question) ? CRISIS_ANSWER
      : (await chat.answer({ message: item.question, history: [], forecast: forecastForQuestion(forecast, item.question), length: item.length })).answer;
    problems = evaluateAnswer(item, answer, day);
  } catch (error) {
    problems = [`ошибка: ${error.message}`];
  }
  const ms = Math.round(performance.now() - started);
  rows.push({ item, answer, problems, ms });
  console.log(`${problems.length ? '✖' : '✔'} ${item.id} (${ms} мс)${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}

const failed = rows.filter((row) => row.problems.length).length;
console.log(`\n${rows.length - failed} из ${rows.length} прошли; модель ${model}, набор ${evalSet.version}, расчёт ${day}`);
if (reportPath) {
  const report = [`# Контрольный прогон: ${model}`, '', `Дата расчёта ${day}. Прошли ${rows.length - failed} из ${rows.length}.`, '',
    ...rows.flatMap(({ item, answer, problems, ms }) => [`## ${problems.length ? '✖' : '✔'} ${item.question}`, '',
      `Режим: ${item.length}; ${ms} мс${problems.length ? `; проблемы: ${problems.join('; ')}` : ''}`, '', `> ${answer || '—'}`, ''])];
  writeFileSync(reportPath, report.join('\n'));
}
process.exitCode = failed ? 1 : 0;
