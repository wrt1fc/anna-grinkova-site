import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orbExample,incorrectOrbClaim,orbCorrection} from '../server/theory-numerics.js';
import {astroFactProblems} from '../server/astro-fact-guard.js';
test('angle exercises compute deviations and inclusive limits without guessing missing data',()=>{
  assert.deepEqual(orbExample('Фактический угол 131°, точный 120°, допуск 8°.'),{actual:131,exact:120,limit:8,deviation:11,within:false});
  assert.equal(orbExample('Угол 66°, точный 60°, предел 6°').within,true);
  assert.equal(orbExample('Точный угол 60°, фактический угол 66°, предел 6°').actual,66);
  assert.equal(orbExample('Угол 62,5°, точный 60°, орбис 3°').deviation,2.5);
  assert.equal(orbExample('Какой орбис у трина?'),null);
  assert.equal(orbExample('Точный  угол 60°, предел 6°'),null);
  assert.equal(orbExample('Точный\nугол 60°, предел 6°'),null);
  assert.equal(orbExample('Угол 600°, точный 120°, допуск 8°'),null);
});
test('numeric facts reject wrong arithmetic or conclusion while accepting equivalent wording',()=>{
  const outside=orbExample('Угол 131°, точный 120°, допуск 8°');
  assert.equal(incorrectOrbClaim('Отклонение составляет 9 градусов.',outside),true);
  assert.equal(incorrectOrbClaim('Разница — 11°. Аспект не входит в допуск.',outside),false);
  assert.equal(incorrectOrbClaim('Отклонение равно 11 градусам. Аспект входит в допуск.',outside),true);
  assert.equal(incorrectOrbClaim('«Отклонение равно 9°» — неправильный пример. Разница — 11°.',outside),false);
  assert.equal(incorrectOrbClaim('Разница — 6°. Аспект не входит в допуск.',orbExample('Угол 66°, точный 60°, предел 6°')),true);
  assert.equal(incorrectOrbClaim('Отклонение равно 6 градусам и равно пределу. Поэтому аспект не учитывается.',orbExample('Угол 66°, точный 60°, предел 6°')),true);
  assert.equal(incorrectOrbClaim('Отклонение равно 6 градусам. Неверно, что аспект не входит в допуск.',orbExample('Угол 66°, точный 60°, предел 6°')),false);
  assert.match(orbCorrection(outside),/11°/u);
  assert.ok(astroFactProblems('Отклонение составляет 9 градусов.',{question:'Угол 131°, точный 120°, допуск 8°'}).some(issue=>issue.code==='incorrect_orb_arithmetic'));
});
