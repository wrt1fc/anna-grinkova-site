import test from 'node:test';
import assert from 'node:assert/strict';
import {curriculum21} from '../training/curriculum-v21.mjs';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {hasFormalAddress} from '../server/chat-style.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

const rows=curriculum21();
const byQuestion=new Map(rows.map(row=>[row.question,row]));

test('v21 teachers are unique and satisfy their declared quality rubric',()=>{
 assert.equal(rows.length,132);
 assert.equal(byQuestion.size,rows.length);
 for(const row of rows){
  assert.equal(hasFormalAddress(row.answer),false,row.question);
  assert.equal(!!unsafeChatAnswer(row.answer,'2026-11-02'),false,row.question);
  assert.deepEqual(learningAnswerProblems(row.answer,row),[],row.question);
 }
});

test('v21 teaches both rulers and the primary ruler for paired signs',()=>{
 const expectations=[
  ['Управители Льва — Солнце и Плутон?',['Солнце','Луна','Плутон','Скорпион']],
  ['Кто управляет Раком и Скорпионом по методике?',['Луна','Солнце','Плутон','Марс']],
  ['Кто управляет Стрельцом и Рыбами по методике?',['Юпитер','Нептун']],
  ['Кто управляет Козерогом и Водолеем по методике?',['Сатурн','Уран']],
 ];
 for(const [question,parts]of expectations){
  const row=byQuestion.get(question);assert.ok(row,question);
  for(const part of parts)assert.match(row.answer,new RegExp(part,'u'),question);
  assert.match(row.answer,/главн/iu,question);
  assert.match(row.answer,/соуправител/iu,question);
 }
});

test('v21 does not confuse a planet inside a house with its rulers',()=>{
 const row=byQuestion.get('Пятый дом начинается во Льве, внутри стоит Луна. Кто хозяева и что делает Луна?');
 assert.ok(row);
 assert.match(row.answer,/Солнце/u);assert.match(row.answer,/Луна/u);
 assert.match(row.answer,/соуправител/iu);assert.match(row.answer,/участниц/iu);
 assert.doesNotMatch(row.answer,/Луна\s+не\s+(?:является\s+)?(?:управител|хозяин)/iu);
});

test('v21 house formulas include co-rulers and a threshold of three identical repeats',()=>{
 const two=byQuestion.get('У второго дома два управителя: один в седьмом доме, другой в десятом. Сколько формул?');
 assert.ok(two);assert.match(two.answer,/2#7/u);assert.match(two.answer,/2#10/u);assert.match(two.answer,/две формулы/iu);
 const active=byQuestion.get('Когда повторяющаяся формула становится активной темой?');
 assert.ok(active);assert.match(active.answer,/три раза или больше/iu);assert.match(active.answer,/одинаковые формулы/iu);
 const mixed=byQuestion.get('Одна формула 2#7 и две формулы 2#10 — активная тема?');
 assert.ok(mixed);assert.match(mixed.answer,/разные формулы не складываем/iu);assert.match(mixed.answer,/не достигнут/iu);
});
