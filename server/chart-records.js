import {POINT_NAMES,ASPECT_NAMES} from './astro-chart.js';
import {houseMentions} from './anna-method.js';
import {chatIntent} from './chat-intent.js';
import {namedChartPoints} from './chart-answer-check.js';

// Opt-in experiment. A narrow, per-object projection; never changes calculated facts.
export function chartRecords(chart,question){
 const facts=chart?.calculated;
 if(!facts?.positions||chart.partner||chart.relationship||chart.transits||chart.directions||houseMentions(question).length
   ||/полн\p{L}*\s+разбор|всю\s+карт|всей\s+карт|подробн|градус|долгот|орбис|стратеги|стихи|формул|ретроград|(?:все|какие)\s+планет|все\s+аспект/iu.test(question))return chart;
 const intent=chatIntent(question);
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
  positions:keys.map(record),
  houseRulers:rulers.map(row=>({house:row.house,cuspSign:row.sign,rulers:row.rulers.filter(r=>point(r.planet)).map(r=>record(r.planet))})),
  aspects:(facts.aspects??[]).filter(a=>selected.has(a.first)&&selected.has(a.second)).slice(0,3)
   .map(a=>({first:POINT_NAMES[a.first],second:POINT_NAMES[a.second],aspect:ASPECT_NAMES[a.aspect]})),
  ...(intent==='income'&&chart.money?{money:{secondHouseCusp:chart.money.secondHouseCusp,rulerCount:rulers.find(r=>r.house===2)?.rulers.length??0}}:{}),
  factRule:'Каждая запись относится только к названной планете. Знак на начале дома не является знаком его управителя. Не добавляй положения и аспекты вне этих записей.',
 };
}
