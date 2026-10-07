// What a chat question is grounded in besides the day forecast: the calculated natal chart with Anna's money method,
// and matching fragments of her materials. Shared by the live chat and the training set builder,
// so the tuned model learns on exactly the prompt it is served with.
import { asksAboutChart, chartForPrompt, chartSectionsFor, natalChart } from './astro-chart.js';
import { asksAboutMoney, methodQueries, moneyForPrompt, moneyProfile } from './anna-method.js';

// Natal chart, transits, directions and Anna's money method for chart and money questions only;
// birth date, place and email never reach the model.
const MAX_MATERIALS = 5;
export function chartContext(profile, message, now = new Date()) {
  const money = asksAboutMoney(message);
  if (!asksAboutChart(message) && !money) return { chart: null, queries: [] };
  if (!profile?.birthUtc) return { chart: { missing: 'Данные рождения не заполнены в личном кабинете, натальная карта не рассчитана.' }, queries: [] };
  const natal = natalChart({ birthUtc: profile.birthUtc, latitude: profile.birthLatitude, longitude: profile.birthLongitude });
  const chart = chartForPrompt(natal, now, { include: chartSectionsFor(message) });
  if (!money) return { chart, queries: [] };
  const profileMoney = moneyProfile(natal);
  return { chart: { ...chart, money: moneyForPrompt(profileMoney) }, queries: methodQueries(profileMoney) };
}

// Anna's slides that match this chart first (2nd house sign, its ruler, hard aspects, strategy), then the visitor's own words.
export function findMaterials(knowledge, message, queries) {
  if (!knowledge) return [];
  const seen = new Set();
  const found = [];
  for (const item of [...queries.flatMap((query) => knowledge.search(query, { limit: 1 })), ...knowledge.search(message)]) {
    if (seen.has(item.text) || found.length >= MAX_MATERIALS) continue;
    seen.add(item.text);
    found.push({ text: item.text });
  }
  return found;
}
