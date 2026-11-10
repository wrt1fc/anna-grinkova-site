import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {curriculum26} from './curriculum-v26.mjs';
import {selectReplay25} from './prepare-repair-v25.mjs';
import explanation from '../config/chat-explanation.json' with {type:'json'};
import {SIGN_RULERS} from '../server/anna-method.js';
import {POINT_NAMES} from '../server/astro-chart.js';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import {hasFormalAddress} from '../server/chat-style.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const read=path=>fs.readFileSync(path,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const chartKey=c=>JSON.stringify([Date.parse(c.birthUtc),c.latitude,c.longitude]);
let moneyCache;
export function moneyCards26(){
 if(moneyCache)return structuredClone(moneyCache);
 const result={train:[],eval:[]};
 const questions={train:[
  'Какие занятия могут быть связаны с моим заработком по рассчитанной карте?',
  'Объясни денежную тему моей карты простыми словами и назови связанные планеты.',
  'По моей карте какие направления дохода можно рассмотреть, без сложных терминов?',
 ],eval:[
  'Как мой расчёт связывает тему дохода с обычными занятиями? Назови все рассчитанные управители.',
  'Хочу понять денежные возможности: переведи данные моей карты на простой язык.',
  'Какие рабочие занятия связаны с доходом в этом расчёте и какие планеты это показывают?',
  'Опиши по карте возможные темы заработка, пояснив каждую связанную с ними планету.',
  'Что попробовать в работе по моей денежной теме, если опираться только на этот расчёт?',
  'Объясни связь заработка с занятиями в моей карте, сохранив все рассчитанные показатели.',
  'Перескажи мою денежную тему для новичка: занятия, затем планеты и их дома.',
  'Какие темы работы выделены для дохода в моём расчёте? Укажи данные каждой планеты.',
  'Посмотри денежный дом в моих данных: как объяснить его через понятные занятия?',
  'Как можно прочитать мои показатели дохода без перечня непонятных астрологических слов?',
  'Дай житейское пояснение моих денежных показателей и одну короткую привязку к карте.',
  'Какие направления занятости отражает денежная часть моего расчёта? Объясни все связи.',
 ]};
 for(const split of ['train','eval']){
  const limit=split==='train'?2:1,selected=new Map(Object.keys(SIGN_RULERS).map(s=>[s,[]]));
  // Scan real calculated charts; never assign or alter cusp signs to balance examples.
  for(let round=0;round<limit;round++)for(let slot=0;slot<240&&[...selected.values()].some(rows=>rows.length<=round);slot++){
   const birthUtc=new Date(Date.UTC(split==='train'?1987+round*9:2007,split==='train'?3+round*3:8,14+round*3+Math.floor(slot/48),Math.floor((slot%48)/2),(slot%2)*30+7)).toISOString();
   const chartFor={birthUtc,latitude:round===0?48.71:55.03,longitude:round===0?44.51:82.92};
   const chart=chartContext({birthUtc,birthLatitude:chartFor.latitude,birthLongitude:chartFor.longitude},questions[split][0]).chart;
   const money=chart?.calculated?.houseRulers?.find(r=>r.house===2);
   assert.ok(money,'Synthetic chart must have a computed second house');
   const rows=selected.get(money.sign);
   if(rows.length<=round)rows.push({chartFor,chart,money});
  }
  assert.ok([...selected.values()].every(rows=>rows.length===limit),'Could not balance all twelve cusp signs');
  let index=0;
  for(const [sign,rows]of selected)for(const {chartFor,chart,money}of rows){
   const topics=[...new Set(money.rulers.map(r=>explanation.moneyTopics[r.house]))];
   const facts=money.rulers.map((r,j)=>`${money.rulers.length===1?'Управитель денежного дома':j===0?'Один из управителей денежного дома':'Второй управитель денежного дома'} — ${POINT_NAMES[r.planet]} — стоит в ${r.house} доме.`);
   const answer=`Для заработка можно рассмотреть ${topics.join('; ')}. ${facts.join(' ')}`;
   const variants=split==='train'?questions.train:[questions.eval[index]];
   for(const [q,question]of variants.entries()){
    const card={id:`v26-money-${split}-${index}-${q}`,family:`v26-money-${split}-chart-${index}`,split,question,answer,chartFor,
     cuspSign:sign,rulerCount:money.rulers.length,learning:false,scope:'astrology',history:[],length:'medium',qualityVersion:19,minAnswerChars:40,
     status:'draft',origin:'synthetic-editorial-draft-not-Anna-approved',sourceRefs:['server/anna-method.js:SIGN_RULERS','config/chat-explanation.json:moneyTopics'],
     requiredMeanings:money.rulers.flatMap(r=>[[POINT_NAMES[r.planet]],[`${r.house} доме`]]),
     ...(money.rulers.length===1?{forbiddenClaims:['другой управитель','второй управитель','один из управителей']}:{}),
    };
    assert.equal(wrongCalculatedClaim(answer,chart),false,card.id);
    assert.deepEqual(learningAnswerProblems(answer,card),[],card.id);
    assert.equal(hasFormalAddress(answer),false,card.id);
    assert.equal(!!unsafeChatAnswer(answer,'2026-11-10'),false,card.id);
    result[split].push(card);
   }
   index++;
  }
 }
 moneyCache=result;
 return structuredClone(result);
}

export function prepare26(parent,exposed,curriculum=curriculum26()){
 assert.equal(parent.filter(c=>c.split==='train').length,931,'Wrong immutable v19 parent train count');
 assert.equal(parent.filter(c=>c.split==='eval').length,246,'Wrong v19 development count');
 const money=moneyCards26(),replay=selectReplay25(parent,320);
 const cards=[...replay,...curriculum.train,...money.train,...parent.filter(c=>c.split==='eval')];
 const holdout=[...curriculum.eval,...money.eval];
 const regression=exposed.map(c=>({...c,evaluationStatus:'EXPOSED_V25_REGRESSION_NOT_FRESH'}));
 const all=[...cards,...holdout];
 assert.equal(new Set(all.map(c=>c.id)).size,all.length,'Duplicate card ID');
 assert.equal(new Set(regression.map(c=>c.id)).size,regression.length,'Duplicate exposed regression ID');
 const activeIds=new Set(all.map(c=>c.id));
 assert.ok(regression.every(c=>!activeIds.has(c.id)),'Exposed regression ID collides with candidate data');
 const trainedQuestions=new Set(cards.map(c=>c.question)),priorQuestions=new Set([...parent,...exposed].map(c=>c.question));
 const trainedFamilies=new Set(cards.map(c=>c.family));
 const exposedFamilies=new Set(exposed.map(c=>c.family).filter(Boolean));
 assert.equal(new Set(holdout.map(c=>c.question)).size,holdout.length,'Duplicate fresh question');
 for(const c of holdout){
  assert.equal(trainedQuestions.has(c.question),false,'Fresh question leaked into train/dev: '+c.question);
  assert.equal(priorQuestions.has(c.question),false,'Fresh control previously exposed: '+c.question);
  assert.equal(trainedFamilies.has(c.family),false,'Fresh family leaked: '+c.family);
  assert.equal(exposedFamilies.has(c.family),false,'Fresh family previously exposed: '+c.family);
 }
 const priorCharts=new Set([...parent,...exposed].filter(c=>c.chartFor).map(c=>chartKey(c.chartFor)));
 const trainCharts=new Set(money.train.map(c=>chartKey(c.chartFor)));
 assert.ok([...money.train,...money.eval].every(c=>!priorCharts.has(chartKey(c.chartFor))),'New money chart duplicates prior chart');
 assert.ok(money.eval.every(c=>!trainCharts.has(chartKey(c.chartFor))),'Fresh chart overlaps training');
 for(const c of [...curriculum.train,...curriculum.eval])assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
 return {cards,holdout,regression,replayCount:replay.length,newCount:curriculum.train.length+money.train.length,
  theoryNew:curriculum.newTheoryCount??curriculum.train.length,theoryReused:curriculum.reusedTheoryCount??0,
  moneyTrain:money.train.length,moneyFresh:money.eval.length};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [source,exposed,out]=process.argv.slice(2);
 if(!source||!exposed||!out||fs.existsSync(out))throw Error('Expected immutable v19 cards, exposed v25 controls and NEW output directory');
 const result=prepare26(read(source),read(exposed));
 fs.mkdirSync(out,{recursive:true});
 for(const name of ['cards','holdout','regression'])fs.writeFileSync(join(out,name+'.jsonl'),result[name].map(c=>JSON.stringify(c)).join('\n')+'\n');
 const preparation={version:'plain-v26',parent:'anna-v19',train:result.cards.filter(c=>c.split==='train').length,eval:246,fresh:result.holdout.length,
  exposedRegression:result.regression.length,replay:result.replayCount,newTrain:result.newCount,newTheory:result.theoryNew,reusedTheory:result.theoryReused,
  moneyTrain:result.moneyTrain,moneyFresh:result.moneyFresh,moneyTrainingCharts:24,moneyFreshCharts:12,moneyCuspSigns:12,
  epochs:2,lr:1e-5,maxLength:4096,chartFocusVersion:26,promptLengthRevision:'2026-11-10',promptVersion:18,referenceVersion:19,
  sourceSha256:hash(fs.readFileSync(source)),exposedSha256:hash(fs.readFileSync(exposed)),status:'PREPARED_NOT_TRAINED',automaticDeployment:false,
  limitations:'Synthetic editorial drafts, not Anna-approved. All natal v19 replay teachers preserved in 320 replay; original 246 development cards unchanged. Fresh set is source-concept familiar with separate wording, numbers and calculated money charts. Exposed v25 controls are regression only, excluded from train, development and fresh evaluation. Rule checks are bounded, not complete semantic verification. No automatic promotion.'};
 fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(preparation,null,2));
 console.log(JSON.stringify(preparation));
}
