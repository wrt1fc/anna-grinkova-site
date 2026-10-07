// Anna Grinkova's money method from her course «Квантовый скачок PRO», applied to a calculated natal chart:
// rulers with co-rulers, the ruler of the 2nd house and where it stands, MC sign, elements of personal planets
// and the financial strategy. Rules are taken from her instructions; open points are marked, not guessed.
import { SIGNS, POINT_NAMES } from './astro-chart.js';

// Her table: each sign has one or two rulers (modern and traditional).
export const SIGN_RULERS = {
  'Овен': ['mars', 'pluto'], 'Телец': ['venus'], 'Близнецы': ['mercury'], 'Рак': ['moon', 'sun'], 'Лев': ['sun', 'moon'],
  'Дева': ['mercury'], 'Весы': ['venus'], 'Скорпион': ['pluto', 'mars'], 'Стрелец': ['jupiter', 'neptune'],
  'Козерог': ['saturn', 'uranus'], 'Водолей': ['uranus', 'saturn'], 'Рыбы': ['neptune', 'jupiter'],
};
// Natural houses of each planet, as Chronos shows them in «Домарные свойства» used in the course.
export const SIGNIFICATION = { sun: [5, 1], moon: [4, 1], mercury: [3], venus: [2, 7], mars: [8], jupiter: [9, 12],
  saturn: [10], uranus: [11], neptune: [9, 12], pluto: [8] };
const ELEMENT_OF_SIGN = ['fire', 'earth', 'air', 'water'];
const INSTRUMENTAL = { sun: 'Солнцем', moon: 'Луной', mercury: 'Меркурием', venus: 'Венерой', mars: 'Марсом', jupiter: 'Юпитером',
  saturn: 'Сатурном', uranus: 'Ураном', neptune: 'Нептуном', pluto: 'Плутоном' };
// Lecture 1: «негативные аспекты» of the Moon and the Sun and the money practice for each.
const HARD = new Set(['square', 'opposition']);
export const ELEMENT_NAMES = { fire: 'огонь', earth: 'земля', air: 'воздух', water: 'вода' };
const PERSONAL = ['sun', 'moon', 'mercury', 'venus', 'mars'];
// A strong outer planet (Chronos «Сильные объекты») adds one point to its element.
export const STRONG_PLANET_ELEMENT = { uranus: 'air', neptune: 'water', saturn: 'earth', pluto: 'water', jupiter: 'fire' };
export const STRATEGIES = {
  harmony: 'гармония', lightning: 'молния', cat: 'котик', stone: 'камень', tiger: 'тигр',
};

const elementOf = (sign) => ELEMENT_OF_SIGN[SIGNS.indexOf(sign) % 4];

// For every planet: houses it rules (by cusp sign), the house it stands in and its natural houses.
export function houseProperties(natal) {
  if (!natal.cusps) return null;
  const result = {};
  for (const planet of Object.keys(SIGNIFICATION)) {
    const rules = natal.cusps.filter((cusp) => SIGN_RULERS[cusp.sign].includes(planet)).map((cusp) => cusp.house);
    result[planet] = { rules, house: natal.planets[planet].house, signifies: SIGNIFICATION[planet] };
  }
  return result;
}

export function secondHouse(natal) {
  if (!natal.cusps) return null;
  const sign = natal.cusps[1].sign;
  return {
    sign,
    rulers: SIGN_RULERS[sign].map((planet) => ({ planet, house: natal.planets[planet].house })),
    planetsInside: Object.entries(natal.planets).filter(([name, p]) => p.house === 2 && SIGNIFICATION[name]).map(([name]) => name),
  };
}

export function elementBalance(natal, strongPlanets = []) {
  const counts = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const planet of PERSONAL) counts[elementOf(natal.planets[planet].sign)] += 1;
  for (const planet of strongPlanets) if (STRONG_PLANET_ELEMENT[planet]) counts[STRONG_PLANET_ELEMENT[planet]] += 1;
  return counts;
}

// Rules from the instruction: all four elements → harmony; much fire and earth → lightning;
// much water → cat; much earth → stone; fire leads → tiger (her worked example). Air-led and tied charts
// are not described, so they return null for Anna to settle.
export function financialStrategy(counts) {
  const present = Object.values(counts).filter((value) => value > 0).length;
  if (present === 4) return 'harmony';
  if (counts.fire >= 2 && counts.earth >= 2) return 'lightning';
  const max = Math.max(...Object.values(counts));
  const leaders = Object.keys(counts).filter((element) => counts[element] === max);
  if (leaders.length !== 1) return null;
  return { water: 'cat', earth: 'stone', fire: 'tiger' }[leaders[0]] ?? null;
}

// Material queries in Anna's own wording, so the search finds the exact slide for this chart.
export function hardLuminaryAspects(natal) {
  return natal.aspects.filter((a) => HARD.has(a.aspect) && (['sun', 'moon'].includes(a.first) || ['sun', 'moon'].includes(a.second)))
    .map((a) => {
      const luminary = a.first === 'moon' || (a.first === 'sun' && a.second !== 'moon') ? a.first : a.second;
      const other = luminary === a.first ? a.second : a.first;
      return INSTRUMENTAL[other] ? { luminary, other, orb: a.orb } : null;
    }).filter(Boolean);
}

export function methodQueries(money) {
  if (!money) return [];
  return [`Если 2 дом в знаке ${money.secondHouse.sign}`,
    ...money.hardAspects.slice(0, 2).map((a) => `${POINT_NAMES[a.luminary]} в негативном аспекте с ${INSTRUMENTAL[a.other]}`),
    ...money.secondHouse.rulers.map((ruler) => `Управитель 2 дома в ${ruler.house} доме`),
    ...money.secondHouse.planetsInside.map((planet) => `${POINT_NAMES[planet]} во 2 доме`),
    ...(money.strategy ? [`${money.strategy} тип стратегия`] : [])];
}

export function moneyProfile(natal, { strongPlanets = [] } = {}) {
  const second = secondHouse(natal);
  if (!second) return null;
  const counts = elementBalance(natal, strongPlanets);
  const strategy = financialStrategy(counts);
  return {
    secondHouse: second,
    mcSign: natal.cusps[9].sign,
    elements: counts,
    strongPlanetsCounted: strongPlanets.length > 0,
    strategy: strategy ? STRATEGIES[strategy] : null,
    hardAspects: hardLuminaryAspects(natal),
  };
}

// Russian lines for the chat prompt.
export function moneyForPrompt(money) {
  if (!money) return { missing: 'Для денежного разбора нужен рассчитанный куспид 2 дома, то есть известное время рождения.' };
  const { secondHouse: second } = money;
  const counts = Object.entries(money.elements).map(([element, value]) => `${ELEMENT_NAMES[element]} ${value}`).join(', ');
  return {
    method: 'методика Анны «Квантовый скачок PRO»: куспид и управитель 2 дома, MC, стихии личных планет',
    secondHouseCusp: `Куспид 2 дома в знаке ${second.sign}`,
    rulers: second.rulers.map((ruler) => `Управитель 2 дома ${POINT_NAMES[ruler.planet]} стоит в ${ruler.house} доме`),
    planetsInSecondHouse: second.planetsInside.map((planet) => POINT_NAMES[planet]),
    mc: `MC (куспид 10 дома) в знаке ${money.mcSign}`,
    elements: `Стихии личных планет: ${counts}${money.strongPlanetsCounted ? ' (с учётом сильных планет)' : ' (без сильных планет из Chronos — они могут добавить по одному баллу стихии)'}`,
    hardAspects: money.hardAspects.map((a) => `${POINT_NAMES[a.luminary]} в негативном аспекте с ${INSTRUMENTAL[a.other]} (орб ${a.orb}°)`),
    strategy: money.strategy ? `Финансовая стратегия: ${money.strategy}` : 'Финансовая стратегия по этим стихиям однозначно не определяется; предложите уточнить на консультации.',
  };
}

const MONEY_TOPIC = /деньг|денеж|финанс|доход|зараб|зарпла|богатств|бизнес|професси|карьер|работ[аеуы]|призвани|предназначени|стратеги|2 дом|втор(ой|ого) дом|\bmc\b|10 дом/i;
export function asksAboutMoney(message) { return MONEY_TOPIC.test(message); }
