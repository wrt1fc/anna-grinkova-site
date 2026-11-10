import style from '../config/chat-explanation.json' with {type:'json'};
import {POINT_NAMES} from './astro-chart.js';
import {asksAboutMoney} from './anna-method.js';
import {assertedNatalText} from './chart-answer-check.js';

const PLANET_FORMS = {sun:'Солнц',moon:'Лун',mercury:'Меркур',venus:'Венер',mars:'Марс',jupiter:'Юпитер',saturn:'Сатурн',uranus:'Уран',neptune:'Нептун',pluto:'Плутон'};
const PLANET = `(?:${Object.values(PLANET_FORMS).join('|')})\\p{L}*`;
const HOUSE_WORDS = {первом:1,втором:2,третьем:3,четвертом:4,четвёртом:4,пятом:5,шестом:6,седьмом:7,восьмом:8,девятом:9,десятом:10,одиннадцатом:11,двенадцатом:12};

function rulerPlacements(answer) {
  const claims = [];
  for (const clause of assertedNatalText(answer).split(/[.!?;\n]/u)) {
    if (/транзит|дирекц|прогресс/iu.test(clause)) continue;
    const names = [...clause.matchAll(new RegExp(PLANET,'giu'))];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      // Never borrow a house from the next planet in the same sentence.
      const tail = clause.slice(name.index + name[0].length, names[i + 1]?.index);
      const houses = [...tail.matchAll(/(?:в|во)\s+(\d{1,2}(?:-?(?:м|ом))?|первом|втором|третьем|четв[её]ртом|пятом|шестом|седьмом|восьмом|девятом|десятом|одиннадцатом|двенадцатом)\s+доме/giu)];
      const planet = Object.keys(PLANET_FORMS).find(key => name[0].toLowerCase().startsWith(PLANET_FORMS[key].toLowerCase()));
      for (const house of houses) {
        if (/(?:^|\s)не\s*$/iu.test(tail.slice(0,house.index))) continue;
        claims.push({planet, house:HOUSE_WORDS[house[1].toLowerCase()] ?? parseInt(house[1],10)});
      }
    }
  }
  return claims;
}

function moneyRulers(chart, message) {
  if (!chart?.money || chart.partner || !asksAboutMoney(message)) return [];
  return chart.calculated?.houseRulers?.find(item => item.house === 2)?.rulers ?? [];
}

// Subject house, rather than the house of a planet just named in a placement.
const lastTopicHouse = text => [...text.matchAll(/(?:у|для|про)\s+(\d{1,2})(?:-?(?:го|й|м|х))?\s+дом/giu)].at(-1)?.[1];

export function explanationGuidance(message, chart, mode) {
  if (mode === 'tarot') return '';
  const rulers = moneyRulers(chart, message);
  const facts = rulers.map(r => `${POINT_NAMES[r.planet]} стоит в ${r.house} доме`).join('; ');
  return '\n' + style.instructions.join(' ') + (facts ? `\nПроверенные управители денежного дома для этого ответа: ${facts}.` : '');
}

export function wrongMoneyRulerClaim(answer, chart, message) {
  const rulers = moneyRulers(chart, message);
  if (!rulers.length) return false;
  const asserted = assertedNatalText(answer);
  if (rulers.length === 1) {
    const extraRuler = /(?:(?:друг(?:ой|ие)|втор(?:ой|ые)|ещ[её]\s+один)\s+управител|(?:два|двое|несколько)\s+управител|один\s+из\s+управител)\p{L}*(?:\s+(\d{1,2})(?:-?го)?\s+дома)?/giu;
    for (const claim of asserted.matchAll(extraRuler)) {
      const context = lastTopicHouse(asserted.slice(0,claim.index));
      if (!claim[1] && context && Number(context) !== 2 && !/денежного\s+дома/iu.test(asserted.slice(claim.index,claim.index+90).split(/[.!?]/u)[0])) continue;
      if (!claim[1] || Number(claim[1]) === 2) return true;
    }
  }
  // Also catches repeating the sole ruler in a second, contradictory house.
  if (rulerPlacements(asserted).some(claim => rulers.some(r => r.planet === claim.planet) && !rulers.some(r => r.planet === claim.planet && r.house === claim.house))) return true;
  for (const m of asserted.matchAll(new RegExp(`управител\\p{L}*(?:\\s+денежного\\s+дома)?\\s*[—–:,-]?\\s*(${PLANET})`,'giu'))) {
    const before = asserted.slice(0,m.index);
    const explicitMoney = /управител\p{L}*\s+денежного\s+дома/iu.test(m[0]);
    const lastHouse = lastTopicHouse(before);
    if (!explicitMoney && lastHouse && Number(lastHouse) !== 2) continue;
    if (!rulers.some(r => new RegExp(`^${PLANET_FORMS[r.planet]}`,'iu').test(m[1]))) return true;
  }
  return false;
}

// Completeness of an explanation, separate from factual correctness and model quality metrics.
export function incompleteMoneyExplanation(answer, chart, message, length) {
  const rulers = moneyRulers(chart, message);
  if (rulers.length < 2) return false;
  // Bind each name to its own house in the same clause. A stray mention of the Sun's
  // character elsewhere must not count as explaining its role in the money question.
  const placements = rulerPlacements(answer);
  const mentioned = rulers.filter(r => placements.some(p => p.planet === r.planet && p.house === r.house));
  if (length === 'short') return mentioned.length === 0 || (mentioned.length < rulers.length && !/один из|одна из|несколько управител/iu.test(answer));
  return mentioned.length < rulers.length;
}

export function calculatedMoneyExplanation(chart, message, length) {
  const rulers = moneyRulers(chart, message);
  const topics = [...new Set(rulers.map(r => style.moneyTopics[r.house]).filter(Boolean))];
  const facts = rulers.map((r,i) => `${rulers.length === 1 ? 'Управитель денежного дома' : i === 0 ? 'Один из управителей денежного дома' : 'Другой управитель'} — ${POINT_NAMES[r.planet]} — стоит в ${r.house} доме.`);
  const intro = topics.length ? `Возможные темы заработка по твоей карте: ${topics.join('; ')}.` : 'Разберём показатели денежного дома твоей карты.';
  return `${intro} ${facts.slice(0,length === 'short' ? 1 : undefined).join(' ')}`;
}
