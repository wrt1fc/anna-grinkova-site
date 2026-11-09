import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {curriculum25} from './curriculum-v25.mjs';
import explanation from '../config/chat-explanation.json' with {type:'json'};
import {POINT_NAMES} from '../server/astro-chart.js';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import {hasFormalAddress} from '../server/chat-style.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => fs.readFileSync(path,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
export function selectReplay25(cards,target=320) {
  const sorted=cards.filter(c=>c.split==='train').toSorted((a,b)=>hash(a.id).localeCompare(hash(b.id)));
  const selected=sorted.filter(c=>c.chartFor), ids=new Set(selected.map(c=>c.id));
  assert.ok(selected.length<=target,'Replay target would discard natal teachers');
  const groups=new Map();
  for(const c of sorted.filter(c=>!c.chartFor)) {
    const key=JSON.stringify([c.family,c.learning,c.scope]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }
  const queues=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>rows);
  while(selected.length<target){
    let added=0;
    for(const rows of queues){
      const c=rows.shift();
      if(c&&!ids.has(c.id)){selected.push(c);ids.add(c.id);added++;}
      if(selected.length===target)break;
    }
    assert.ok(added,'Not enough replay examples');
  }
  return selected.toSorted((a,b)=>a.id.localeCompare(b.id));
}

export function moneyCards25() {
  const result={train:[],eval:[]};
  const questions={train:['Через какие занятия мне можно зарабатывать по моей карте?','Какие темы заработка стоит рассмотреть по моей натальной карте?','Поясни мой подход к заработку простыми словами по карте.','Что моя карта показывает про возможные источники дохода?'],
    eval:['Какие варианты заработка видны по моему расчёту, если объяснить без сложных слов?','Как связать мой денежный разбор с обычной работой и занятиями?','Хочу разобраться со своими источниками дохода по карте. С чего начать?','Объясни денежную тему моей карты без списка непонятных терминов.']};
  for(const split of ['train','eval'])for(let i=0;i<(split==='train'?24:4);i++){
    const birthUtc=new Date(Date.UTC(split==='train'?1981+i%18:2002+i,(i*5+2)%12,3+(i*7)%24,2+(i*3)%19,15)).toISOString();
    const chartFor={birthUtc,latitude:55.75,longitude:37.62};
    const profile={birthUtc,birthLatitude:55.75,birthLongitude:37.62};
    for(const [q,question] of questions[split].entries()){
      const chart=chartContext(profile,question).chart;
      const rulers=chart.calculated.houseRulers.find(r=>r.house===2).rulers;
      const topics=[...new Set(rulers.map(r=>explanation.moneyTopics[r.house]))];
      const facts=rulers.map((r,j)=>`${rulers.length===1?'Управитель денежного дома':j===0?'Один из управителей денежного дома':'Другой управитель денежного дома'} — ${POINT_NAMES[r.planet]} — стоит в ${r.house} доме.`);
      const answer=`Привет! Для заработка можно рассмотреть ${topics.join('; ')}. ${facts.join(' ')}`;
      const row={id:`plain25-money-${split}-${i}-${q}`,family:`plain25-money-${split}-chart-${i}`,split,status:'draft',origin:'synthetic-editorial-draft-not-Anna-approved',question,answer,chartFor,learning:false,scope:'astrology',history:[],length:'medium',qualityVersion:19,minAnswerChars:40,
        requiredMeanings:rulers.map(r=>[POINT_NAMES[r.planet]]),sourceRefs:['config/money-rules.json:rulerHouses','config/chat-explanation.json:moneyTopics']};
      assert.equal(wrongCalculatedClaim(answer,chart),false,row.id);
      assert.equal(hasFormalAddress(answer),false,row.id);
      assert.equal(!!unsafeChatAnswer(answer,'2026-11-09'),false,row.id);
      assert.deepEqual(learningAnswerProblems(answer,row),[],row.id);
      result[split].push(row);
    }
  }
  return result;
}

export function prepare25(parent,exposed,curriculum=curriculum25()) {
  assert.equal(parent.filter(c=>c.split==='train').length,931,'Wrong parent snapshot');
  assert.equal(parent.filter(c=>c.split==='eval').length,246,'Wrong parent development set');
  const money=moneyCards25(), replay=selectReplay25(parent);
  const cards=[...replay,...curriculum.train,...money.train,...parent.filter(c=>c.split==='eval')];
  const holdout=[...curriculum.eval,...money.eval];
  const priorQuestions=new Set([...parent,...exposed].map(c=>c.question));
  const trainQuestions=new Set(cards.map(c=>c.question));
  const trainFamilies=new Set(cards.map(c=>c.family));
  assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'Duplicate card ID');
  for(const c of holdout){
    assert.equal(trainQuestions.has(c.question),false,'Fresh question leaked: '+c.question);
    assert.equal(priorQuestions.has(c.question),false,'Control was exposed: '+c.question);
    assert.equal(trainFamilies.has(c.family),false,'Fresh family leaked: '+c.family);
  }
  const parentInstants=new Set(parent.filter(c=>c.chartFor).map(c=>Date.parse(c.chartFor.birthUtc)));
  assert.ok([...money.train,...money.eval].every(c=>!parentInstants.has(Date.parse(c.chartFor.birthUtc))),'New money chart duplicates a parent chart');
  return {cards,holdout,replayCount:replay.length,newCount:curriculum.train.length+money.train.length};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,exposed,out]=process.argv.slice(2);
  if(!out||fs.existsSync(out))throw Error('Expected parent cards, exposed controls and NEW output directory');
  const result=prepare25(read(source),read(exposed));
  fs.mkdirSync(out,{recursive:true});
  for(const name of ['cards','holdout'])fs.writeFileSync(join(out,name+'.jsonl'),result[name].map(c=>JSON.stringify(c)).join('\n')+'\n');
  const preparation={version:'plain-v25',parent:'anna-v19',train:result.cards.filter(c=>c.split==='train').length,eval:246,fresh:result.holdout.length,replay:result.replayCount,newTrain:result.newCount,
    epochs:1,lr:5e-6,maxLength:3584,promptVersion:18,referenceVersion:19,sourceSha256:hash(fs.readFileSync(source)),exposedSha256:hash(fs.readFileSync(exposed)),status:'PREPARED_NOT_TRAINED',automaticDeployment:false,
    limitations:'Focused synthetic editorial drafts, not Anna-approved. All 80 natal replay teachers and 246 development examples preserved; other replay stratified to 320 total. Fresh wording and new synthetic money charts are held out from both training and validation; concepts remain familiar. No automatic promotion.'};
  fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(preparation,null,2));console.log(JSON.stringify(preparation));
}
