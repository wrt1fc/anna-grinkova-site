import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartContext} from '../server/chat-grounding.js';
import {chartRecords} from '../server/chart-records.js';
import {namedChartPoints} from '../server/chart-answer-check.js';
const profile={birthUtc:'1992-01-07T03:05:00Z',birthLatitude:56.84,birthLongitude:60.61};
test('point names use word boundaries rather than fragments of professions',()=>{
 assert.deepEqual(namedChartPoints('Работа маркетологом и лунный календарь'),[]);
 assert.deepEqual(namedChartPoints('Объясни положение Марса и Луны'),['moon','mars']);
 assert.deepEqual(namedChartPoints('Что означает MC?'),['mc']);
});
test('separate position records cannot inherit another planet or cusp sign and preserve original facts',()=>{
 const chart=chartContext(profile,'Что главное в моей натальной карте?').chart;
 const records=chartRecords(chart,'Что главное в моей натальной карте?');
 assert.deepEqual(records.positions,[{planet:'Солнце',sign:'Козерог',house:1},{planet:'Луна',sign:'Водолей',house:1},{planet:'Асцендент',sign:'Стрелец',house:null}]);
 assert.equal(records.houseRulers.length,0);assert.equal(chart.calculated.positions.sun.sign,'Козерог');assert.equal(chart.houseRulers.length,12);
 assert.ok(JSON.stringify(records).length<JSON.stringify(chart).length/2);
});
test('income records retain both rulers with each own sign and house; complex questions keep full data',()=>{
 const chart=chartContext(profile,'Как мне зарабатывать?').chart;
 const records=chartRecords(chart,'Как мне зарабатывать?');
 assert.equal(records.money.rulerCount,2);
 assert.deepEqual(records.houseRulers[0].rulers.map(r=>[r.planet,r.sign,r.house]),[['Уран','Козерог',1],['Сатурн','Водолей',1]]);
 assert.equal(chartRecords(chart,'Сделай полный разбор моей карты'),chart);
 assert.equal(chartRecords(chart,'Мой Сатурн ретроградный?'),chart);
 assert.equal(chartRecords(chart,'Какие планеты находятся в первом доме моей карты?'),chart);
 assert.equal(chartRecords(chart,'Какие планеты есть в моей натальной карте?'),chart);
 assert.equal(chartRecords({...chart,partner:{}},'Расскажи про карту').partner!==undefined,true);
});
test('unknown birth time never acquires houses or angles in records',()=>{
 const chart=chartContext({...profile,birthTime:null},'Что главное в моей натальной карте?').chart;
 const records=chartRecords(chart,'Что главное в моей натальной карте?');
 assert.ok(records.positions.every(p=>p.house===null));assert.ok(records.positions.every(p=>p.planet!=='Асцендент'));
});
