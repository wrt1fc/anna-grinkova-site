// Usage: node training/make-natal-set.mjs <dataset-dir> <out-cards.jsonl> [--replay 50]
// Collects the cards for the natal-chart training run: all natal cards (training/import-natal.mjs), Anna's money cards from her
// methodics, and a small replay of chat and tarot cards (about a fifth) so the model keeps what it learned before.
// The last three natal charts and the replay never share questions with the earlier check set (build-v3/eval.jsonl): they go to eval.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCards } from './cards.js';

const args = process.argv.slice(2);
const [dir, outPath] = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--replay');
if (!dir || !outPath) { console.error('Usage: node training/make-natal-set.mjs <dataset-dir> <out-cards.jsonl> [--replay 50]'); process.exit(2); }
const replayAt = args.indexOf('--replay');
const replayTotal = replayAt >= 0 ? Number(args[replayAt + 1]) : 50;

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(20261022);
const shuffle = (items) => items.map((item) => [random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);

const usedInEval = new Set(readFileSync(join(dir, 'build-v3', 'eval.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).id));
const natal = readCards(join(dir, 'cards-natal.jsonl')).map((card) => ({ ...card, split: /^nt-4[89]|^nt-50/.test(card.id) ? 'eval' : 'train' }));
const methodics = readCards(join(dir, 'cards-methodics.jsonl'));
const chat = readCards(join(dir, 'cards.jsonl')).filter((card) => !usedInEval.has(card.id));
const tarot = readCards(join(dir, 'cards-tarot.jsonl')).filter((card) => !usedInEval.has(card.id));

// Chat cards come in groups of lengths for one question: take whole questions.
const byQuestion = new Map();
for (const card of chat) byQuestion.set(card.question, [...(byQuestion.get(card.question) ?? []), card]);
const chatPick = [];
for (const group of shuffle([...byQuestion.values()])) { if (chatPick.length >= Math.round(replayTotal / 2)) break; chatPick.push(...group); }
const tarotPick = shuffle(tarot).slice(0, replayTotal - chatPick.length);

const all = [...natal, ...methodics, ...chatPick, ...tarotPick].map(({ lineNumber, ...card }) => card);
writeFileSync(outPath, `${all.map((card) => JSON.stringify(card)).join('\n')}\n`);
console.log(`натальных ${natal.length} (из них на проверку ${natal.filter((c) => c.split === 'eval').length}), по методичкам ${methodics.length}, повтор: чат ${chatPick.length}, расклады ${tarotPick.length}; ${outPath}`);
