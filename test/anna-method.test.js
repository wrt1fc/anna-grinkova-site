import test from 'node:test';
import assert from 'node:assert/strict';
import { natalChart } from '../server/astro-chart.js';
import { houseProperties, secondHouse, elementBalance, financialStrategy, moneyProfile, moneyForPrompt, methodQueries,
  asksAboutMoney } from '../server/anna-method.js';
import { createKnowledge } from '../server/knowledge.js';

// Reference: Chronos «Временная карта» 01.01.2021 00:00 (GMT+3), Moscow 55°45′N 37°36′E, widget «Домарные свойства планет».
const CHRONOS = {
  sun: { rules: [10, 11], house: 4 }, moon: { rules: [10, 11], house: 10 }, mercury: { rules: [12], house: 4 },
  venus: { rules: [1, 2, 9], house: 3 }, mars: { rules: [3, 7, 8], house: 8 }, jupiter: { rules: [6], house: 4 },
  saturn: { rules: [4, 5], house: 4 }, uranus: { rules: [4, 5], house: 8 }, neptune: { rules: [6], house: 6 },
  pluto: { rules: [3, 7, 8], house: 4 },
};
const chart = natalChart({ birthUtc: '2020-12-31T21:00:00Z', latitude: 55.75, longitude: 37.6 });

test('rulership, house and signification match the Chronos table used in the course', () => {
  const properties = houseProperties(chart);
  for (const [planet, expected] of Object.entries(CHRONOS)) {
    assert.deepEqual([...properties[planet].rules].sort((a, b) => a - b), expected.rules, planet);
    assert.equal(properties[planet].house, expected.house, planet);
  }
  assert.deepEqual(properties.venus.signifies, [2, 7]);
});

test('2nd house: cusp sign, both co-rulers and where they stand', () => {
  const second = secondHouse(chart);
  assert.equal(second.sign, 'Весы');
  assert.deepEqual(second.rulers, [{ planet: 'venus', house: 3 }]);
  assert.deepEqual(houseProperties(chart).mars.rules.includes(3), true);
});

test('financial strategy follows the instruction, including the worked tiger example', () => {
  // Sun, Mercury, Venus in Sagittarius, Moon in Leo, Mars in Aquarius, strong Uranus: fire 4, air 2 → tiger.
  assert.equal(financialStrategy({ fire: 4, earth: 0, air: 2, water: 0 }), 'tiger');
  assert.equal(financialStrategy({ fire: 1, earth: 2, air: 1, water: 1 }), 'harmony');
  assert.equal(financialStrategy({ fire: 2, earth: 3, air: 0, water: 0 }), 'lightning');
  assert.equal(financialStrategy({ fire: 0, earth: 1, air: 0, water: 4 }), 'cat');
  assert.equal(financialStrategy({ fire: 1, earth: 4, air: 0, water: 0 }), 'stone');
  // Air-led and tied charts are not described in the instruction.
  assert.equal(financialStrategy({ fire: 1, earth: 0, air: 4, water: 0 }), null);
  assert.equal(financialStrategy({ fire: 2, earth: 0, air: 2, water: 0 }), null);
});

test('elements count personal planets and a strong outer planet adds one point', () => {
  const base = elementBalance(chart);
  assert.equal(Object.values(base).reduce((a, b) => a + b, 0), 5);
  const withUranus = elementBalance(chart, ['uranus', 'sun']);
  assert.equal(withUranus.air, base.air + 1);
  assert.equal(Object.values(withUranus).reduce((a, b) => a + b, 0), 6);
});

test('money summary and material queries use Anna’s wording', () => {
  const money = moneyProfile(chart);
  const lines = moneyForPrompt(money);
  assert.equal(lines.secondHouseCusp, 'Куспид 2 дома в знаке Весы');
  assert.deepEqual(lines.rulers, ['Управитель 2 дома Венера стоит в 3 доме']);
  assert.match(lines.mc, /Рак/);
  assert.ok(methodQueries(money).includes('Управитель 2 дома в 3 доме'));
  const noTime = natalChart({ birthUtc: '1990-03-10T09:00:00Z', latitude: 55.75, longitude: 37.62, timeKnown: false });
  assert.equal(moneyProfile(noTime), null);
  assert.match(moneyForPrompt(null).missing, /время рождения/);
});

test('targeted queries find the exact slide for the chart', () => {
  const knowledge = createKnowledge([
    { text: 'Управитель 2 дома в 3 доме: Больше подходит фриланс, заработок через обучение других людей.', source: 'a' },
    { text: 'Управитель 2 дома в 7 доме: Деньги берутся от партнёров и клиентов.', source: 'b' },
    { text: 'Если 2 дом в знаке Весы: Красота, партнёрство, эстетика в работе.', source: 'c' },
  ]);
  assert.equal(knowledge.search('Управитель 2 дома в 3 доме', { limit: 1 })[0].source, 'a');
  assert.equal(knowledge.search('Если 2 дом в знаке Весы', { limit: 1 })[0].source, 'c');
});

test('money questions are recognised', () => {
  assert.ok(asksAboutMoney('Как мне увеличить доход?'));
  assert.ok(asksAboutMoney('Какая у меня финансовая стратегия?'));
  assert.ok(asksAboutMoney('Откуда мне лучше зарабатывать?'));
  assert.equal(asksAboutMoney('Почему я срываюсь на близких?'), false);
});
