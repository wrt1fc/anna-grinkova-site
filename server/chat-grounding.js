// What a chat question is grounded in besides the day forecast: the calculated natal chart with Anna's money method,
// the partner's chart for compatibility questions, and matching fragments of her materials. Shared by the live chat
// and the training set builder, so the tuned model learns on exactly the prompt it is served with.
import { asksAboutChart, chartForPrompt, chartSectionsFor, natalChart, POINT_NAMES } from './astro-chart.js';
import { ELEMENT_NAMES, SIGN_PREPOSITIONAL, asksAboutMoney, elementOf, methodQueries, moneyForPrompt, moneyProfile } from './anna-method.js';

// Natal chart, transits, directions and Anna's money method for chart and money questions only;
// birth date, place and email never reach the model.
const MAX_MATERIALS = 5;
// Free-text questions need a strong match: weaker ones pulled in unrelated slides. Chart queries quote Anna's headings and score 9+.
const QUESTION_MIN_SCORE = 6;
const COMPARED = ['sun', 'moon', 'venus', 'mars'];
const COMPATIBILITY_TOPIC = /совместим|подходим ли|подходим друг|подходит ли (он|она) мне|(мы|нам) с (ним|ней|[А-ЯЁ]\p{L}+)|(у нас|наши|наша|наш) (пар|отношени|союз)|уживаться/iu;
export function asksAboutCompatibility(message) { return COMPATIBILITY_TOPIC.test(message); }

const chartOf = (profile) => natalChart({ birthUtc: profile.birthUtc, latitude: profile.birthLatitude, longitude: profile.birthLongitude });

// Planet by planet: the sign and element of each person and whether the elements match, so the reply compares
// both charts instead of describing one of them.
function partnerForPrompt(own, partner) {
  const line = (planet) => {
    const mine = own.planets[planet].sign, theirs = partner.chart.planets[planet].sign;
    const same = elementOf(mine) === elementOf(theirs);
    return `${POINT_NAMES[planet]}: у тебя в ${SIGN_PREPOSITIONAL[mine]} (${ELEMENT_NAMES[elementOf(mine)]}), у партнёра в ${SIGN_PREPOSITIONAL[theirs]} (${ELEMENT_NAMES[elementOf(theirs)]}) — ${same ? 'одна стихия' : 'стихии разные'}`;
  };
  return { label: partner.label ?? null, gender: partner.gender ?? null,
    planets: COMPARED.map((planet) => `${POINT_NAMES[planet]} в знаке ${partner.chart.planets[planet].sign}`),
    compare: COMPARED.map(line) };
}

export function chartContext(profile, message, now = new Date(), { partner = null } = {}) {
  const money = asksAboutMoney(message);
  const compatibility = asksAboutCompatibility(message);
  if (!asksAboutChart(message) && !money && !compatibility) return { chart: null, queries: [] };
  if (!profile?.birthUtc) return { chart: { missing: 'Данные рождения не заполнены в личном кабинете, натальная карта не рассчитана.' }, queries: [] };
  const natal = chartOf(profile);
  const chart = chartForPrompt(natal, now, { include: chartSectionsFor(message) });
  if (compatibility) {
    if (partner?.birthUtc) chart.partner = partnerForPrompt(natal, { ...partner, chart: chartOf(partner) });
    else chart.partnerMissing = 'Карты партнёра нет: для разбора совместимости добавь его или её в разделе «Близкие люди».';
  }
  if (!money) return { chart, queries: [] };
  const profileMoney = moneyProfile(natal);
  return { chart: { ...chart, money: moneyForPrompt(profileMoney) }, queries: methodQueries(profileMoney) };
}

// Anna's slides that match this chart first (2nd house sign, its ruler, hard aspects, strategy), then the visitor's own words.
// A chart query quotes one of Anna's headings ("Управитель 2 дома в 4 доме"); the slide that contains it verbatim wins
// over a general slide that merely shares the words.
function exactSlide(knowledge, query) {
  const candidates = knowledge.search(query, { limit: 5 });
  const needle = query.toLowerCase();
  const exact = candidates.find((item) => item.text.toLowerCase().includes(needle));
  return exact ? [exact] : candidates.slice(0, 1);
}

export function findMaterials(knowledge, message, queries) {
  if (!knowledge) return [];
  const seen = new Set();
  const found = [];
  for (const item of [...queries.flatMap((query) => exactSlide(knowledge, query)), ...knowledge.search(message, { minScore: QUESTION_MIN_SCORE })]) {
    if (seen.has(item.text) || found.length >= MAX_MATERIALS) continue;
    seen.add(item.text);
    found.push({ text: item.text });
  }
  return found;
}
