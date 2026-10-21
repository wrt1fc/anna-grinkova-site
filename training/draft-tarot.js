// Usage: node training/draft-tarot.js <out.jsonl> [--model anna-v1] [--tries 4] [--limit 20] [--only train|eval]
// Asks the model for a reading for each (question, card) pair of training/tarot-bank.json and keeps the first reply
// that passes the quality filter (training/tarot-lib.js). Safe to stop and run again: pairs already in the file are skipped.
// Every card is written as a draft: Anna approves, edits or removes it before the cards are used for training.
import { appendFileSync, existsSync } from 'node:fs';
import bank from './tarot-bank.json' with { type: 'json' };
import { readCards } from './cards.js';
import { pairsFromBank, tarotReadingProblems } from './tarot-lib.js';
import { createLocalChat, tarotReadingContext, TAROT_MODE } from '../server/local-chat.js';
import { tarotCardByNumber } from '../server/daily-forecast.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const outPath = args.find((arg, index) => !arg.startsWith('--') && !['--model', '--tries', '--limit', '--only'].includes(args[index - 1]));
if (!outPath) {
  console.error('Usage: node training/draft-tarot.js <out.jsonl> [--model anna-v1] [--tries 4] [--limit 20] [--only train|eval]');
  process.exit(2);
}
const model = option('--model', 'anna-v1');
const tries = Number(option('--tries', 4));
const limit = Number(option('--limit', Infinity));
const only = option('--only', null);
// Several tries at rising temperature: a stricter first reply, a looser one if the filter keeps rejecting.
const TEMPERATURES = [0.5, 0.6, 0.7, 0.8, 0.9];

const chat = createLocalChat({ model });
const done = new Set(existsSync(outPath) ? readCards(outPath).map((card) => card.id) : []);
const todo = pairsFromBank(bank).filter((pair) => !done.has(pair.id) && (!only || pair.split === only)).slice(0, limit);
const rejected = new Map();
let kept = 0;
let dropped = 0;

for (const [index, pair] of todo.entries()) {
  const card = tarotCardByNumber(pair.cardNumber, pair.position);
  let draft = null;
  for (let attempt = 0; attempt < tries && !draft; attempt++) {
    try {
      const { answer } = await chat.answer({ message: pair.question, history: [], mode: TAROT_MODE, length: 'medium',
        forecast: tarotReadingContext(pair.day, card), temperature: TEMPERATURES[Math.min(attempt, TEMPERATURES.length - 1)] });
      const problems = tarotReadingProblems(answer, { name: card.name, sensitive: pair.sensitive });
      if (problems.length) for (const problem of problems) rejected.set(problem, (rejected.get(problem) ?? 0) + 1);
      else draft = { answer, attempt: attempt + 1 };
    } catch (error) {
      console.warn(`${pair.id}: ${error.message}`);
    }
  }
  if (!draft) { dropped++; console.log(`✖ ${pair.id} (${card.name}): ни одна из ${tries} попыток не прошла фильтр`); continue; }
  appendFileSync(outPath, `${JSON.stringify({ id: pair.id, status: 'draft', split: pair.split, mode: 'tarot', length: 'medium', topic: pair.topic,
    ...(pair.sensitive ? { sensitive: true } : {}), question: pair.question, card: { number: card.number, position: card.position },
    forecastDate: pair.day, answer: draft.answer, note: `черновик ${model}, попытка ${draft.attempt}; ждёт правки Анны` })}\n`);
  kept++;
  if ((index + 1) % 10 === 0 || index + 1 === todo.length) console.log(`${index + 1} из ${todo.length}: готово ${kept}, не прошли ${dropped}`);
}

console.log(`\nчерновиков записано: ${kept}, отброшено: ${dropped}, модель ${model}, файл ${outPath}`);
if (rejected.size) {
  console.log('Чаще всего фильтр отклонял:');
  for (const [problem, count] of [...rejected].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${count} × ${problem}`);
}
