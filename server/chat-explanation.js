import style from '../config/chat-explanation.json' with {type:'json'};
import {POINT_NAMES} from './astro-chart.js';
import {asksAboutMoney} from './anna-method.js';

const PLANET_FORMS = {sun:'Солнц',moon:'Лун',mercury:'Меркур',venus:'Венер',mars:'Марс',jupiter:'Юпитер',saturn:'Сатурн',uranus:'Уран',neptune:'Нептун',pluto:'Плутон'};

function moneyRulers(chart, message) {
  if (!chart?.money || chart.partner || !asksAboutMoney(message)) return [];
  return chart.calculated?.houseRulers?.find(item => item.house === 2)?.rulers ?? [];
}

export function explanationGuidance(message, chart, mode) {
  if (mode === 'tarot') return '';
  const rulers = moneyRulers(chart, message);
  const facts = rulers.map(r => `${POINT_NAMES[r.planet]} стоит в ${r.house} доме`).join('; ');
  return '\n' + style.instructions.join(' ') + (facts ? `\nПроверенные управители денежного дома для этого ответа: ${facts}.` : '');
}

// Completeness of an explanation, separate from factual correctness and model quality metrics.
export function incompleteMoneyExplanation(answer, chart, message, length) {
  const rulers = moneyRulers(chart, message);
  if (rulers.length < 2) return false;
  // Bind each name to its own house in the same clause. A stray mention of the Sun's
  // character elsewhere must not count as explaining its role in the money question.
  const mentioned = rulers.filter(r => new RegExp(`${PLANET_FORMS[r.planet]}\\p{L}*[^.!?;\\n]{0,90}?(?:в|во)\\s+${r.house}(?:-?(?:м|ом))?\\s+доме`,'iu').test(answer));
  if (length === 'short') return mentioned.length === 0 || (mentioned.length < rulers.length && !/один из|одна из|несколько управител/iu.test(answer));
  return mentioned.length < rulers.length;
}

export function calculatedMoneyExplanation(chart, message, length) {
  const rulers = moneyRulers(chart, message);
  const topics = [...new Set(rulers.map(r => style.moneyTopics[r.house]).filter(Boolean))];
  const facts = rulers.map((r,i) => `${i === 0 ? 'Один из управителей денежного дома' : 'Другой управитель'} — ${POINT_NAMES[r.planet]} — стоит в ${r.house} доме.`);
  const intro = topics.length ? `Возможные темы заработка по твоей карте: ${topics.join('; ')}.` : 'В денежной теме твоей карты несколько показателей.';
  return `${intro} ${facts.slice(0,length === 'short' ? 1 : undefined).join(' ')}`;
}
