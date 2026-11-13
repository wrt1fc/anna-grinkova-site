import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculum30} from '../training/curriculum-v30.mjs';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim} from '../server/chart-answer-check.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {chatPrompt} from '../server/local-chat.js';
import {assertTeacherChartInput} from '../training/teacher-chart-contract.mjs';
import {spawnSync} from 'node:child_process';

test('v30 teachers follow synthetic charts, source limits and disjoint held-out profiles',()=>{
 const rows=curriculum30();
 assert.equal(rows.filter(c=>c.split==='train').length,96);
 assert.equal(rows.filter(c=>c.split==='eval').length,24);
 assert.equal(rows.filter(c=>c.split==='holdout').length,24);
 assert.equal(new Set(rows.map(c=>c.id)).size,rows.length);
 const seen=new Set(rows.filter(c=>c.split!=='holdout').map(c=>c.chartFor.birthUtc));
 for(const c of rows){
  if(c.split==='holdout')assert.ok(!seen.has(c.chartFor.birthUtc));
  const p=c.chartFor;const {chart}=chartContext({birthUtc:p.birthUtc,birthLatitude:p.latitude,birthLongitude:p.longitude},c.question,new Date('2026-11-13T09:00:00Z'),{history:c.history??[]});
  assert.equal(wrongCalculatedClaim(c.answer,chart),false,c.id);
  const old=process.env.ANNA_CHART_FOCUS;process.env.ANNA_CHART_FOCUS='30';
  try{assertTeacherChartInput(c.answer,JSON.parse(chatPrompt({message:c.question,chart,history:c.history??[],forecast:null,materials:c.materials??[]})),c.id);}
  finally{if(old===undefined)delete process.env.ANNA_CHART_FOCUS;else process.env.ANNA_CHART_FOCUS=old;}
  assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
  assert.ok(c.answer.length<700,c.id);
 }
 const sample=rows.filter(c=>c.chartFor.birthUtc===rows[0].chartFor.birthUtc);
 assert.notEqual(sample.find(c=>c.topic==='growth').answer,sample.find(c=>c.topic==='workfit').answer);
 assert.ok(sample.find(c=>c.topic==='unsupported-metaphor').materials.length);
 assert.equal(sample.find(c=>c.topic==='steps').answer.match(/(?:^|\n)\d\./gu).length,3);
});

test('a teacher cannot reveal personal positions missing from the actual serialized input',()=>{
 assert.throws(()=>assertTeacherChartInput('Солнце в Весах, в 2-м доме.',{chart:null},'missing'),/without chart/);
 assert.throws(()=>assertTeacherChartInput('Венера в Скорпионе.',{chart:{positions:[{planet:'Солнце',sign:'Весы'}]}},'hidden'),/absent from records/);
 assert.doesNotThrow(()=>assertTeacherChartInput('Солнце связывают с выбором целей.',{chart:null},'general'));
});

test('the v30 raw evaluator loads its dependencies before validating CLI arguments',()=>{
 const r=spawnSync(process.execPath,['training/eval-raw-v30.mjs'],{encoding:'utf8'});
 assert.equal(r.status,1);
 assert.match(r.stderr,/Expected model root prefix/u);
 assert.doesNotMatch(r.stderr,/ERR_MODULE_NOT_FOUND/u);
});
