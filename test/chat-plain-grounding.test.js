import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatSuggestions} from '../server/chat-suggestions.js';
import {chartContext} from '../server/chat-grounding.js';
import {asksAboutMoney} from '../server/anna-method.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';

const profile={birthUtc:'1991-02-17T06:35:00Z',birthTime:'09:35',birthLatitude:55.75,birthLongitude:37.62};
test('every plain natal suggestion still carries the selected calculated chart', () => {
  for (const profileId of [null,3]) {
    const questions=new Set();
    for (let i=0;i<40;i++) {
      const data=chatSuggestions({userId:1,profileId,profile,now:new Date(Date.UTC(2026,10,9+i))});
      questions.add(data.dailyQuestion.text);
      for (const group of data.groups) for(const question of group.questions)questions.add(question);
    }
    for(const question of questions) assert.ok(chartContext(profile,question).chart?.calculated,question);
  }
});

test('everyday follow-ups keep their personal topic without confusing rest with income', () => {
  for(const question of ['Почему мне сложно говорить о своих желаниях?','Как мне проще договариваться с людьми?','Как мне справляться с раздражением?','Как мне восстановить силы после работы?']) {
    const context=chartContext(profile,question);
    assert.ok(context.chart?.calculated,question);
    assert.equal(context.chart.money,undefined,question);
  }
  assert.equal(asksAboutMoney('Как мне восстановить силы после работы?'),false);
  assert.equal(asksAboutMoney('Как увеличить доход после смены работы?'),true);
});

test('a clarification preserves an inherited natal suggestion without matching unrelated new questions', () => {
  const question='Какой способ учиться мне ближе?';
  const history=[{role:'user',content:question},{role:'assistant',content:'Обсудим подход к обучению.'}];
  assert.ok(chartContext(profile,'Подробнее',new Date(),{history}).chart?.calculated);
  assert.equal(chartContext(profile,'Напиши рецепт супа',new Date(),{history}).chart,null);
});

test('comma-delimited co-ruler claims cannot introduce an uncalculated planet', () => {
  const context=chartContext(profile,'Как мне зарабатывать?').chart;
  assert.equal(wrongCalculatedClaim('Один из управителей 2 дома, Сатурн, стоит в 11 доме.',context),true);
  assert.equal(wrongCalculatedClaim('Управитель денежного дома — Сатурн — стоит в 11 доме.',context),true);
  assert.equal(wrongCalculatedClaim('Управитель 2 дома, Меркурий, стоит в 11 доме.',context),false);
});
