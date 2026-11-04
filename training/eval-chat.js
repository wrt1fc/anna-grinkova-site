// Usage: node training/eval-chat.js <model> [report.md]
// Runs the control questions through the live local model with today's calculation and checks each reply.
// Exit code 1 if any check fails, so it can gate a model, rules or materials change.
import { writeFileSync } from 'node:fs';
import evalSet from './eval-questions.json' with { type: 'json' };
import { forecastForDate, moscowDate } from '../server/daily-forecast.js';
import { chatForecastContext, createLocalChat, forecastForQuestion } from '../server/local-chat.js';
import { evaluateAnswer } from './eval-checks.js';
import { CRISIS_ANSWER, isCrisisMessage } from '../server/crisis.js';
import {evaluationTelemetry} from './evaluation-telemetry.mjs';

const [model, reportPath] = process.argv.slice(2);
if (!model) {
  console.error('Usage: node training/eval-chat.js <model> [report.md]');
  process.exit(2);
}
let traces=[];
const chat = createLocalChat({ model,onTrace:t=>traces.push(t) });
const day = process.env.ANNA_EVAL_DATE || moscowDate();
const forecast = chatForecastContext(forecastForDate(day));
const rows = [];
for (const item of evalSet.questions) {
  const started = performance.now();
  let answer = '';
  let problems;
  let result={},failure=null;traces=[];
  try {
    // Mirrors the chat route: crisis messages get the fixed reply and never reach the model.
    if(isCrisisMessage(item.question)){answer=CRISIS_ANSWER;result={model:null};}
    else{result=await chat.answer({ message: item.question, history: [], forecast: forecastForQuestion(forecast, item.question), length: item.length });answer=result.answer;}
    problems = evaluateAnswer(item, answer, day);
    if(process.env.CHAT_LEARNING_SIGNALS==='1'&&traces.length&&!traces.at(-1).signal.formatValid)problems.push('signal format invalid');
  } catch (error) {
    failure=error;
    problems = [`ошибка: ${error.message}`];
  }
  const ms = Math.round(performance.now() - started);
  rows.push({ item, answer, problems, ms,telemetry:evaluationTelemetry(result,traces,failure),fixedCrisisReply:isCrisisMessage(item.question) });
  console.log(`${problems.length ? '✖' : '✔'} ${item.id} (${ms} мс)${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}

const failed = rows.filter((row) => row.problems.length).length;
console.log(`\n${rows.length - failed} из ${rows.length} прошли; модель ${model}, набор ${evalSet.version}, расчёт ${day}`);
if (reportPath) {
  const report = [`# Контрольный прогон: ${model}`, '', `Дата расчёта ${day}. Прошли ${rows.length - failed} из ${rows.length}.`, '',
    ...rows.flatMap(({ item, answer, problems, ms }) => [`## ${problems.length ? '✖' : '✔'} ${item.question}`, '',
      `Режим: ${item.length}; ${ms} мс${problems.length ? `; проблемы: ${problems.join('; ')}` : ''}`, '', `> ${answer || '—'}`, ''])];
  writeFileSync(reportPath, report.join('\n'));
  writeFileSync(reportPath.replace(/\.md$/u,'')+'.json', JSON.stringify({model,day,rows:rows.map(({item,answer,problems,ms,telemetry,fixedCrisisReply})=>({id:item.id,question:item.question,answer,problems,ms,...telemetry,fixedCrisisReply})),summary:{passed:rows.length-failed,total:rows.length}},null,2));
}
process.exitCode = failed ? 1 : 0;
