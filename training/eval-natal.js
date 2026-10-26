// Usage: node training/eval-natal.js <model> <plan.json> [report.md] [--knowledge <dir>]
// Runs the held-out natal-chart questions of the plan (charts that are not in the training set) through the live chat prompt
// of a model and checks every reply: chat safety rules, answer length of its mode, no self-introduction as an AI,
// and consistency with the calculation (a planet in a sign or house, an aspect, retrograde, a 2nd or 10th house cusp must match the chart).
// Exit code 1 if any reply fails, so it can gate a new model. The manner itself is judged by Anna.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forecastForDate, moscowDate } from '../server/daily-forecast.js';
import { ANSWER_LENGTHS, chatForecastContext, cleanRepeatedSentences, createLocalChat, forecastForQuestion } from '../server/local-chat.js';
import { chartContext, findMaterials } from '../server/chat-grounding.js';
import { natalChart } from '../server/astro-chart.js';
import { loadKnowledge } from '../server/knowledge.js';
import { unsafeChatAnswer } from '../server/chat-safety.js';
import { chartClaimProblems } from './natal-lib.js';

const args = process.argv.slice(2);
const at = args.indexOf('--knowledge');
const knowledgeDir = at >= 0 ? args[at + 1] : null;
const [model, planPath, reportPath] = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--knowledge');
if (!model || !planPath) {
  console.error('Usage: node training/eval-natal.js <model> <plan.json> [report.md] [--knowledge <dir>]');
  process.exit(2);
}
const MIN_CHARS = { short: 40, medium: 150, detailed: 400 };
const AI_WORDS = /(?<!\p{L})(ии|нейросет\p{L}*|искусственн\p{L}* интеллект\p{L}*|языков\p{L}* модел\p{L}*)(?!\p{L})/iu;
const CHART_WORDS = /(Солнце|Луна|Меркурий|Венера|Марс|Юпитер|Сатурн|Уран|Нептун|Плутон|асцендент|MC|Северный узел|куспид)/i;

const plan = JSON.parse(readFileSync(planPath, 'utf8')).filter((row) => row.split === 'eval');
const knowledge = knowledgeDir ? loadKnowledge(resolve(knowledgeDir)) : null;
// The chat writer asks the model again when it repeats a sentence or names a wrong sign, so the number of requests per question
// shows how often the raw model went wrong; it is shown for every answer and in the summary.
let requests = 0;
const chat = createLocalChat({ model, fetchImpl: (...fetchArgs) => { requests += 1; return fetch(...fetchArgs); } });
const day = moscowDate();
const forecast = chatForecastContext(forecastForDate(day));
const rows = [];
for (const row of plan) {
  const profile = { birthUtc: row.chartFor.birthUtc, birthLatitude: row.chartFor.latitude, birthLongitude: row.chartFor.longitude };
  const astro = chartContext(profile, row.question);
  const started = performance.now();
  requests = 0;
  let answer = '';
  let problems;
  try {
    ({ answer } = await chat.answer({ message: row.question, history: [], forecast: forecastForQuestion(forecast, row.question), length: row.length,
      chart: astro.chart, materials: findMaterials(knowledge, row.question, astro.queries) }));
    problems = [];
    if (unsafeChatAnswer(answer, day)) problems.push('сработала проверка безопасности');
    if (answer.length < MIN_CHARS[row.length] || answer.length > ANSWER_LENGTHS[row.length].maxChars) problems.push(`длина ${answer.length} вне режима ${row.length}`);
    if (AI_WORDS.test(answer)) problems.push('называет себя ИИ без вопроса');
    if (!CHART_WORDS.test(answer)) problems.push('не опирается на положения карты');
    if (cleanRepeatedSentences(answer).trim() !== answer.trim()) problems.push('повторяются предложения');
    problems.push(...chartClaimProblems(answer, natalChart(row.chartFor)).map((problem) => `расхождение с расчётом: ${problem}`));
  } catch (error) {
    problems = [`ошибка: ${error.message}`];
  }
  const ms = Math.round(performance.now() - started);
  const retried = requests > 1;
  rows.push({ row, answer, problems, ms, retried });
  console.log(`${problems.length ? '✖' : '✔'} ${row.id} (${ms} мс${retried ? ', повторный запрос к модели' : ''})${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}
const failed = rows.filter((item) => item.problems.length).length;
console.log(`\n${rows.length - failed} из ${rows.length} прошли; ответов с повторным запросом к модели: ${rows.filter((item) => item.retried).length}; модель ${model}, расчёт ${day}`);
if (reportPath) {
  writeFileSync(reportPath, [`# Контрольный прогон натальных вопросов: ${model}`, '', `Дата расчёта ${day}. Прошли ${rows.length - failed} из ${rows.length}; с повторным запросом к модели: ${rows.filter((item) => item.retried).length}.`, '',
    ...rows.flatMap(({ row, answer, problems, ms, retried }) => [`## ${problems.length ? '✖' : '✔'} ${row.question}`, '',
      `Режим: ${row.length}; ${ms} мс${retried ? '; был повторный запрос к модели' : ''}${problems.length ? `; проблемы: ${problems.join('; ')}` : ''}`, '', `> ${answer || '—'}`, ''])].join('\n'));
}
process.exitCode = failed ? 1 : 0;
