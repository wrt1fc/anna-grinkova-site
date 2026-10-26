// Usage: node training/report-for-anna.mjs <eval-natal-report.md> <out.txt> [--title "anna-v5"] [--limit 15]
// Turns the report of training/eval-natal.js into a plain text file that Anna can read: numbered questions and the model's raw
// answers, without Markdown, timings or the check marks. Answers the automatic checks marked as failed are listed separately at
// the end, so nothing is hidden from the reader.
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const [inPath, outPath] = args.filter((arg, index) => !arg.startsWith('--') && !['--title', '--limit'].includes(args[index - 1]));
if (!inPath || !outPath) { console.error('Usage: node training/report-for-anna.mjs <report.md> <out.txt> [--title "anna-v5"] [--limit 15]'); process.exit(2); }
const title = option('--title', 'модель');
const limit = Number(option('--limit', 15));

const blocks = readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').split(/^## /m).slice(1).map((block) => {
  const [head, ...rest] = block.split('\n');
  const failed = head.startsWith('✖');
  const question = head.replace(/^[✔✖]\s*/u, '').trim();
  const meta = rest.find((line) => line.startsWith('Режим:')) ?? '';
  const answer = rest.filter((line) => line.startsWith('> ')).map((line) => line.slice(2)).join('\n').trim();
  const problems = /проблемы: (.*)$/u.exec(meta)?.[1] ?? '';
  return { question, answer, failed, problems };
});

const shown = blocks.slice(0, limit);
const lines = [`Примеры натальных ответов ${title} для проверки Анной`, 'Это исходные ответы модели без редакторских исправлений. Черновик, не утверждён.', ''];
shown.forEach((item, index) => lines.push(`${index + 1}. ${item.question}`, '', item.answer, '', '------------------------------------------------', ''));
const failed = blocks.filter((item) => item.failed);
if (failed.length) {
  lines.push('Ответы, которые не прошли автоматическую проверку:', '');
  for (const item of failed) lines.push(`— ${item.question}: ${item.problems}`);
}
writeFileSync(outPath, `${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`в файле ${shown.length} ответов из ${blocks.length}; не прошли проверку: ${failed.length}; ${outPath}`);
