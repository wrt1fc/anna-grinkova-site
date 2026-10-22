// Usage: node training/make-natal-set.mjs <dataset-dir> <out-cards.jsonl> [--replay 54]
// Collects the cards for the natal-chart training run: all natal cards (training/import-natal.mjs), Anna's money cards from her
// methodics, and a small replay of general chat cards (about a fifth) so the model keeps what it learned before.
// Tarot is off the site, so no tarot cards and no chat cards about a card of the day are taken.
// The last three natal charts and three replayed questions go to the check set (eval) for the loss of the best epoch.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCards } from './cards.js';

const args = process.argv.slice(2);
const replayAt = args.indexOf('--replay');
const [dir, outPath] = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--replay');
if (!dir || !outPath) { console.error('Usage: node training/make-natal-set.mjs <dataset-dir> <out-cards.jsonl> [--replay 54]'); process.exit(2); }
const replayTotal = replayAt >= 0 ? Number(args[replayAt + 1]) : 54;
const TAROT = /таро|аркан|расклад|карт[аыуе]? дня/i;

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

const natal = readCards(join(dir, 'cards-natal.jsonl')).map((card) => ({ ...card, split: /^nt-4[89]|^nt-50/.test(card.id) ? 'eval' : 'train' }));
const methodics = readCards(join(dir, 'cards-methodics.jsonl'));
const chat = readCards(join(dir, 'cards.jsonl')).filter((card) => !TAROT.test(`${card.question} ${card.answer}`));

// Chat cards come in groups of lengths for one question: take whole questions.
const byQuestion = new Map();
for (const card of chat) byQuestion.set(card.question, [...(byQuestion.get(card.question) ?? []), card]);
const chatPick = [];
let groups = 0;
for (const group of shuffle([...byQuestion.values()])) {
  if (chatPick.length >= replayTotal) break;
  groups++;
  chatPick.push(...group.map((card) => ({ ...card, split: groups <= 3 ? 'eval' : 'train' })));
}

const all = [...natal, ...methodics, ...chatPick].map(({ lineNumber, ...card }) => card);
writeFileSync(outPath, `${all.map((card) => JSON.stringify(card)).join('\n')}\n`);
console.log(`натальных ${natal.length} (из них на проверку ${natal.filter((c) => c.split === 'eval').length}), по методичкам ${methodics.length}, `
  + `повтор: чат ${chatPick.length} (на проверку ${chatPick.filter((c) => c.split === 'eval').length}); ${outPath}`);
