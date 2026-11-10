import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculum26} from '../training/curriculum-v26.mjs';
import {moneyCards26,prepare26} from '../training/prepare-repair-v26.mjs';
import {SIGN_RULERS} from '../server/anna-method.js';
import {POINT_NAMES} from '../server/astro-chart.js';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';

const parent=[
 ...Array.from({length:931},(_,i)=>({id:`parent-${i}`,family:`parent-${i%40}`,split:'train',question:`Старый вопрос ${i}`,answer:'Исходный проверенный ответ.',learning:false,
  ...(i<80?{chartFor:{birthUtc:'1990-01-01T00:00:00Z',latitude:55.75,longitude:37.62}}:{})})),
 ...Array.from({length:246},(_,i)=>({id:`dev-${i}`,family:`dev-${i}`,split:'eval',question:`Прежний контроль ${i}`,answer:'Прежний контрольный ответ.',learning:false})),
];

test('v26 calculates all money facts and balances each cusp sign in train and separate fresh charts',()=>{
 const money=moneyCards26();
 assert.equal(money.train.length,72);assert.equal(money.eval.length,12);
 assert.equal(new Set(money.train.map(c=>c.chartFor.birthUtc)).size,24);
 assert.equal(new Set(money.eval.map(c=>c.chartFor.birthUtc)).size,12);
 assert.equal(new Set(money.train.map(c=>c.question)).size,3);
 for(const sign of Object.keys(SIGN_RULERS)){
  assert.equal(money.train.filter(c=>c.cuspSign===sign).length,6,sign);
  assert.equal(money.eval.filter(c=>c.cuspSign===sign).length,1,sign);
 }
 const trainCharts=new Set(money.train.map(c=>JSON.stringify(c.chartFor)));
 for(const card of [...money.train,...money.eval]){
  const {birthUtc,latitude:birthLatitude,longitude:birthLongitude}=card.chartFor;
  const chart=chartContext({birthUtc,birthLatitude,birthLongitude},card.question).chart;
  const rulers=chart.calculated.houseRulers.find(r=>r.house===2);
  assert.equal(rulers.sign,card.cuspSign);
  assert.equal(card.rulerCount,rulers.rulers.length);
  assert.deepEqual(rulers.rulers.map(r=>r.planet),SIGN_RULERS[card.cuspSign]);
  for(const ruler of rulers.rulers)assert.ok(card.answer.includes(`${POINT_NAMES[ruler.planet]} — стоит в ${ruler.house} доме.`),card.id);
  assert.equal(wrongCalculatedClaim(card.answer,chart),false,card.id);
  assert.deepEqual(learningAnswerProblems(card.answer,card),[],card.id);
  assert.ok(card.answer.length<900);
  assert.ok(card.answer.split(/(?<=[.!?])\s+/u).length>=2);
  assert.ok(card.answer.split(/(?<=[.!?])\s+/u).length<=4);
  assert.match(card.answer,/^Для заработка можно рассмотреть /u);
  if(rulers.rulers.length===1)assert.doesNotMatch(card.answer,/другой|второй|один из/iu);
  else assert.match(card.answer,/Второй управитель/u);
  if(card.split==='eval')assert.equal(trainCharts.has(JSON.stringify(card.chartFor)),false);
 }
 assert.equal(money.train.filter(c=>c.rulerCount===1).length,24);
 assert.equal(money.train.filter(c=>c.rulerCount===2).length,48);
 const sole=money.train.find(c=>c.cuspSign==='Телец');
 assert.ok(learningAnswerProblems(sole.answer+' Другой управитель — Марс.',sole).includes('known false claim'));
});

test('48 new theory teachers and 12 fresh source controls have semantic requirements and valid references',()=>{
 const curriculum=curriculum26();
 assert.equal(curriculum.newTheoryCount,48);
 assert.equal(curriculum.reusedTheoryCount,64);
 assert.equal(curriculum.train.length,112);
 assert.equal(curriculum.eval.length,12);
 for(const card of [...curriculum.train,...curriculum.eval]){
  assert.ok(card.sourceRefs.length,card.id);
  assert.deepEqual(learningAnswerProblems(card.answer,card),[],card.id);
  if(!card.id.includes('replay')){
   assert.ok(card.requiredMeanings.length,card.id);
   assert.ok(learningAnswerProblems('Привет! Это очень интересный вопрос.',card).some(e=>e.startsWith('missing meaning')),card.id);
  }
 }
 const trainQuestions=new Set(curriculum.train.map(c=>c.question));
 assert.ok(curriculum.eval.every(c=>!trainQuestions.has(c.question)));
 assert.ok(curriculum.train.some(c=>/Солнечный знак и асцендент/.test(c.question)));
});

test('equivalent wording does not turn negated facts or opposite conclusions into passing answers',()=>{
 const cards=curriculum26().eval;
 const orb=cards.find(c=>c.id.endsWith('orb-edge'));
 assert.ok(learningAnswerProblems('Отклонение равно 5 градусам и равно пределу. Поэтому аспект не учитывается.',orb).length);
 const relocation=cards.find(c=>c.id.endsWith('relocation'));
 for(const answer of [
  'Релокация сохраняет момент рождения и меняет место расчёта. Дата получения ключей его не заменяет. Геоцентрические аспекты сохраняются, а дома не меняются.',
  'Релокация сохраняет момент рождения и меняет место расчёта. Дата получения ключей его не заменяет. Аспекты не сохраняются, а дома меняются.',
 ])assert.ok(learningAnswerProblems(answer,relocation).length,answer);
 const formula=cards.find(c=>c.id.endsWith('formula'));
 assert.ok(learningAnswerProblems('Порог составляет три повтора. У 5#9 два повтора, у 5#11 тоже два. Разные формулы складывают, поэтому сильная формула уже есть.',formula).length);
});

test('prepare26 preserves v19 development and natal replay, labels exposed regression, leaves inputs immutable',()=>{
 const before=JSON.stringify(parent),exposed=[{id:'old-v25-control',family:'old-control',question:'Ранее использованный контроль',split:'eval'}];
 const prepared=prepare26(parent,exposed);
 assert.equal(prepared.cards.filter(c=>c.split==='train').length,504);
 assert.equal(prepared.replayCount,320);
 assert.equal(prepared.newCount,184);
 assert.equal(prepared.holdout.length,24);
 assert.equal(prepared.cards.filter(c=>c.split==='train'&&c.id.startsWith('parent-')&&c.chartFor).length,80);
 assert.deepEqual(prepared.cards.filter(c=>c.split==='eval'),parent.filter(c=>c.split==='eval'));
 assert.equal(prepared.regression[0].evaluationStatus,'EXPOSED_V25_REGRESSION_NOT_FRESH');
 assert.equal(JSON.stringify(parent),before);
 assert.equal(exposed[0].evaluationStatus,undefined);
 for(const c of prepared.holdout)assert.ok(prepared.cards.every(t=>t.id!==c.id&&t.question!==c.question&&t.family!==c.family));
 assert.throws(()=>prepare26(parent,[...exposed,{id:'leaked-question',question:prepared.holdout[0].question}]),/previously exposed/);
 assert.throws(()=>prepare26(parent.slice(1),[]),/parent train count/);
 const bad=curriculum26();bad.eval[0]={...bad.eval[0],question:bad.train[0].question};
 assert.throws(()=>prepare26(parent,[],bad),/Fresh question leaked/);
 const duplicate=curriculum26();duplicate.eval[0]={...duplicate.eval[0],id:duplicate.train[0].id};
 assert.throws(()=>prepare26(parent,[],duplicate),/Duplicate card ID/);
 const chartCollision=structuredClone(parent);chartCollision[0].chartFor=moneyCards26().eval[0].chartFor;
 assert.throws(()=>prepare26(chartCollision,[]),/duplicates prior chart/);
});
