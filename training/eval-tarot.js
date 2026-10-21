// Usage: node training/eval-tarot.js <model> [report.md]
// Runs the held-out questions of training/tarot-bank.json (one card each) through the live reading prompt of a model
// with the temperature the site uses, and checks every reply with the quality filter. Exit code 1 if any reply fails,
// so it can gate a new model. The manner itself is judged by Anna.
import { writeFileSync } from 'node:fs';
import bank from './tarot-bank.json' with { type: 'json' };
import { pairsFromBank, tarotReadingProblems } from './tarot-lib.js';
import { createLocalChat, tarotReadingContext, TAROT_MODE } from '../server/local-chat.js';
import { tarotCardByNumber } from '../server/daily-forecast.js';

const [model, reportPath] = process.argv.slice(2);
if (!model) {
  console.error('Usage: node training/eval-tarot.js <model> [report.md]');
  process.exit(2);
}
const chat = createLocalChat({ model });
const items = pairsFromBank(bank).filter((pair) => pair.split === 'eval' && pair.position === 0);
const rows = [];
for (const pair of items) {
  const card = tarotCardByNumber(pair.cardNumber, pair.position);
  const started = performance.now();
  let answer = '';
  let problems;
  try {
    ({ answer } = await chat.answer({ message: pair.question, history: [], mode: TAROT_MODE, length: 'medium', forecast: tarotReadingContext(pair.day, card) }));
    problems = tarotReadingProblems(answer, { name: card.name, sensitive: pair.sensitive });
  } catch (error) {
    problems = [`ошибка: ${error.message}`];
  }
  const ms = Math.round(performance.now() - started);
  rows.push({ pair, card, answer, problems, ms });
  console.log(`${problems.length ? '✖' : '✔'} ${pair.id} · ${card.name} (${ms} мс)${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}
const failed = rows.filter((row) => row.problems.length).length;
console.log(`\n${rows.length - failed} из ${rows.length} прошли; модель ${model}, набор ${bank.version}`);
if (reportPath) {
  writeFileSync(reportPath, [`# Контрольный прогон раскладов: ${model}`, '', `Набор ${bank.version}. Прошли ${rows.length - failed} из ${rows.length}.`, '',
    ...rows.flatMap(({ pair, card, answer, problems, ms }) => [`## ${problems.length ? '✖' : '✔'} ${pair.question} (карта «${card.name}»)`, '',
      `${ms} мс${problems.length ? `; проблемы: ${problems.join('; ')}` : ''}`, '', `> ${answer || '—'}`, ''])].join('\n'));
}
process.exitCode = failed ? 1 : 0;
