// Usage: node training/validate-cards.js <cards.jsonl> [--names names.txt]
// Checks every card; approved cards with problems block dataset building.
import { readFileSync } from 'node:fs';
import { cardProblems, readCards } from './cards.js';

const [path, flag, namesPath] = process.argv.slice(2);
if (!path) {
  console.error('Usage: node training/validate-cards.js <cards.jsonl> [--names names.txt]');
  process.exit(2);
}
const forbiddenNames = flag === '--names' && namesPath
  ? readFileSync(namesPath, 'utf8').split(/\r?\n/).map((name) => name.trim()).filter(Boolean) : [];

const cards = readCards(path);
const counts = { draft: 0, approved: 0, rejected: 0 };
const ids = new Set();
let blocking = 0;
for (const card of cards) {
  const problems = cardProblems(card, { forbiddenNames });
  if (card.id && ids.has(card.id)) problems.push('повторяющийся id');
  ids.add(card.id);
  if (card.status in counts) counts[card.status]++;
  if (problems.length) {
    if (card.status === 'approved') blocking++;
    console.log(`${card.status === 'approved' ? 'ОШИБКА' : 'внимание'} строка ${card.lineNumber} (${card.id ?? '?'}): ${problems.join('; ')}`);
  }
}
console.log(`карточек: ${cards.length}; черновиков ${counts.draft}, одобрено ${counts.approved}, отклонено ${counts.rejected}`);
if (blocking) {
  console.log(`одобренных карточек с ошибками: ${blocking}`);
  process.exitCode = 1;
}
