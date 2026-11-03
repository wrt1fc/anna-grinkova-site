import {test} from 'node:test';
import assert from 'node:assert/strict';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {assessRepairRun} from '../training/repair-v16-gates.mjs';
import {natalChart} from '../server/astro-chart.js';
import {chartClaimProblems,SIGN_LOCATIVE} from '../training/natal-lib.js';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import evalSet from '../training/eval-questions.json' with {type:'json'};
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

test('v16 rejects actual v15 false passes about progressions and house rulers',()=>{
 const failures=[
  ['progression','Привет! Вторичная прогрессия — это движение планет по одному градусу за один земной день. Сначала её рассчитывают по синдиксу.'],
  ['ruler','Управителя дома находят по знаку асцендента: управитель — планета, стоящая в своём знаке или в своей стихии.'],
  ['identity','Привет! Пока не получается дать точный ответ. Расскажи чуть подробнее, что тебя волнует.'],
 ];
 for(const [rubricTopic,answer]of failures)assert.ok(learningAnswerProblems(answer,{qualityVersion:16,rubricTopic}).length,rubricTopic);
 assert.deepEqual(learningAnswerProblems('Во вторичных прогрессиях символически один день после рождения соответствует одному году жизни.',{qualityVersion:16,rubricTopic:'progression'}),[]);
 assert.deepEqual(learningAnswerProblems('Я Фортуна, цифровой помощник, программа, а не человек и не Анна.',{qualityVersion:16,rubricTopic:'identity'}),[]);
});

test('v16 rejects copied conversation and instruction leakage even with valid length',()=>{
 const previous='В разборе используется понятие «орбис». Его нужно отличать от личного результата.';
 assert.ok(learningAnswerProblems(previous,{qualityVersion:16,scope:'astrology',history:[{role:'assistant',content:previous}]}).some(p=>p.includes('repeated history')));
 assert.ok(learningAnswerProblems('Без натальной карты нельзя говорить о личной жизни. Сначала помоги по сути, без длинного перечисления ограничений.',{qualityVersion:16}).some(p=>p.includes('instruction echo')));
});

test('builder refuses a v16 teacher with a known faulty definition',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'repair16-builder-'));
 try{
  const input=join(root,'cards.jsonl'),out=join(root,'out');
  writeFileSync(input,JSON.stringify({id:'bad',family:'progression',split:'train',learning:true,scope:'astrology',qualityVersion:16,rubricTopic:'progression',question:'Объясни прогрессии',answer:'Вторичная прогрессия — это движение планет по одному градусу за один земной день.'})+'\n');
  assert.throws(()=>execFileSync(process.execPath,[resolve('training/build-learning-set.mjs'),input,out],{stdio:'pipe'}),/Invalid v16 teacher/);
  assert.equal(existsSync(join(out,'train.jsonl')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

function fixture(){
 const decision=(id,scope='astrology')=>({id,scope,answer:'Проверенный ответ по теме.',errors:[],expected:false,suggested:false,button:false,sensitive:false,styleFiltered:false,groundedFallback:false});
 const report=(model,rows)=>({model,rows});
 const base=report('anna-v10',[decision('a'),decision('b','offtopic')]);
 const freshBase=report('anna-v10',[decision('f')]);
 const natalBase=report('anna-v10',[{id:'n',answer:'Ответ по карте',problems:[]}]);
 const chatBase=report('anna-v10',[{id:'c',answer:'Я Фортуна',problems:[]}]);
 return {baseline:base,candidate:{...structuredClone(base),model:'anna-v16'},freshBase,fresh:{...structuredClone(freshBase),model:'anna-v16'},natalBase,natal:{...structuredClone(natalBase),model:'anna-v16'},chatBase,chat:{...structuredClone(chatBase),model:'anna-v16'},expected:{train:499,learning:['a','b'],fresh:['f'],natal:['n'],chat:['c']},meta:{processed_train_examples:499,max_length:3400,reject_truncation:true,training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:1.2}},smoke:{status:'PASS',steps:10,peak_allocated_gib:7,peak_reserved_gib:8}};
}

test('v16 cannot hide identity regression behind the same overall score',()=>{
 const data=fixture();data.chatBase.rows.push({id:'c2',answer:'Другой ответ',problems:['style']});data.expected.chat.push('c2');
 data.chat.rows.push({id:'c2',answer:'Исправленный ответ',problems:[]});data.chat.rows[0].problems=['identity'];
 const result=assessRepairRun(data);
 assert.equal(result.status,'CHECKS_COMPLETE_REVIEW_REQUIRED');assert.equal(result.checks.noIndividualRegression,false);assert.deepEqual(result.regressions.chat,['c']);
});

test('v16 gates fail closed on partial runs, missing decisions, invalid losses and smoke',()=>{
 assert.equal(assessRepairRun(fixture()).status,'CHECKS_COMPLETE_PASS');
 let data=fixture();data.candidate.rows.pop();assert.throws(()=>assessRepairRun(data),/Incomplete/);
 data=fixture();delete data.candidate.rows[0].suggested;assert.throws(()=>assessRepairRun(data),/Incomplete learning/);
 data=fixture();data.meta.final_eval_metrics.eval_loss=NaN;assert.throws(()=>assessRepairRun(data),/metadata/);
 data=fixture();data.smoke.status='FAIL';assert.equal(assessRepairRun(data).checks.memorySmoke,false);
 data=fixture();data.candidate.rows[0].styleFiltered=true;assert.equal(assessRepairRun(data).checks.noFilteredFallbacks,false);
});

test('natal evaluation catches explicit personal sign wording and a false tenth cusp',()=>{
 const natal=natalChart({birthUtc:'1990-05-17T07:30:00.000Z',latitude:55.75,longitude:37.62});
 const wrong=Object.keys(SIGN_LOCATIVE).find(sign=>sign!==natal.planets.moon.sign);
 assert.ok(chartClaimProblems(`Луна у тебя ${SIGN_LOCATIVE[wrong]}.`,natal).length);
 const cusp=natal.cusps.find(c=>c.house===10),bad=Object.keys(SIGN_LOCATIVE).find(sign=>sign!==cusp.sign);
 assert.ok(chartClaimProblems(`MC ${SIGN_LOCATIVE[natal.angles.mc.sign]}, а куспид 10 дома ${SIGN_LOCATIVE[bad]}.`,natal).length);
 assert.deepEqual(chartClaimProblems(`Луна ${SIGN_LOCATIVE[natal.planets.moon.sign]}.`,natal),[]);
});

test('v16 final report checks saved IDs and a shared frozen evaluation date',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'repair16-report-'));
 const json=(name,value)=>writeFileSync(join(root,name),JSON.stringify(value));
 try{
  for(const dir of ['reports','data','anna-v16'])mkdirSync(join(root,dir));
  const data=fixture(),learning=Array.from({length:89},(_,i)=>({...data.candidate.rows[i%2],id:'l'+i})),fresh=Array.from({length:30},(_,i)=>({...data.fresh.rows[0],id:'f'+i}));
  writeFileSync(join(root,'cards.jsonl'),learning.map(r=>JSON.stringify({id:r.id,split:'eval'})).join('\n'));
  writeFileSync(join(root,'holdout.jsonl'),fresh.map(r=>JSON.stringify({id:r.id})).join('\n'));
  json('natal-plan.json',[{id:'n',split:'eval'}]);json('preparation.json',{train:499,eval:89,fresh:30});json('data/manifest.json',{train:499,eval:89});
  for(const [name,model,rows]of [['baseline-learning','anna-v10',learning],['learning','anna-v16',learning],['baseline-fresh','anna-v10',fresh],['fresh','anna-v16',fresh]])json('reports/'+name+'.json',{model,summary:{model},rows});
  const chatRows=evalSet.questions.map(q=>({id:q.id,answer:'Прямой ответ',problems:[]}));
  for(const [name,model,rows]of [['baseline-chat','anna-v10',chatRows],['eval-chat-anna-v16','anna-v16',chatRows],['baseline-natal','anna-v10',data.natal.rows],['eval-natal-anna-v16','anna-v16',data.natal.rows]])json('reports/'+name+'.json',{model,day:'2026-11-02',rows});
  json('anna-v16/anna-training.json',data.meta);json('reports/memory-smoke-result.json',data.smoke);
  const cli=()=>execFileSync(process.execPath,[resolve('training/report-repair-v16.mjs'),root],{stdio:'pipe'});
  cli();assert.equal(JSON.parse(readFileSync(join(root,'reports/after-train-anna-v16.json'))).status,'CHECKS_COMPLETE_PASS');
  json('reports/eval-chat-anna-v16.json',{model:'anna-v16',day:'2026-11-03',rows:chatRows});assert.throws(cli,/evaluation dates/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
