// Usage: node training/natal-plan.mjs <plan.json> [--round v5|v6 --avoid <old-plan.json>]   writes the plan (charts and questions, reproducible by seed)
//        node training/natal-plan.mjs <plan.json> --worksheet N [--size 12] [--knowledge <dir>]
//        prints the N-th group of training questions together with exactly what the model will be shown for them
//        (planets with sign, house and retrograde flag, angles, aspects, Anna's money block and her matching slides),
//        so the answers can be written by hand strictly from the calculation.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chartContext, findMaterials } from '../server/chat-grounding.js';
import { loadKnowledge } from '../server/knowledge.js';
import { KIND_ORDER_V5, KIND_ORDER_V6, buildPlan } from './natal-lib.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const planPath = args.find((arg, index) => !arg.startsWith('--') && !['--worksheet', '--size', '--knowledge', '--round', '--avoid'].includes(args[index - 1]));
if (!planPath) { console.error('Usage: node training/natal-plan.mjs <plan.json> [--worksheet N] [--size 12] [--knowledge <dir>]'); process.exit(2); }

if (!args.includes('--worksheet')) {
  // --round v5 --avoid <old-plan.json>: a second, new set of charts and everyday questions for anna-v5 (no chart of the old plan is reused).
  const avoid = new Set(option('--avoid') ? JSON.parse(readFileSync(option('--avoid'), 'utf8')).map((row) => row.chartFor.birthUtc) : []);
  const round = option('--round');
  const plan = round === 'v5' ? buildPlan({ train: 48, evalCharts: 8, seed: 20261026, order: KIND_ORDER_V5, idPrefix: 'v5', avoid })
    : round === 'v6' ? buildPlan({ train: 18, evalCharts: 8, seed: 20261027, order: KIND_ORDER_V6, idPrefix: 'v6', avoid }) : buildPlan();
  writeFileSync(planPath, JSON.stringify(plan, null, 1));
  const count = (split) => plan.filter((row) => row.split === split).length;
  console.log(`план: ${count('train')} вопросов для обучения, ${count('eval')} для проверки; ${planPath}`);
  process.exit(0);
}

if (!existsSync(planPath)) { console.error('Сначала создайте план без --worksheet'); process.exit(2); }
const plan = JSON.parse(readFileSync(planPath, 'utf8')).filter((row) => row.split === 'train');
const size = Number(option('--size', 12));
const group = Number(option('--worksheet', 1));
const knowledge = option('--knowledge') ? loadKnowledge(resolve(option('--knowledge'))) : null;
const now = new Date('2026-06-15T09:00:00Z');
let lastChart = -1;
for (const row of plan.slice((group - 1) * size, group * size)) {
  const profile = { birthUtc: row.chartFor.birthUtc, birthLatitude: row.chartFor.latitude, birthLongitude: row.chartFor.longitude };
  const astro = chartContext(profile, row.question, now);
  const { chart } = astro;
  console.log(`=== ${row.id} | ${row.length}
Вопрос: ${row.question}`);
  if (row.chartIndex === lastChart) console.log('(карта та же, что выше)');
  else {
    console.log(`Планеты: ${chart.planets.join('; ')}`);
    if (chart.angles) console.log(`Углы: ${chart.angles.join('; ')}`);
    console.log(`Аспекты: ${chart.aspects.join('; ')}`);
  }
  lastChart = row.chartIndex;
  if (chart.money) {
    console.log(`Деньги (методика Анны): ${JSON.stringify({ ...chart.money, method: undefined })}`);
    for (const item of findMaterials(knowledge, row.question, astro.queries)) console.log(`Слайд Анны: ${item.text.replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  console.log('');
}
console.log(`группа ${group} из ${Math.ceil(plan.length / size)}`);
