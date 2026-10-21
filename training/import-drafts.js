// Usage: node training/import-drafts.js <drafts.txt> <out.jsonl> [--author "кто написал"] [--worksheet N] [--size 30]
// Drafts written by hand (not by the model) come as plain text: a line "=== <pair id>" starts a reading, its paragraphs
// follow, separated by blank lines. Each reading is matched with its pair of training/tarot-bank.json, checked with the
// quality filter and written as a draft card (status: draft). Readings with problems are listed and not written.
// --worksheet N prints the N-th group of training pairs (card data included), so the readings can be written for them.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import bank from './tarot-bank.json' with { type: 'json' };
import { cardProblems, readCards } from './cards.js';
import { pairsFromBank } from './tarot-lib.js';
import { tarotCardByNumber } from '../server/daily-forecast.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const pairs = new Map(pairsFromBank(bank).map((pair) => [pair.id, pair]));
const trainPairs = [...pairs.values()].filter((pair) => pair.split === 'train');

if (args.includes('--worksheet')) {
  const size = Number(option('--size', 30));
  const group = Number(option('--worksheet', 1));
  for (const pair of trainPairs.slice((group - 1) * size, group * size)) {
    const card = tarotCardByNumber(pair.cardNumber);
    console.log(`=== ${pair.id} | ${pair.topic}${pair.sensitive ? ' | ЧУВСТВИТЕЛЬНАЯ' : ''}\nВопрос: ${pair.question}\nКарта: ${card.name} (тема: ${card.focus}; действие: ${card.action})\n`);
  }
  console.log(`группа ${group} из ${Math.ceil(trainPairs.length / size)}`);
  process.exit(0);
}

const [inPath, outPath] = args.filter((arg, index) => !arg.startsWith('--') && !['--author', '--size', '--worksheet'].includes(args[index - 1]));
if (!inPath || !outPath) {
  console.error('Usage: node training/import-drafts.js <drafts.txt> <out.jsonl> [--author "..."]');
  process.exit(2);
}
const author = option('--author', 'ассистент');
const done = new Set(existsSync(outPath) ? readCards(outPath).map((card) => card.id) : []);
const blocks = readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').split(/^=== /m).slice(1);
let written = 0;
let skipped = 0;
for (const block of blocks) {
  const [header, ...rest] = block.split('\n');
  const id = header.split('|')[0].trim();
  const pair = pairs.get(id);
  if (!pair) { console.log(`✖ ${id}: такой пары нет в банке`); skipped++; continue; }
  if (done.has(id)) { console.log(`· ${id}: уже есть, пропущено`); continue; }
  const answer = rest.join('\n').trim().replace(/\n{3,}/g, '\n\n');
  const card = {
    id, status: 'draft', split: pair.split, mode: 'tarot', length: 'medium', topic: pair.topic, ...(pair.sensitive ? { sensitive: true } : {}),
    question: pair.question, card: { number: pair.cardNumber, position: pair.position }, forecastDate: pair.day, answer,
    note: `черновик: написал ${author}; ждёт правки Анны`,
  };
  const problems = cardProblems(card);
  if (problems.length) { console.log(`✖ ${id} (${tarotCardByNumber(pair.cardNumber).name}): ${problems.join('; ')}`); skipped++; continue; }
  appendFileSync(outPath, `${JSON.stringify(card)}\n`);
  done.add(id);
  written++;
}
console.log(`записано: ${written}, с проблемами: ${skipped}, всего в файле: ${done.size} из ${trainPairs.length} обучающих пар`);
if (skipped) process.exitCode = 1;
