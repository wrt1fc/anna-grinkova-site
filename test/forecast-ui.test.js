import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { personalForecastForDate } from '../server/personal-forecast.js';

test('selecting calendar dates displays each personal reading and reuses its body node', async () => {
  const source = (await readFile(new URL('../prototype/miniapp/screens-info.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  const elements = new Map();
  let inserted = 0;
  function element(id) {
    return { id, textContent: '', children: [], before(item) { elements.set(`#${item.id}`, item); inserted++; } };
  }
  for (const id of ['week-days', 'week-selected-date', 'week-selected-moon', 'week-selected-phase', 'week-selected-action', 'week-selected-question']) {
    elements.set(`#${id}`, element(id));
  }
  const profile = { birthUtc: '1990-03-10T07:45:00Z', birthTime: '10:45', birthLatitude: 55.75, birthLongitude: 37.62 };
  const days = ['2026-11-11', '2026-11-12'].map(day => personalForecastForDate(day, profile, 1));
  const context = vm.createContext({ Intl, Date, $: selector => elements.get(selector), node: () => element(null), days });
  vm.runInContext(`${source}\nactiveWeek = { days }; selectWeekDate(days[0].date);`, context);
  assert.equal(elements.get('#week-selected-body').textContent, days[0].reading.body);
  assert.equal(elements.get('#week-selected-action').textContent, days[0].reading.action);
  vm.runInContext('selectWeekDate(days[1].date);', context);
  assert.equal(elements.get('#week-selected-body').textContent, days[1].reading.body);
  assert.equal(elements.get('#week-selected-question').textContent, days[1].reading.question);
  assert.equal(inserted, 1);
});
