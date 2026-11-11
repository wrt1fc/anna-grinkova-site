import {chatIntent, requestedStepCount} from './chat-intent.js';
import {asksAboutMoney} from './anna-method.js';
import {POINT_NAMES} from './astro-chart.js';

// Prompt projection only. The original full calculation remains available to validators.
// Explicit multi-topic questions keep the complete chart.
export function focusedChart(chart, question) {
  if (chatIntent(question) !== 'income' || requestedStepCount(question) || !chart?.money || chart.partner || !asksAboutMoney(question)
      || !/деньг|денеж|доход|зараб|зарплат|накоп|копить|трат|финанс/iu.test(question)
      || /отношени|партн[её]р|совместим|професси|карьер|призвани|предназначени|\bmc\b|10(?:-?(?:й|го))?\s+дом|всю карт|всей карт|полный разбор|стратеги|стихи|аспект|транзит|дирекц/iu.test(question)) return chart;
  const second = chart.calculated?.houseRulers?.find(row => row.house === 2);
  if (!second?.rulers.length) return chart;
  const keys = new Set(second.rulers.map(row => row.planet));
  const names = [...keys].map(key => POINT_NAMES[key]);
  return {
    houseSystem: chart.houseSystem,
    planets: chart.planets?.filter(line => names.some(name => line.startsWith(name+' '))),
    houses: chart.houses?.filter(row => row.house === 2),
    houseRulers: chart.houseRulers?.filter(line => /^2 дом /u.test(line)),
    money: {
      secondHouseCusp: chart.money.secondHouseCusp,
      rulerCount: second.rulers.length,
      rulers: second.rulers.map(row => ({planet: POINT_NAMES[row.planet], house: row.house})),
      source: chart.money.source,
    },
  };
}
