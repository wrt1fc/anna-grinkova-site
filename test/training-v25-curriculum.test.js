import test from 'node:test';
import assert from 'node:assert/strict';
import {curriculum25} from '../training/curriculum-v25.mjs';
import {curriculum21} from '../training/curriculum-v21.mjs';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {hasFormalAddress} from '../server/chat-style.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

const data=curriculum25();
const rows=[...data.train,...data.eval];

test('v25 keeps fresh evaluation families and questions out of training',()=>{
 assert.equal(data.train.length,64);assert.equal(data.eval.length,16);
 assert.equal(new Set(rows.map(r=>r.id)).size,80);
 assert.equal(new Set(rows.map(r=>r.question)).size,80);
 const old=new Set(curriculum21().map(r=>r.question));
 const families=new Map();
 for(const row of rows){
  assert.equal(old.has(row.question),false,row.id);
  assert.ok(!families.has(row.family)||families.get(row.family)===row.split,row.family);
  families.set(row.family,row.split);
  assert.ok(data[row.split].includes(row));
 }
});

test('v25 editorial teachers satisfy schema, brevity, style and safety checks',()=>{
 for(const row of rows){
  assert.ok(row.id&&row.family&&row.question&&row.answer,row.id);
  assert.equal(typeof row.learning,'boolean');
  assert.ok(['astrology','service','safety'].includes(row.scope));
  assert.ok(Array.isArray(row.history));assert.ok(Array.isArray(row.requiredMeanings));
  assert.equal(row.minAnswerChars,40);assert.equal(row.qualityVersion,19);
  assert.equal(row.status,'draft');assert.equal(row.origin,'synthetic-editorial-draft-not-Anna-approved');
  assert.ok(row.answer.length>=40&&row.answer.length<=500,row.id);
  assert.doesNotMatch(row.answer,/Сначала ответь по делу|котик|тигр|камень|молния|ты сам\b|ты сама\b|\[\[LEARNING_/iu,row.id);
  assert.equal(hasFormalAddress(row.answer),false,row.id);
  assert.equal(!!unsafeChatAnswer(row.answer,'2026-11-09'),false,row.id);
  assert.deepEqual(learningAnswerProblems(row.answer,row),[],row.id);
  if(row.scope!=='astrology')assert.equal(row.learning,false,row.id);
 }
});

test('v25 handles simple follow-ups and boundaries without invented chart positions',()=>{
 const follow=rows.filter(r=>r.family.includes('simplify'));
 assert.ok(follow.length>=4);
 for(const row of follow){assert.match(row.question,/проще|понятнее/iu);assert.notEqual(row.answer,row.history.at(-1).content);}
 const personal=rows.filter(r=>r.family.includes('missing-profile'));
 assert.ok(personal.length>=4);
 for(const row of personal){assert.equal(row.learning,false);assert.match(row.answer,/дат[ау].*врем[яени].*мест[оа]/iu);}
 const identity=rows.filter(r=>r.family.includes('identity'));
 for(const row of identity)assert.match(row.answer,/Я Фортуна, цифровой помощник по астрологии и астропсихологии, не Анна и не живой человек/u);
 const declined=rows.filter(r=>r.family.includes('no-course'));
 assert.ok(declined.length>=3);for(const row of declined)assert.equal(row.learning,false);
 for(const row of rows.filter(r=>r.scope==='safety'))assert.doesNotMatch(row.answer,/\b(?:112|103|911)\b|диагноз|таблет|лечени|😂/iu);
});

test('v25 preserves the nonstandard ruler pairs and the formula threshold',()=>{
 const pairs={leo:['Солнце','Луна'],cancer:['Луна','Солнце'],aries:['Марс','Плутон'],scorpio:['Плутон','Марс'],capricorn:['Сатурн','Уран'],aquarius:['Уран','Сатурн'],sagittarius:['Юпитер','Нептун'],pisces:['Нептун','Юпитер']};
 for(const [sign,[main,co]]of Object.entries(pairs)){
  const teachers=data.train.filter(r=>r.family===`v25-ruler-${sign}`);
  assert.equal(teachers.length,2,sign);
  for(const row of teachers){
   assert.match(row.answer,new RegExp(`главный управитель — ${main}`,'iu'));
   assert.match(row.answer,new RegExp(`соуправитель — ${co}`,'iu'));
   assert.equal(row.learning,true);
  }
 }
 const threshold=data.train.find(r=>r.family==='v25-formula-threshold');
 assert.match(threshold.answer,/тремя или более/iu);
 assert.match(threshold.answer,/Разные связи.*не объединяют/iu);
 const mixed=data.eval.find(r=>r.family==='v25-eval-formula-mixed');
 assert.match(mixed.answer,/одной и той же формулы/iu);
 const orb=data.eval.find(r=>r.family==='v25-eval-orb-numbers');
 assert.match(orb.answer,/3 градуса/iu);assert.match(orb.answer,/не входит/iu);
});
