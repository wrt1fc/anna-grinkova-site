import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orbExample,incorrectOrbClaim,orbCorrection} from '../server/theory-numerics.js';
import {astroFactProblems} from '../server/astro-fact-guard.js';

test('boundary aspects accept minimal-angle intervals clipped to zero and 180',()=>{
 const conjunction=orbExample('Угол 2°, орбис соединения 3°');
 const opposition=orbExample('Угол 179°, орбис оппозиции 3°');
 assert.equal(incorrectOrbClaim('Допустимый угол от 0 до 3°. Аспект входит в допуск.',conjunction),false);
 assert.equal(incorrectOrbClaim('Допустимый угол от 177 до 180°. Аспект входит в допуск.',opposition),false);
 assert.equal(incorrectOrbClaim('Допустимый угол от 177 до 183°.',opposition),false);
 assert.equal(incorrectOrbClaim('Допустимый угол от 0 до 4°.',conjunction),true);
 assert.equal(incorrectOrbClaim('Допустимый угол от 178 до 180°.',opposition),true);
});
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

test('one named aspect supplies its canonical angle while the orb remains explicit',()=>{
  assert.deepEqual(orbExample('Угол 94 градуса и орбис квадрата 3 градуса: входит ли в допуск?'),{actual:94,exact:90,limit:3,deviation:4,within:false});
  for(const [name,angle]of [['соединения',0],['секстиля',60],['квадрата',90],['трина',120],['оппозиции',180]])assert.equal(orbExample(`Угол ${angle}°, орбис ${name} 2°`).exact,angle);
  assert.equal(orbExample('Угол 94°, квадрат, орбис 3°').exact,90);
  assert.equal(orbExample('Угол 94°, квадрат, орбис квадрата 3°').exact,90);
  assert.equal(orbExample('Угол 94°, квадрат или трин, орбис 3°'),null);
  assert.equal(orbExample('Угол 94°, квадрат без известного орбиса.'),null);
  assert.equal(orbExample('Угол 94°, точный угол 100°, квадрат или трин, орбис 3°').exact,100);
});

test('short conclusions and explicit angular intervals cannot contradict computed bounds',()=>{
  const outside=orbExample('Угол 94°, орбис квадрата 3°');
  assert.equal(incorrectOrbClaim('Да, входит. Разница 4 градуса, допуск 87–89 градусов; 94 выходит за этот предел.',outside),true);
  assert.equal(incorrectOrbClaim('Да, входит.',outside),true);
  assert.equal(incorrectOrbClaim('Допуск 87–89 градусов. Аспект не входит в допуск.',outside),true);
  assert.equal(incorrectOrbClaim('Допустимый диапазон — от 87 до 93 градусов. Нет, не входит.',outside),false);
  assert.equal(incorrectOrbClaim('«Да, входит» — неверный ответ. Допуск 87–93 градуса.',outside),false);
  assert.equal(incorrectOrbClaim('Если бы допуск 87–89 градусов был верным, получился бы другой ответ.',outside),false);
  assert.equal(incorrectOrbClaim('Неверно, что допуск 87–89 градусов.',outside),false);
  assert.equal(incorrectOrbClaim('Это не допуск 87–89 градусов, а другой интервал.',outside),false);
  assert.equal(incorrectOrbClaim('Неверный допуск 87–89 градусов не используем.',outside),false);
  const inside=orbExample('Угол 92°, орбис квадрата 3°');
  assert.equal(incorrectOrbClaim('Угол выходит за этот предел.',inside),true);
  assert.equal(incorrectOrbClaim('Да, входит. Допуск от 87 до 93 градусов.',inside),false);
});

test('independent worked geometry is checked locally only before an explicit return to the target',()=>{
  const target=orbExample('Угол 94 градуса и орбис квадрата 3 градуса: входит ли в допуск?');
  const illustration='Для трина точный угол 120: при расстоянии 123 отклонение 3°. Если выбран предел 5, этот аспект попадает в допуск. ';
  const correct='Здесь отклонение 4°: 94 и 90. Предел 3; не входит в допуск.';
  assert.equal(incorrectOrbClaim('Орбис — допустимое отклонение. '+illustration+correct,target),false);
  assert.equal(incorrectOrbClaim(illustration+'В нашем случае разница — 4°. Аспект не входит в допуск.',target),false);
  assert.equal(incorrectOrbClaim(illustration+'Здесь разница — 2°. Аспект входит в допуск.',target),true);
  assert.equal(incorrectOrbClaim(illustration+'Здесь разница — 4°. Да, входит.',target),true);
  for(const targetReturn of ['В твоей задаче','В вашей задаче','В нашей задаче','В данной задаче','В исходной задаче','У тебя','У вас']){
    assert.equal(incorrectOrbClaim(illustration+targetReturn+' аспект входит в допуск. '+correct,target),true,targetReturn);
    assert.equal(incorrectOrbClaim(illustration+targetReturn+' разница — 2°. '+correct,target),true,targetReturn);
  }
  assert.equal(incorrectOrbClaim(illustration.replace('этот аспект попадает в допуск.','этот аспект попадает в допуск, а в твоей задаче аспект входит в допуск. ')+correct,target),true);
  assert.equal(incorrectOrbClaim('Да, входит. '+illustration+correct,target),true);
  assert.equal(incorrectOrbClaim(illustration,target),true);
  assert.equal(incorrectOrbClaim(illustration.replace('3°','8°')+correct,target),true);
  assert.equal(incorrectOrbClaim(illustration.replace('попадает','не попадает')+correct,target),true);
  assert.equal(incorrectOrbClaim(illustration.replace('Для трина','Для квадрата')+correct,target),true);
  assert.equal(incorrectOrbClaim('Например, разница — 3°. Здесь разница — 4°. Аспект не входит в допуск.',target),true);
});
