import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalSolarSignQuestion, groundingQuestion } from '../server/chat-topics.js';
import { chartContext } from '../server/chat-grounding.js';
import { personalSolarSignAnswer, wrongCalculatedClaim, groundedNatalAnswer } from '../server/chart-answer-check.js';
import { astroFactProblems } from '../server/astro-fact-guard.js';
const profile = { birthUtc:'1990-05-15T09:30:00Z', birthTime:'12:30', birthLatitude:55.75, birthLongitude:37.62 };
const history = [{role:'user',content:'Какие у меня сильные стороны?'},{role:'assistant',content:'Старый ответ о сильных сторонах.'}];
test('own solar questions use saved calculated Sun and stand apart from earlier strengths', () => {
 for (const message of ['Кто я по гороскопу?', 'Какой у меня знак зодиака?', 'Какой у меня солнечный знак?', 'Я спрашиваю только знак зодиака. Назови его']) {
  assert.equal(personalSolarSignQuestion(message),true,message);
  assert.equal(groundingQuestion(message,history),message);
  const chart = chartContext(profile,message,new Date(),{history}).chart;
  assert.equal(chart.calculated.positions.sun.sign,'Телец');
  assert.match(personalSolarSignAnswer(chart),/^Твой знак зодиака — Телец/u);
 }
 for (const message of ['Что такое солнечный знак?', 'Какой мой лунный знак?', 'Что означает мой асцендент?']) assert.equal(personalSolarSignQuestion(message),false,message);
 assert.match(groundingQuestion('Объясни подробнее',history),/Какие у меня сильные стороны/u);
});
test('solar answers request missing data and acknowledge unknown birth time at ingress', () => {
 assert.match(personalSolarSignAnswer(chartContext(null,'Кто я по гороскопу?').chart),/заполни дату и место/u);
 const boundary = chartContext({...profile,birthUtc:'1990-04-20T12:00:00Z',birthTime:null},'Какой мой солнечный знак?').chart;
 assert.equal(boundary.solarSignUncertain,true);
 assert.match(personalSolarSignAnswer(boundary),/нельзя уверенно назвать/u);
 const stable = chartContext({...profile,birthTime:null},'Какой мой солнечный знак?').chart;
 assert.equal(stable.solarSignUncertain,false);
 assert.match(personalSolarSignAnswer(stable),/Телец/u);
});
test('own sign paraphrases are checked without confusing an explicit ascendant', () => {
 const chart = chartContext(profile,'Кто я по гороскопу?').chart;
 for (const answer of ['Ты Рак по знаку Солнца.', 'Твой знак зодиака — Рак.', 'У тебя солнечный знак — Рак.']) assert.equal(wrongCalculatedClaim(answer,chart),true,answer);
 assert.equal(wrongCalculatedClaim('Ты Рак по асценденту.',chart),false);
});
test('main chart emphasis does not assert a sign ruler; actual roles remain validated locally', () => {
 for(const answer of ['Главное — Солнце в Тельце в 11 доме.', 'Главное — Солнце и Венера в Деве в 7 доме.', 'Основное — Солнце в Тельце.']) assert.deepEqual(astroFactProblems(answer),[],answer);
 const problems = astroFactProblems('У Козерога главный управитель — Уран.');
 assert.equal(problems[0].code,'incorrect_ruler_Козерог');
 assert.match(problems[0].correction,/Козерог: главный управитель — Сатурн/u);
 assert.doesNotMatch(problems[0].correction,/Овен|Телец|Рыбы/u);
});
test('bounded observed Sun dignity assertion is corrected without rejecting its denial or quote', () => {
 assert.ok(astroFactProblems('Солнце в Весах во втором доме стоит в своём знаке.').some(p=>p.code==='sun_domicile'));
 assert.ok(astroFactProblems('Солнце в Деве находится в обители.').some(p=>p.code==='sun_domicile'));
 for(const text of ['Солнце во Льве стоит в своём знаке.','Солнце в Весах не стоит в своём знаке.','Солнце в Весах, а Луна в Раке находится в своём знаке.','«Солнце в Весах стоит в своём знаке» — неверная фраза.'])assert.equal(astroFactProblems(text).some(p=>p.code==='sun_domicile'),false,text);
 for(const text of ['Солнце в Весах находится в обители Венеры.','Солнце в Овне находится в обители Марса.'])assert.equal(astroFactProblems(text).some(p=>p.code==='sun_domicile'),false,text);
 assert.equal(astroFactProblems('Солнце в Тельце стоит в обители.')[0].code,'sun_domicile');
 for (const answer of ['Солнце в Тельце не стоит в обители.', '«Солнце в Тельце стоит в обители» — ошибка.', 'Солнце во Льве стоит в обители.']) assert.deepEqual(astroFactProblems(answer),[],answer);
});
test('strengths and support fallback answer the practical topic without diagnosing from planets', () => {
 const chart = chartContext(profile,'Какие мои сильные стороны?').chart;
 const strengths = groundedNatalAnswer(chart,'Какие мои сильные стороны?');
 assert.match(strengths,/доводить дело до осязаемого результата/u);
 assert.match(strengths,/два случая/u);
 assert.equal(wrongCalculatedClaim(strengths,chart),false);
 const support = groundedNatalAnswer(chart,'Как мне восстановиться после работы?');
 assert.match(support,/убрать одну необязательную задачу/u);
 assert.match(support,/Причину тревоги или усталости по карте установить нельзя/u);
});

test('generic practical follow-ups retain the last independent topic across multiple turns', () => {
 const income = 'Какие занятия помогут мне увеличить доход?';
 const budget = 'Как мне перестать тратить все деньги и начать копить?';
 const recent = [
  {role:'user',content:income}, {role:'assistant',content:'Направления заработка.'},
  {role:'user',content:budget}, {role:'assistant',content:'Начни с бюджета.'},
  {role:'user',content:'С чего начать?'}, {role:'assistant',content:'Запиши расходы.'},
 ];
 for (const message of ['Что именно сделать сначала?', 'С чего начать?', 'А конкретнее?', 'Дай пример', 'Можно пример', 'Подробнее']) {
  assert.equal(groundingQuestion(message,recent),`${budget}\nУточнение: ${message}`);
 }
 // Even a truncated six-message history must use the surviving independent user
 // question, not the assistant's words or the earlier dependent clarification.
 const chain = [...recent.slice(2), {role:'user',content:'А конкретнее?'}, {role:'assistant',content:'Пример записи.'}];
 assert.equal(chain.length,6);
 assert.equal(groundingQuestion('Подробнее',chain),`${budget}\nУточнение: Подробнее`);
 for (const message of ['С чего начать изучение астрологии?', 'Дай пример квадратуры Луны и Марса.', 'Какой у меня солнечный знак?', 'Что именно сделать с отношениями?']) assert.equal(groundingQuestion(message,recent),message);
 assert.equal(groundingQuestion('А конкретнее?',[]),'А конкретнее?');
});
