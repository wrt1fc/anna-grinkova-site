// Usage: node training/build-dataset.js <cards.jsonl[,more.jsonl]> <out-dir> [--include-drafts] [--knowledge <dir>] [--holdout 0.08]
// Turns approved cards into chat-format JSONL that matches the live /api/chat prompt,
// so the tuned model learns Anna's manner inside the exact format it will be served with:
// the same day forecast, the same natal chart and money block (cards with `chartFor`) and the same material search.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chatContext from '../config/chat-context.json' with { type: 'json' };
import { forecastForDate } from '../server/daily-forecast.js';
import { DEFAULT_ANSWER_LENGTH, chatForecastContext, chatPrompt, forecastForQuestion } from '../server/local-chat.js';
import { chartContext, findMaterials } from '../server/chat-grounding.js';
import { loadKnowledge } from '../server/knowledge.js';
import { cardProblems, readCards } from './cards.js';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const [cardsArg, outDir] = args.filter((arg, index) => !arg.startsWith('--') && !['--knowledge', '--holdout'].includes(args[index - 1]));
if (!cardsArg || !outDir) {
  console.error('Usage: node training/build-dataset.js <cards.jsonl[,more.jsonl]> <out-dir> [--include-drafts] [--knowledge <dir>] [--holdout 0.08]');
  process.exit(2);
}
const includeDrafts = args.includes('--include-drafts');
const knowledge = option('--knowledge') ? loadKnowledge(resolve(option('--knowledge'))) : null;
const holdout = Number(option('--holdout') ?? 0);
if (!(holdout >= 0 && holdout < 0.5)) { console.error('--holdout must be between 0 and 0.5'); process.exit(2); }

// Spread examples over a year of real calculated days so the model sees varied forecast context.
function dayFor(card, index) {
  return card.forecastDate || new Date(Date.UTC(2026, 0, 1) + (index * 37 % 365) * 86_400_000).toISOString().slice(0, 10);
}

// All lengths of one question go to the same side, otherwise the check set would leak into training.
function heldOut(question) {
  const bucket = createHash('sha256').update(question.trim().toLowerCase()).digest().readUInt32BE(0) / 0x1_0000_0000;
  return bucket < holdout;
}

const system = chatContext.systemInstructions.join(' ');
const split = { train: [], eval: [] };
let skipped = 0;
const cards = cardsArg.split(',').flatMap((path) => readCards(path));
cards.forEach((card, index) => {
  const usable = card.status === 'approved' || (includeDrafts && card.status === 'draft');
  if (!usable || cardProblems(card).length) { skipped++; return; }
  const day = dayFor(card, index);
  const message = card.question.trim();
  const profile = card.chartFor ? { birthUtc: card.chartFor.birthUtc, birthLatitude: card.chartFor.latitude, birthLongitude: card.chartFor.longitude } : null;
  const astro = chartContext(profile, message, new Date(`${day}T09:00:00Z`));
  const prompt = chatPrompt({ message, history: [], forecast: forecastForQuestion(chatForecastContext(forecastForDate(day, index % 5)), message),
    length: card.length ?? DEFAULT_ANSWER_LENGTH, materials: findMaterials(knowledge, message, astro.queries), chart: astro.chart });
  const side = card.split === 'eval' || heldOut(message) ? 'eval' : 'train';
  split[side].push({
    id: card.id,
    // Conversational prompt/completion: the trainer computes loss on the completion only.
    prompt: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    completion: [{ role: 'assistant', content: card.answer.trim() }],
  });
});

mkdirSync(outDir, { recursive: true });
for (const [name, rows] of Object.entries(split)) {
  writeFileSync(join(outDir, `${name}.jsonl`), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}
console.log(`train: ${split.train.length}, eval: ${split.eval.length}, пропущено: ${skipped}${knowledge ? `, материалов в поиске: ${knowledge.size}` : ''}`
  + `${includeDrafts ? ' (включены черновики — только для пробного запуска)' : ''}`);
