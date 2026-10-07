import test from 'node:test';
import assert from 'node:assert/strict';
import { natalChart, directions, transitsToNatal, chartForPrompt, asksAboutChart, chartSectionsFor, houseOf } from '../server/astro-chart.js';

// Reference: Sotis Online, chart 07.10.2026 21:18:14 (+03:00), Санкт-Петербург 59N56′19 30E18′51, Placidus.
const SOTIS = {
  planets: { sun: [194, 29, 56], moon: [158, 46, 25], mercury: [219, 6, 12], venus: [218, 5, 59], mars: [125, 34, 58],
    jupiter: [140, 46, 8], saturn: [11, 2, 49], uranus: [65, 23, 44], neptune: [2, 40, 37], pluto: [303, 5, 6] },
  retrograde: ['venus', 'saturn', 'uranus', 'neptune', 'pluto'],
  node: [329, 6, 15], lilith: [272, 34, 26],
  cusps: [[98, 16, 1], [109, 17, 56], [121, 48, 57], [138, 51, 18], [167, 22, 55], [223, 17, 9]],
};
const deg = ([d, m, s]) => d + m / 60 + s / 3600;
const diff = (a, b) => { const x = Math.abs(a - b) % 360; return Math.min(x, 360 - x); };
const chart = natalChart({ birthUtc: '2026-10-07T18:18:14Z', latitude: 59 + 56 / 60 + 19 / 3600, longitude: 30 + 18 / 60 + 51 / 3600 });

test('planet positions and retrograde flags match Sotis within an arc minute', () => {
  for (const [name, reference] of Object.entries(SOTIS.planets)) {
    assert.ok(diff(chart.planets[name].longitude, deg(reference)) < 1 / 60, `${name}: ${chart.planets[name].longitude}`);
    assert.equal(chart.planets[name].retrograde, SOTIS.retrograde.includes(name), name);
  }
  // Sotis uses the true node and an oscillating Lilith; our analytic approximations stay within a few minutes.
  assert.ok(diff(chart.planets.node.longitude, deg(SOTIS.node)) < 0.15);
  assert.ok(diff(chart.planets.lilith.longitude, deg(SOTIS.lilith)) < 0.25);
});

test('Placidus cusps match Sotis within an arc minute, opposite cusps included', () => {
  SOTIS.cusps.forEach((reference, index) => {
    assert.ok(diff(chart.cusps[index].longitude, deg(reference)) < 1 / 60, `cusp ${index + 1}`);
    assert.ok(diff(chart.cusps[index + 6].longitude, deg(reference) + 180) < 1 / 60, `cusp ${index + 7}`);
  });
  assert.equal(chart.angles.asc.sign, 'Рак');
  assert.equal(chart.angles.mc.sign, 'Водолей');
  assert.equal(chart.planets.saturn.house, 11);
});

test('house lookup wraps around Aries', () => {
  const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
  assert.equal(houseOf(5, cusps), 1);
  assert.equal(houseOf(345, cusps), 12);
  assert.equal(houseOf(20, cusps), 2);
});

test('unknown birth time gives planets and aspects but no houses', () => {
  const noTime = natalChart({ birthUtc: '1990-03-10T09:00:00Z', latitude: 55.75, longitude: 37.62, timeKnown: false });
  assert.equal(noTime.cusps, null);
  assert.equal(noTime.planets.sun.house, undefined);
  assert.ok(noTime.aspects.length > 0);
  assert.match(chartForPrompt(noTime).houseSystem, /неизвестно/);
});

test('solar arc follows the progressed Sun and symbolic direction moves one degree a year', () => {
  const natal = natalChart({ birthUtc: '1990-03-10T07:45:00Z', latitude: 55.75, longitude: 37.62 });
  const at = new Date('2026-10-07T00:00:00Z');
  const solar = directions(natal, at, 'solar-arc');
  const symbolic = directions(natal, at, 'symbolic');
  assert.ok(Math.abs(symbolic.arc - symbolic.ageYears) < 0.01);
  // The Sun moves slightly less than a degree a day in March, so the arc trails age a little.
  assert.ok(solar.arc > 34 && solar.arc < symbolic.arc);
  for (const hit of solar.hits) assert.ok(hit.orb <= 1);
  assert.throws(() => directions(natal, new Date('1980-01-01')), /instant_before_birth/);
});

test('chat summary carries readable positions and only requested sections', () => {
  const natal = natalChart({ birthUtc: '1990-03-10T07:45:00Z', latitude: 55.75, longitude: 37.62 });
  const base = chartForPrompt(natal, new Date('2026-10-07T00:00:00Z'));
  assert.match(base.planets[0], /^Солнце \d+°\d{2}′ Рыбы, \d+ дом/);
  assert.equal(base.transits, undefined);
  const full = chartForPrompt(natal, new Date('2026-10-07T00:00:00Z'), { include: ['natal', 'transits', 'directions'] });
  assert.ok(Array.isArray(full.transits));
  assert.equal(full.directions.method, 'солнечная дуга');
  assert.equal(JSON.stringify(full).includes('1990'), false);
  assert.ok(transitsToNatal(natal, new Date('2026-10-07T00:00:00Z')).every((t) => t.orb <= 2));
});

test('chart questions are recognised and pick sections', () => {
  assert.ok(asksAboutChart('Что значит Венера в 7 доме?'));
  assert.ok(asksAboutChart('Какие у меня дирекции в этом году?'));
  assert.ok(asksAboutChart('Расскажите про мою натальную карту'));
  assert.equal(asksAboutChart('Как перестать быть удобной?'), false);
  assert.deepEqual(chartSectionsFor('Какие дирекции в этом году?'), ['natal', 'transits', 'directions']);
  assert.deepEqual(chartSectionsFor('Что значит Луна в Раке?'), ['natal']);
});
