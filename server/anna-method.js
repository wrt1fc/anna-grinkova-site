// Anna Grinkova's money method from her course «Квантовый скачок PRO», applied to a calculated natal chart:
// rulers with co-rulers, the ruler of the 2nd house and where it stands, MC sign, elements of personal planets
// and the financial strategy. Rules are taken from her instructions; open points are marked, not guessed.
import { SIGNS, POINT_NAMES } from './astro-chart.js';
import {chatIntent} from './chat-intent.js';
import moneyRules from '../config/money-rules.json' with { type: 'json' };

// Her table: each sign has one or two rulers (modern and traditional).
export const SIGN_RULERS = {
  'Овен': ['mars', 'pluto'], 'Телец': ['venus'], 'Близнецы': ['mercury'], 'Рак': ['moon', 'sun'], 'Лев': ['sun', 'moon'],
  'Дева': ['mercury'], 'Весы': ['venus'], 'Скорпион': ['pluto', 'mars'], 'Стрелец': ['jupiter', 'neptune'],
  'Козерог': ['saturn', 'uranus'], 'Водолей': ['uranus', 'saturn'], 'Рыбы': ['neptune', 'jupiter'],
};
export const SIGN_PREPOSITIONAL = { 'Овен': 'Овне', 'Телец': 'Тельце', 'Близнецы': 'Близнецах', 'Рак': 'Раке', 'Лев': 'Льве', 'Дева': 'Деве',
  'Весы': 'Весах', 'Скорпион': 'Скорпионе', 'Стрелец': 'Стрельце', 'Козерог': 'Козероге', 'Водолей': 'Водолее', 'Рыбы': 'Рыбах' };
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

export const elementOf = (sign) => ELEMENT_OF_SIGN[SIGNS.indexOf(sign) % 4];

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

// Rulers of every house (Anna's table, co-rulers included) and where each ruler stands.
// Ground truth for any house question, so the model never guesses rulership from general astrology.
export function houseRulers(natal) {
  if (!natal.cusps) return null;
  return natal.cusps.map((cusp) => ({
    house: cusp.house,
    sign: cusp.sign,
    rulers: SIGN_RULERS[cusp.sign].map((planet) => ({ planet, house: natal.planets[planet].house })),
  }));
}

// House-to-house links («формулы домов»): each ruler standing in a house makes one link A#B.
// Anna's rule: a theme becomes active when the same formula repeats 3 or more times.
export function houseFormulas(natal) {
  const rulers = houseRulers(natal);
  if (!rulers) return null;
  const counts = new Map();
  for (const { house, rulers: rs } of rulers) {
    for (const ruler of rs) {
      if (!ruler.house) continue;
      const key = `${house}#${ruler.house}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const links = [...counts.entries()].map(([formula, count]) => ({ formula, count }));
  return { links, strong: links.filter((link) => link.count >= 3).map((link) => link.formula) };
}

// Compact Russian lines for the chat prompt.
export function houseRulersForPrompt(rulers) {
  return rulers.map(({ house, sign, rulers: rs }) =>
    `${house} дом (${sign}): ${rs.map((ruler) => `${POINT_NAMES[ruler.planet]} в ${ruler.house} доме`).join(' и ')}`);
}

export function formulasForPrompt(formulas) {
  if (!formulas?.links.length) return null;
  return {
    links: `Формулы домов (дом → дом, где стоит его управитель): ${formulas.links.map((link) => (link.count > 1 ? `${link.formula} ×${link.count}` : link.formula)).join(', ')}`,
    strong: formulas.strong.length ? `Повторяются 3+ раза, значит тема активна: ${formulas.strong.join(', ')}` : null,
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
  return [`Если 2 дом в знаке ${money.secondHouse.sign}`, `Если у вас куспид 10 дома в ${SIGN_PREPOSITIONAL[money.mcSign]}`,
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
  const element = moneyRules.elements[elementOf(second.sign)];
  return {
    method: 'методика «Квантовый скачок PRO»: куспид и управитель 2 дома, MC, стихии личных планет',
    // The main answer to «why does money leave at once»: keep or spend by the element of the 2nd house cusp.
    rule: `Куспид 2 дома в ${element.adjective} знаке (${second.sign}): ${element.rule}. Как именно: ${moneyRules.signs[second.sign]}.`,
    planetRules: second.planetsInside.map((planet) => `${POINT_NAMES[planet]} во 2 доме: ${moneyRules.planets[planet]}`),
    source: second.rulers.map((ruler) => `Управитель 2 дома в ${ruler.house} доме: ${moneyRules.rulerHouses[ruler.house]}`).join(' '),
    secondHouseCusp: `Куспид 2 дома в знаке ${second.sign}`,
    // With co-rulers the answer must mention both ("один из управителей…"), never a single "the" ruler.
    rulers: second.rulers.length > 1
      ? [`У 2 дома несколько управителей: ${second.rulers.map((ruler) => `${POINT_NAMES[ruler.planet]} стоит в ${ruler.house} доме`).join('; ')}`]
      : [`Управитель 2 дома ${POINT_NAMES[second.rulers[0].planet]} стоит в ${second.rulers[0].house} доме`],
    planetsInSecondHouse: second.planetsInside.map((planet) => POINT_NAMES[planet]),
    mc: `MC (куспид 10 дома) в знаке ${money.mcSign}`,
    elements: `Стихии личных планет: ${counts}${money.strongPlanetsCounted ? ' (с учётом сильных планет)' : ' (без сильных планет из Chronos — они могут добавить по одному баллу стихии)'}`,
    hardAspects: money.hardAspects.map((a) => `${POINT_NAMES[a.luminary]} в негативном аспекте с ${INSTRUMENTAL[a.other]} (орб ${a.orb}°)`),
    strategy: money.strategy ? `Финансовая стратегия: ${money.strategy}` : 'Финансовая стратегия по этим стихиям однозначно не определяется.',
  };
}

// Context eligibility is broader than an income explanation; completeness is intent-specific.
export function asksAboutMoney(message) {
  return ['income','budget','workfit','growth','promotion'].includes(chatIntent(message));
}

// Houses the question names, by digit («5 дом») or ordinal word («пятый дом»).
const HOUSE_WORDS = { перв: 1, втор: 2, трет: 3, четв: 4, пят: 5, шест: 6, седьм: 7, восьм: 8, девят: 9, десят: 10, одиннадцат: 11, двенадцат: 12 };
export function houseMentions(question) {
  const found = new Set();
  // A shared plural noun applies to every item: «1 и 2 домов», «первого,
  // второго и третьего домов». Do not confuse a planet's placement with a list.
  const item=`(?:\\d{1,2}(?:[-–]?(?:й|ый|го|м|х|ом))?|(?:${Object.keys(HOUSE_WORDS).join('|')})\\p{L}*)`;
  for(const list of question.matchAll(new RegExp(`(${item}(?:\\s*(?:,|и)\\s*${item})+)\\s+дом`,'giu'))){
    for(const token of list[1].matchAll(new RegExp(item,'giu'))){
      const n=/^\d/u.test(token[0])?parseInt(token[0],10):Object.entries(HOUSE_WORDS).find(([stem])=>token[0].toLowerCase().startsWith(stem))?.[1];
      if(n>=1&&n<=12)found.add(n);
    }
  }
  for (const match of question.matchAll(/(\d{1,2})\s*[-–]?(?:й|ый|го|м|х|ом)?\s*дом/giu)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= 12) found.add(n);
  }
  const lower = question.toLowerCase().replaceAll('ё', 'е');
  for (const [stem, n] of Object.entries(HOUSE_WORDS)) {
    if (new RegExp(`${stem.replace('ё', 'е')}\\p{L}*\\s+дом`, 'u').test(lower)) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

// Material queries in Anna's wording for houses the question names, so the search finds the exact
// методичка line («Управитель 5 дома в 9 доме») instead of a generic one.
export function houseQueries(rulers, houses) {
  if (!rulers) return [];
  const queries = houses.flatMap((house) => {
    const entry = rulers.find((item) => item.house === house);
    return entry ? entry.rulers.map((ruler) => `Управитель ${house} дома в ${ruler.house} доме`) : [];
  });
  return [...new Set(queries)];
}
