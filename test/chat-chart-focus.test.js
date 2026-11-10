import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartContext} from '../server/chat-grounding.js';
import {focusedChart} from '../server/chat-chart-focus.js';
import {chatPrompt,firstPassSystem} from '../server/local-chat.js';
import {chartClaimProblems} from '../training/natal-lib.js';
import {natalChart} from '../server/astro-chart.js';

const input={birthUtc:'1988-07-08T12:00:00Z',latitude:55.75,longitude:37.62};
test('money prompt projection keeps actual rulers and source, validators retain full chart',()=>{
  const chart=chartContext({...input,birthLatitude:input.latitude,birthLongitude:input.longitude},'Как мне зарабатывать?').chart;
  const focused=focusedChart(chart,'Как мне зарабатывать?');
  assert.equal(focused.money.rulerCount,2);
  assert.deepEqual(focused.money.rulers,[{planet:'Юпитер',house:7},{planet:'Нептун',house:2}]);
  assert.equal(focused.houseRulers.length,1);
  assert.equal(focused.planets.length,2);
  assert.equal(chart.houseRulers.length,12);
  assert.equal(chart.calculated.houseRulers.length,12);
  assert.equal(focusedChart(chart,'Как связаны деньги и отношения?'),chart);
  const old=process.env.ANNA_CHART_FOCUS;
  try{process.env.ANNA_CHART_FOCUS='26';
    const prompt=JSON.parse(chatPrompt({message:'Как мне зарабатывать?',history:[],forecast:{},chart}));
    assert.equal(prompt.chart.money.rulerCount,2);
    assert.equal(prompt.chart.calculated,undefined);
  }finally{if(old===undefined)delete process.env.ANNA_CHART_FOCUS;else process.env.ANNA_CHART_FOCUS=old;}
});
test('detailed system instruction explicitly preserves requested length',()=>{
  const prompt=firstPassSystem({message:'Объясни конфликты',length:'detailed'});
  assert.match(prompt,/для подробного ответа раскрой тему/u);
  assert.match(prompt,/5–8/u);
});
test('an ascendant and other twelfth-house planets in one sentence are not a false position claim',()=>{
  const natal=natalChart(input);
  assert.ok(!chartClaimProblems('Твой асцендент в Рыбах, а в 12 доме стоят Уран и Нептун.',natal).includes('асцендент ошибочно помещён в 12 дом'));
  assert.ok(chartClaimProblems('Асцендент находится в 12 доме.',natal).includes('асцендент ошибочно помещён в 12 дом'));
});
