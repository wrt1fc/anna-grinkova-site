import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectReplay25, moneyCards25, prepare25} from '../training/prepare-repair-v25.mjs';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';

const source = Array.from({length:931},(_,i)=>({id:`parent-${i}`,family:`parent-family-${i%40}`,split:'train',question:`Прежний вопрос ${i}`,answer:'Проверенное объяснение из прежнего набора.',learning:false,...(i<80?{chartFor:{birthUtc:`1990-01-01T00:00:00Z`,latitude:55.75,longitude:37.62}}:{})}));
test('focused replay keeps all 80 natal teachers, samples other families deterministically and leaves the parent untouched',()=>{
  const before=JSON.stringify(source), replay=selectReplay25(source);
  assert.equal(replay.length,320);
  assert.equal(replay.filter(c=>c.chartFor).length,80);
  assert.deepEqual(replay,selectReplay25([...source].reverse()));
  assert.equal(JSON.stringify(source),before);
  assert.ok(replay.every(c=>c.split==='train'));
});

test('new money explanations are concise, derived from computed charts and separate held-out charts',()=>{
  const {train,eval:heldout}=moneyCards25();
  assert.equal(train.length,96);assert.equal(heldout.length,16);
  const trainCharts=new Set(train.map(c=>c.chartFor.birthUtc));
  assert.ok(heldout.every(c=>!trainCharts.has(c.chartFor.birthUtc)));
  assert.equal(new Set(train.map(c=>c.question)).size,4);
  assert.ok(heldout.every(c=>!train.some(r=>r.question===c.question)));
  for(const c of [...train,...heldout]){
    const chart=chartContext({birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude},c.question).chart;
    assert.ok(chart?.money,c.id);
    assert.equal(wrongCalculatedClaim(c.answer,chart),false,c.id);
    assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
    assert.ok(c.answer.length<=600,c.id);
    assert.doesNotMatch(c.answer,/котик|тигр|Сначала ответь|куспид|гарантиру/iu);
    assert.match(c.answer,/из управителей|Управитель денежного дома/u);
  }
});

test('prepared train preserves development examples while fresh controls never enter training or validation',()=>{
  const development=Array.from({length:246},(_,i)=>({id:`dev-${i}`,family:`dev-family-${i}`,split:'eval',question:`Контроль ${i}`,answer:'Прежний контроль.',learning:false}));
  const prepared=prepare25([...source,...development],[],{train:[],eval:[]});
  assert.equal(prepared.cards.filter(c=>c.split==='train').length,416);
  assert.deepEqual(prepared.cards.filter(c=>c.split==='eval'),development);
  assert.equal(prepared.holdout.length,16);
  assert.ok(prepared.holdout.every(c=>!prepared.cards.some(r=>r.id===c.id||r.family===c.family||r.question===c.question)));
});
