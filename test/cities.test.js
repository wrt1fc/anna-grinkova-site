import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCityById, searchCities } from '../server/cities.js';

test('city search accepts Cyrillic aliases and returns coordinates and IANA zone', () => {
  const cities = searchCities('Москва');
  const moscow = cities.find((city) => city.id === 524901);
  assert.ok(moscow);
  assert.equal(moscow.country, 'RU');
  assert.equal(moscow.timeZone, 'Europe/Moscow');
  assert.ok(moscow.latitude > 55 && moscow.latitude < 56);
  assert.equal(getCityById(moscow.id).id, moscow.id);
});

test('city search leaves same-name places distinct and bounds results', () => {
  const places = searchCities('Armavir');
  assert.ok(places.some((city) => city.country === 'RU'));
  assert.ok(places.some((city) => city.country === 'AM'));
  assert.ok(places.length <= 10);
  assert.deepEqual(searchCities('a'), []);
  assert.deepEqual(searchCities('<script>'), []);
  assert.equal(getCityById(999999999), null);
});
