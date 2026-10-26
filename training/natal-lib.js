// Shared pieces of the natal-chart training set: the question templates, a seeded plan of charts and questions,
// and a check that an answer does not contradict the calculated chart. Used by natal-plan.mjs, natal-worksheet.mjs,
// import-natal.mjs and eval-natal.js.
import { SIGNS, ASPECT_NAMES, POINT_NAMES, natalChart } from '../server/astro-chart.js';

// Sign in the locative case ("в Раке"), the way a person asks about their chart.
export const SIGN_LOCATIVE = { Овен: 'в Овне', Телец: 'в Тельце', Близнецы: 'в Близнецах', Рак: 'в Раке', Лев: 'во Льве', Дева: 'в Деве',
  Весы: 'в Весах', Скорпион: 'в Скорпионе', Стрелец: 'в Стрельце', Козерог: 'в Козероге', Водолей: 'в Водолее', Рыбы: 'в Рыбах' };
const LOCATIVE_TO_SIGN = Object.fromEntries(Object.entries(SIGN_LOCATIVE).map(([sign, text]) => [text.replace(/^(в|во) /, ''), sign]));
const GENITIVE = { sun: 'Солнца', moon: 'Луны', mercury: 'Меркурия', venus: 'Венеры', mars: 'Марса', jupiter: 'Юпитера', saturn: 'Сатурна',
  uranus: 'Урана', neptune: 'Нептуна', pluto: 'Плутона', node: 'Северного узла', lilith: 'Лилит', asc: 'Асцендента', mc: 'MC' };
const GENITIVE_TO_KEY = Object.fromEntries(Object.entries(GENITIVE).map(([key, text]) => [text, key]));
const NOMINATIVE_TO_KEY = Object.fromEntries(Object.entries(POINT_NAMES).map(([key, text]) => [text, key]));
const PLANET_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const SLOW_RETROGRADE = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

// Birth places (latitude, longitude): the chart needs only the coordinates; the cities are never named in a prompt.
const PLACES = [[55.75, 37.62], [59.93, 30.34], [55.03, 82.92], [56.84, 60.6], [55.8, 49.1], [45.04, 38.98], [53.2, 50.15], [54.99, 73.37],
  [48.48, 135.08], [53.9, 27.57], [50.45, 30.52], [43.24, 76.89], [47.23, 39.72], [43.12, 131.89], [56.33, 44.0], [56.01, 92.87]];

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

const asc = (natal) => natal.angles?.asc.sign;
const aspectOf = (natal, index) => natal.aspects.slice(0, 12).filter((a) => a.first !== 'node' && a.second !== 'node' && a.first !== 'lilith' && a.second !== 'lilith')[index];

// Each kind returns { question, length } for a chart, or null when the chart has nothing to ask about (the next kind is used then).
export const KINDS = {
  moon: (n) => ({ question: `У меня в натальной карте Луна ${SIGN_LOCATIVE[n.planets.moon.sign]}, в ${n.planets.moon.house} доме. Что это значит?`, length: 'medium' }),
  'sun-asc': (n) => ({ question: `В моей натальной карте Солнце ${SIGN_LOCATIVE[n.planets.sun.sign]}, а асцендент ${SIGN_LOCATIVE[asc(n)]}. Почему я кажусь людям не таким, как внутри?`, length: 'medium' }),
  love: () => ({ question: 'Что в моей натальной карте говорит про отношения?', length: 'medium' }),
  pattern: () => ({ question: 'Почему в отношениях я повторяю один и тот же сценарий? Что в натальной карте про это?', length: 'medium' }),
  career: () => ({ question: 'Какое у меня призвание по натальной карте и чем лучше заниматься?', length: 'medium' }),
  money: () => ({ question: 'Откуда мне лучше зарабатывать по моей натальной карте?', length: 'medium' }),
  aspect: (n, pick) => {
    const a = aspectOf(n, pick % Math.max(1, Math.min(6, n.aspects.length)));
    return a ? { question: `Что значит ${ASPECT_NAMES[a.aspect]} ${GENITIVE[a.first]} и ${GENITIVE[a.second]} в моей натальной карте?`, length: pick % 3 === 0 ? 'short' : 'medium' } : null;
  },
  house: (n, pick) => {
    const key = ['venus', 'mars', 'saturn', 'jupiter', 'mercury'][pick % 5];
    return { question: `${POINT_NAMES[key]} в ${n.planets[key].house} доме в моей натальной карте. Что это значит?`, length: 'short' };
  },
  retro: (n, pick) => {
    const options = SLOW_RETROGRADE.filter((key) => n.planets[key].retrograde);
    return options.length ? { question: `У меня в натальной карте ретроградный ${POINT_NAMES[options[pick % options.length]]}. Это плохо?`, length: pick % 2 ? 'short' : 'medium' } : null;
  },
  saturn: (n) => ({ question: `Я постоянно боюсь не справиться. В моей натальной карте Сатурн ${SIGN_LOCATIVE[n.planets.saturn.sign]}, в ${n.planets.saturn.house} доме. Что с этим делать?`, length: 'medium' }),
  full: () => ({ question: 'Сделайте разбор моей натальной карты', length: 'detailed' }),
  // Added for anna-v5: more everyday questions and the lunar node, with the same rule that every statement must follow the chart.
  partner: () => ({ question: 'Какой партнёр мне подходит по натальной карте?', length: 'medium' }),
  selfworth: () => ({ question: 'Мне трудно поверить в себя. Что в моей натальной карте про это и что с этим делать?', length: 'medium' }),
  anger: () => ({ question: 'Почему я срываюсь на близких? Что в моей натальной карте про это?', length: 'medium' }),
  newstart: () => ({ question: 'Почему мне страшно начинать новое дело? Что в моей натальной карте про это?', length: 'medium' }),
  node: (n) => ({ question: `У меня в натальной карте Северный узел ${SIGN_LOCATIVE[n.planets.node.sign]}, в ${n.planets.node.house} доме. Что это значит?`, length: 'medium' }),
  mc: (n) => ({ question: `MC в моей натальной карте ${SIGN_LOCATIVE[n.angles.mc.sign]}. Что это говорит о моей работе?`, length: 'short' }),
  'venus-sign': (n) => ({ question: `У меня в натальной карте Венера ${SIGN_LOCATIVE[n.planets.venus.sign]}. Как я люблю и чего жду от партнёра?`, length: 'medium' }),
  'mars-sign': (n) => ({ question: `У меня в натальной карте Марс ${SIGN_LOCATIVE[n.planets.mars.sign]}. Как я действую и как злюсь?`, length: 'medium' }),
};
const KIND_ORDER = ['moon', 'love', 'sun-asc', 'career', 'aspect', 'saturn', 'house', 'pattern', 'retro', 'money', 'full'];
export const KIND_ORDER_V5 = ['partner', 'selfworth', 'node', 'anger', 'venus-sign', 'newstart', 'mars-sign', 'mc', 'moon', 'aspect', 'saturn', 'sun-asc', 'career', 'full', 'retro', 'money'];

// A reproducible plan: `train` charts with two questions each and `eval` charts with one, none shared.
export function buildPlan({ train = 50, evalCharts = 12, seed = 20261022, order = KIND_ORDER, idPrefix = 'n', avoid = new Set() } = {}) {
  const random = seeded(seed);
  const plan = [];
  const seen = new Set();
  const total = train + evalCharts;
  for (let index = 0; index < total; index++) {
    let chartFor;
    do {
      const year = 1962 + Math.floor(random() * 43);
      const day = new Date(Date.UTC(year, 0, 1) + Math.floor(random() * 365) * 86_400_000);
      day.setUTCHours(Math.floor(random() * 24), Math.floor(random() * 4) * 15);
      const [latitude, longitude] = PLACES[Math.floor(random() * PLACES.length)];
      chartFor = { birthUtc: day.toISOString(), latitude, longitude };
    } while (seen.has(chartFor.birthUtc) || avoid.has(chartFor.birthUtc));
    seen.add(chartFor.birthUtc);
    const natal = natalChart(chartFor);
    const isEval = index >= train;
    const wanted = isEval ? 1 : 2;
    let made = 0;
    for (let offset = 0; made < wanted && offset < order.length; offset++) {
      const kind = order[(index * 2 + made + offset) % order.length];
      if (plan.some((row) => row.chartIndex === index && row.kind === kind)) continue;
      const item = KINDS[kind](natal, index + made);
      if (!item) continue;
      made++;
      plan.push({ id: `${idPrefix}${isEval ? 'e' : 't'}-${String(index + 1).padStart(2, '0')}-${kind}`, chartIndex: index, split: isEval ? 'eval' : 'train', kind, chartFor, ...item });
    }
  }
  return plan;
}

const locativeRegex = Object.values(SIGN_LOCATIVE).map((text) => text.replace(/^(в|во) /, '')).join('|');
const nominativeRegex = Object.values(POINT_NAMES).join('|');
const genitiveRegex = Object.values(GENITIVE).join('|');
const ASPECT_WORD = { соединение: 'conjunction', секстиль: 'sextile', квадрат: 'square', трин: 'trine', оппозиция: 'opposition' };

// Statements about the chart that can be checked against the calculation; everything else is the writer's interpretation.
export function chartClaimProblems(answer, natal) {
  const problems = [];
  const text = answer.replace(/\s+/g, ' ');
  const shown = natal.aspects.slice(0, 12);
  // "Луна в Раке" / "Луна у вас в Раке"
  for (const match of text.matchAll(new RegExp(`(${nominativeRegex})(?: у вас| у вас стоит| стоит)? (?:в|во) (${locativeRegex})(?![а-яё])`, 'g'))) {
    const key = NOMINATIVE_TO_KEY[match[1]];
    const sign = LOCATIVE_TO_SIGN[match[2]];
    const actual = key === 'asc' ? natal.angles?.asc.sign : key === 'mc' ? natal.angles?.mc.sign : natal.planets[key]?.sign;
    if (actual && actual !== sign) problems.push(`${match[1]} в карте ${actual}, в ответе ${sign}`);
  }
  // "Венера в 7 доме"
  for (const match of text.matchAll(new RegExp(`(${nominativeRegex})(?: у вас| стоит)? (?:в|во) (\\d{1,2})(?:-м)? доме`, 'g'))) {
    const key = NOMINATIVE_TO_KEY[match[1]];
    const house = natal.planets[key]?.house;
    if (house && house !== Number(match[2])) problems.push(`${match[1]} в карте в ${house} доме, в ответе в ${match[2]}`);
  }
  // "куспид 2 дома у вас в Скорпионе"
  for (const match of text.matchAll(new RegExp(`куспид (\\d{1,2}) дома[^.]{0,30}? (?:в|во) (${locativeRegex})(?![а-яё])`, 'g'))) {
    const cusp = natal.cusps?.find((item) => item.house === Number(match[1]));
    if (cusp && cusp.sign !== LOCATIVE_TO_SIGN[match[2]]) problems.push(`куспид ${match[1]} дома в карте ${cusp.sign}, в ответе ${LOCATIVE_TO_SIGN[match[2]]}`);
  }
  // "квадрат Луны и Сатурна"
  for (const match of text.matchAll(new RegExp(`(соединение|секстиль|квадрат|трин|оппозиция) (${genitiveRegex}) и (${genitiveRegex})`, 'g'))) {
    const [a, b] = [GENITIVE_TO_KEY[match[2]], GENITIVE_TO_KEY[match[3]]];
    const found = shown.some((item) => item.aspect === ASPECT_WORD[match[1]] && ((item.first === a && item.second === b) || (item.first === b && item.second === a)));
    if (!found) problems.push(`в карте нет аспекта «${match[1]} ${match[2]} и ${match[3]}»`);
  }
  // "ретроградный Сатурн"
  for (const match of text.matchAll(new RegExp(`ретроградн\\S* (${nominativeRegex})`, 'g'))) {
    const key = NOMINATIVE_TO_KEY[match[1]];
    if (natal.planets[key] && !natal.planets[key].retrograde) problems.push(`${match[1]} в карте не ретроградный`);
  }
  return problems;
}

export { PLANET_KEYS, SIGNS };
