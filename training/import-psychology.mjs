// Usage: node training/import-psychology.mjs <drafts.txt> <out.jsonl> [--author "кто написал"]
// Answers about people and relationships, written by hand on the ground of the course presentations (the private knowledge base,
// D:/AnnaAI/knowledge/psychology) in Anna's manner and in the writer's own words. A draft file is a list of blocks:
//   === <id> | <short|medium|detailed> | <topic> [| playful]
//   Вопрос: <the visitor's question>
//   <answer paragraphs, separated by a blank line>
// Every answer is checked like any card (length of its mode, personal data, chat safety rules: no first person of Anna, prices,
// links, guarantees) and written as a draft card; already imported ids are skipped. Answers with problems are listed, not written.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { cardProblems, readCards } from './cards.js';

const args = process.argv.slice(2);
const author = args[args.indexOf('--author') + 1] ?? 'ассистент';
const [inPath, outPath] = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--author');
if (!inPath || !outPath) { console.error('Usage: node training/import-psychology.mjs <drafts.txt> <out.jsonl> [--author "..."]'); process.exit(2); }
const done = new Set(existsSync(outPath) ? readCards(outPath).map((card) => card.id) : []);
let written = 0;
let skipped = 0;
for (const block of readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').split(/^=== /m).slice(1)) {
  const [header, ...rest] = block.split('\n');
  const [id, length, topic, tone] = header.split('|').map((part) => part.trim());
  if (done.has(id)) continue;
  const text = rest.join('\n').trim();
  const question = /^Вопрос:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const answer = text.replace(/^Вопрос:.*\n?/m, '').trim().replace(/\n{3,}/g, '\n\n');
  const card = { id, status: 'draft', split: 'train', length, topic: topic || 'Психология отношений', question, answer, ...(tone ? { tone } : {}),
    source: { file: `написано вручную (${author})`, from: 'презентации курса психологов, 4 ступень (закрытая база знаний)' } };
  const problems = question ? cardProblems(card) : ['нет строки «Вопрос:»'];
  if (problems.length) { console.log(`✖ ${id}: ${problems.join('; ')}`); skipped++; continue; }
  appendFileSync(outPath, `${JSON.stringify(card)}\n`);
  written++;
}
console.log(`записано ${written}, отклонено ${skipped}`);
