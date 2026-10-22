// Usage: node training/import-natal.mjs <plan.json> <drafts.txt> <out.jsonl> [--author "кто написал"]
// Answers written by hand come as plain text: a line "=== <id>" starts an answer, its paragraphs follow, separated by blank lines.
// Each answer is matched with its question and chart in the plan, checked like any card (length, personal data, chat safety)
// and against the calculation (planet in sign and house, aspects, retrograde), and appended as a draft card with `chartFor`.
// Answers with problems are listed and not written. Already imported ids are skipped.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { natalChart } from '../server/astro-chart.js';
import { cardProblems, readCards } from './cards.js';
import { chartClaimProblems } from './natal-lib.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const [planPath, inPath, outPath] = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--author');
if (!planPath || !inPath || !outPath) {
  console.error('Usage: node training/import-natal.mjs <plan.json> <drafts.txt> <out.jsonl> [--author "..."]');
  process.exit(2);
}
const author = option('--author', 'ассистент');
const plan = new Map(JSON.parse(readFileSync(planPath, 'utf8')).map((row) => [row.id, row]));
const done = new Set(existsSync(outPath) ? readCards(outPath).map((card) => card.id) : []);
let written = 0;
let skipped = 0;
for (const block of readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').split(/^=== /m).slice(1)) {
  const [header, ...rest] = block.split('\n');
  const id = header.split('|')[0].trim();
  const row = plan.get(id);
  if (!row) { console.log(`✖ ${id}: нет в плане`); skipped++; continue; }
  if (done.has(id)) continue;
  const answer = rest.join('\n').trim().replace(/\n{3,}/g, '\n\n');
  const card = { id, status: 'draft', split: row.split, length: row.length, topic: 'Натальная карта', question: row.question, answer,
    chartFor: row.chartFor, source: { file: `написано вручную (${author})`, from: 'натальный расчёт сайта и методика Анны' } };
  const problems = [...cardProblems(card), ...chartClaimProblems(answer, natalChart(row.chartFor))];
  if (problems.length) { console.log(`✖ ${id}: ${problems.join('; ')}`); skipped++; continue; }
  appendFileSync(outPath, `${JSON.stringify(card)}\n`);
  written++;
}
console.log(`записано ${written}, отклонено ${skipped}`);
