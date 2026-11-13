import {POINT_NAMES,ASPECT_NAMES} from './astro-chart.js';
import {houseMentions,SIGN_PREPOSITIONAL} from './anna-method.js';
import {chatIntent} from './chat-intent.js';
import {namedChartPoints} from './chart-answer-check.js';
import {factAnswersEnabled,monetaryRecords} from './chat-fact-answers.js';

// Opt-in experiment. A narrow, per-object projection; never changes calculated facts.
export function chartRecords(chart,question){
 const intent=chatIntent(question);
 if(intent==='service')return null;
 if(factAnswersEnabled()){
  const money=monetaryRecords(chart,question);
  if(money)return money;
 }
 const facts=chart?.calculated;
 if(!facts?.positions||chart.partner||chart.relationship||chart.transits||chart.directions||houseMentions(question).length
   ||/полн\p{L}*\s+разбор|всю\s+карт|всей\s+карт|подробн|градус|долгот|орбис|стратеги|стихи|формул|ретроград|управител|(?:все|какие)\s+планет|все\s+аспект/iu.test(question))return chart;
 const houses=new Set(houseMentions(question));
 if(intent==='income')houses.add(2);
 if(['growth','workfit','promotion'].includes(intent)){houses.add(10);houses.add(6);}
 const named=new Set(namedChartPoints(question));
 const selected=new Set(named.size?named:['sun','moon','asc']);
 const rulers=(facts.houseRulers??[]).filter(row=>houses.has(row.house));
 for(const row of rulers)for(const r of row.rulers)selected.add(r.planet);
 if(houses.has(10))selected.add('mc');
 const point=key=>facts.positions[key]??facts.angles?.[key];
 const record=key=>{const p=point(key);return {planet:POINT_NAMES[key],sign:p.sign,house:p.house??null};};
 // Keep explicit aspect questions on the full chart until separately validated.
 if(/аспект|соединени|квадрат|секстил|оппозиц|трин|тригон/iu.test(question))return chart;
 const keys=[...selected].filter(key=>point(key));
 return {
  houseSystem:chart.houseSystem,
  ...(chart.solarSignUncertain?{solarSignUncertain:true}:{}),
  ...(chart.uncertainPositions?.length?{uncertainPositions:chart.uncertainPositions}:{}),
  positions:keys.map(record),
  houseRulers:rulers.map(row=>({house:row.house,cuspSign:row.sign,rulers:row.rulers.filter(r=>point(r.planet)).map(r=>record(r.planet))})),
  aspects:(facts.aspects??[]).filter(a=>selected.has(a.first)&&selected.has(a.second)).slice(0,3)
   .map(a=>({first:POINT_NAMES[a.first],second:POINT_NAMES[a.second],aspect:ASPECT_NAMES[a.aspect]})),
  ...(intent==='income'&&chart.money?{money:{secondHouseCusp:chart.money.secondHouseCusp,rulerCount:rulers.find(r=>r.house===2)?.rulers.length??0}}:{}),
  factRule:'Каждая запись относится только к названной планете. Знак на начале дома не является знаком его управителя. Не добавляй положения и аспекты вне этих записей.',
 };
}

function mentionsRecord(answer,records){
 const keys=new Set(namedChartPoints(answer));
 return records.positions.some(row=>Object.entries(POINT_NAMES).some(([key,name])=>name===row.planet&&keys.has(key)));
}
const personalChartQuestion=question=>!['service','support','rest','offtopic'].includes(chatIntent(question))&&/карт|гороскоп/iu.test(question);

export function recordAnswerProblem(answer,chart,question){
 const records=chartRecords(chart,question);
 if(!Array.isArray(records?.positions))return false;
 const roles=answer.split(/[.!?\n]/u).some(sentence=>{
  // An offer to discuss rulers later does not assert any planet's role or house.
  const discussionOnly=/^\s*управителей\s+(?:(?:дома|домов)\s+)?(?:можно|можем)\s+(?:обсудить|рассмотреть|разобрать)(?:\s+(?:позже|потом)|,\s*когда\s+это\s+будет\s+полезно)?\s*$/iu.test(sentence);
  return /управител/iu.test(sentence)&&!discussionOnly
   && !/не\s+(?:назыв|явля|счита|управител)|не\s+(?:нужно|следует|стоит)\s+назыв|неверно|неправда/iu.test(sentence);
 });
 if(!records.houseRulers.length&&roles)return true;
 if(personalChartQuestion(question)&&!mentionsRecord(answer,records))return true;
 return /(?<![\p{L}«“"])(?:я\s+(?:живу|проявляюсь|люблю|строю|чувствую))(?!\p{L})/iu.test(answer);
}

export function anchorRecordReply(text,chart,question){
 if(!text||!personalChartQuestion(question))return text;
 const records=chartRecords(chart,question);
 if(!Array.isArray(records?.positions)||!records.positions.length||mentionsRecord(text,records))return text;
 const p=records.positions[0];
 return `В расчёте ${p.planet} в ${SIGN_PREPOSITIONAL[p.sign]}${p.house?`, в ${p.house}-м доме`:''}.\n${text}`;
}
