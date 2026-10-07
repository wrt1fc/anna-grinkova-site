// Usage: node training/build-dataset.js <cards.jsonl> <out-dir> [--include-drafts]
// Turns approved cards into chat-format JSONL that matches the live /api/chat prompt,
// so the tuned model learns Anna's manner inside the exact format it will be served with.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chatContext from '../config/chat-context.json' with { type: 'json' };
import { forecastForDate } from '../server/daily-forecast.js';
import { DEFAULT_ANSWER_LENGTH, chatForecastContext, chatPrompt } from '../server/local-chat.js';
import { cardProblems, readCards } from './cards.js';

const [cardsPath, outDir, flag] = process.argv.slice(2);
if (!cardsPath || !outDir) {
  console.error('Usage: node training/build-dataset.js <cards.jsonl> <out-dir> [--include-drafts]');
  process.exit(2);
}
const includeDrafts = flag === '--include-drafts';

// Spread examples over a year of real calculated days so the model sees varied forecast context.
function forecastFor(card, index) {
  const day = card.forecastDate || new Date(Date.UTC(2026, 0, 1) + (index * 37 % 365) * 86_400_000).toISOString().slice(0, 10);
  return chatForecastContext(forecastForDate(day, index % 5));
}

const system = chatContext.systemInstructions.join(' ');
const split = { train: [], eval: [] };
let skipped = 0;
readCards(cardsPath).forEach((card, index) => {
  const usable = card.status === 'approved' || (includeDrafts && card.status === 'draft');
  if (!usable || cardProblems(card).length) { skipped++; return; }
  const prompt = chatPrompt({ message: card.question.trim(), history: [], forecast: forecastFor(card, index),
    length: card.length ?? DEFAULT_ANSWER_LENGTH });
  split[card.split === 'eval' ? 'eval' : 'train'].push({
    id: card.id,
    // Conversational prompt/completion: the trainer computes loss on the completion only.
    prompt: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    completion: [{ role: 'assistant', content: JSON.stringify({ answer: card.answer.trim() }) }],
  });
});

mkdirSync(outDir, { recursive: true });
for (const [name, rows] of Object.entries(split)) {
  writeFileSync(join(outDir, `${name}.jsonl`), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}
console.log(`train: ${split.train.length}, eval: ${split.eval.length}, пропущено: ${skipped}${includeDrafts ? ' (включены черновики — только для пробного запуска)' : ''}`);
