import {test} from 'node:test';import assert from 'node:assert/strict';
import {curriculum31} from '../training/curriculum-v31.mjs';
import {chartContext} from '../server/chat-grounding.js';
import {chatPrompt} from '../server/local-chat.js';
import {quality31} from '../training/quality-v31.mjs';
import {assertTeacherChartInput} from '../training/teacher-chart-contract.mjs';

test('v31 dialogues retain the current task, available facts and separated synthetic profiles',()=>{
 const rows=curriculum31();
 assert.equal(rows.filter(c=>c.split==='train').length,192);
 assert.equal(rows.filter(c=>c.split==='eval').length,48);
 assert.equal(rows.filter(c=>c.split==='holdout').length,48);
 assert.equal(new Set(rows.map(c=>c.id)).size,rows.length);
 const trainingBirths=new Set(rows.filter(c=>c.split==='train').map(c=>c.chartFor?.birthUtc).filter(Boolean));
 const developmentBirths=new Set(rows.filter(c=>c.split==='eval').map(c=>c.chartFor?.birthUtc).filter(Boolean));
 const old=process.env.ANNA_CHART_FOCUS;process.env.ANNA_CHART_FOCUS='30';
 try{for(const c of rows){
  const p=c.chartFor;
  if(c.split==='holdout'&&p)assert.ok(!trainingBirths.has(p.birthUtc)&&!developmentBirths.has(p.birthUtc));
  const {chart}=chartContext(p?{birthUtc:p.birthUtc,birthLatitude:p.latitude,birthLongitude:p.longitude}:null,c.question,new Date('2026-11-13T09:00:00Z'),{history:c.history??[]});
  assert.deepEqual(quality31(c.answer,c,chart),[],c.id);
  const prompt=JSON.parse(chatPrompt({message:c.question,chart,history:c.history??[],forecast:null,materials:c.materials??[]}));
  assertTeacherChartInput(c.answer,prompt,c.id);
  assert.ok(c.answer.length<=700,c.id);
 }}finally{if(old===undefined)delete process.env.ANNA_CHART_FOCUS;else process.env.ANNA_CHART_FOCUS=old;}
 assert.equal(new Set(rows.filter(c=>c.split==='train').map(c=>c.family)).size,22);
});
