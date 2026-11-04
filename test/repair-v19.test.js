import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalChat,chatPrompt} from '../server/local-chat.js';
import {extractLearningSignal,learningSignalDiagnostics} from '../server/learning-signals.js';
import {astroReference} from '../server/astro-reference.js';
import {evaluationTelemetry} from '../training/evaluation-telemetry.mjs';
import {assessRepairRun} from '../training/repair-v16-gates.mjs';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {CHECKS} from '../training/eval-checks.js';
import {methodicReference} from '../server/methodic-reference.js';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import evalSet from '../training/eval-questions.json' with {type:'json'};
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const stream=text=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:text,done:true,done_reason:'stop'})+'\n'));c.close();}})});
test('raw output is retained before an empty cleaned answer fails, without exposing malformed markers',async()=>{
 const trace=[];
 const chat=createLocalChat({model:'test-v19',learningSignals:true,onTrace:t=>trace.push(t),fetchImpl:async()=>stream('[[LEARNING_NONE]]')});
 await assert.rejects(chat.answer({message:'Кто ты?',history:[],forecast:{date:'2026-11-02'}}),/invalid answer/);
 assert.equal(trace.length,1);assert.equal(trace[0].rawText,'[[LEARNING_NONE]]');
 const parsed=extractLearningSignal('Орбис — допустимое отклонение угла от точного аспекта.\n[[LEARNING_OFFLE]]');
 assert.doesNotMatch(parsed.answer,/LEARN/);assert.equal(parsed.learningSuggested,false);
 assert.equal(learningSignalDiagnostics('[[LEARNING_OFFER]]\nОпределение.').formatValid,false);
 assert.equal(learningSignalDiagnostics('[[LEARNING_OFFER]]\nОпределение.').rawSuggested,true);
});
test('evaluation telemetry keeps filtered/fallback replies and raw decisions distinct',()=>{
 const t=evaluationTelemetry({model:null,groundedFallback:true},[{rawText:'Плохой ответ',signal:{formatValid:true,rawSuggested:true}}]);
 assert.equal(t.groundedFallback,true);assert.equal(t.rawLearningSuggested,true);assert.equal(t.generationModel,null);assert.equal(t.rawAttempts[0].rawText,'Плохой ответ');
});
test('a recorded baseline error becomes REVIEW, not a broken report or fabricated PASS',()=>{
 const row=(id,scope='astrology')=>({id,scope,answer:'Ответ',errors:[],expected:false,suggested:false,button:false,sensitive:false,styleFiltered:false,groundedFallback:false});
 const b={model:'anna-v10',rows:[row('a'),row('b','offtopic')]},f={model:'anna-v10',rows:[row('f')]};
 const n={model:'anna-v10',rows:[{id:'n',answer:'Карта',problems:[]}]},c={model:'anna-v10',rows:[{id:'c',answer:'Чат',problems:[]}]};
 const input={baseline:b,candidate:{...structuredClone(b),model:'anna-v16'},freshBase:f,fresh:{...structuredClone(f),model:'anna-v16'},natalBase:n,natal:{...structuredClone(n),model:'anna-v16'},chatBase:c,chat:{...structuredClone(c),model:'anna-v16'},expected:{train:499,learning:['a','b'],fresh:['f'],natal:['n'],chat:['c']},meta:{processed_train_examples:499,max_length:3400,reject_truncation:true,training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:1}},smoke:{status:'PASS',steps:10,peak_allocated_gib:7,peak_reserved_gib:8}};
 b.rows[0].answer='';b.rows[0].errors=['Local chat returned an invalid answer'];
 const r=assessRepairRun(input);assert.equal(r.status,'CHECKS_COMPLETE_REVIEW_REQUIRED');assert.equal(r.checks.baselineAnswersPresent,false);
 b.rows[0].errors=[];assert.throws(()=>assessRepairRun(input),/Invalid evaluation row/);
 b.rows[0].errors=['generation failed'];input.natal.rows[0].groundedFallback=true;assert.equal(assessRepairRun(input).checks.noFilteredFallbacks,false);
});
test('reference facts route by concept and preserve original context outside the opt-in',()=>{
 const args={message:'Как найти управителя дома?',history:[],forecast:{date:'2026-11-02'},chart:{planets:['Луна в Водолее']}};
 const old=process.env.ANNA_REFERENCE_KNOWLEDGE;
 try{
  delete process.env.ANNA_REFERENCE_KNOWLEDGE;const ordinary=JSON.parse(chatPrompt(args));assert.equal(ordinary.reference,undefined);
  process.env.ANNA_REFERENCE_KNOWLEDGE='19';const grounded=JSON.parse(chatPrompt(args));assert.deepEqual(grounded.chart,ordinary.chart);assert.deepEqual(grounded.history,ordinary.history);assert.equal(grounded.question,ordinary.question);
  assert.match(grounded.reference.facts.join(' '),/Скорпион — Плутон\/Марс/);
  assert.equal(astroReference('Составь SQL запрос к таблице horoscope'),null);
  assert.ok(astroReference('А как это устроено?',[{role:'assistant',content:'Мы обсуждаем вторичные прогрессии.'}]).topics.includes('progression'));
  assert.equal(astroReference('Кто ты в приложении?').topics[0],'service');
  assert.deepEqual(astroReference('Если куспид в Скорпионе, его управитель Юпитер?').computed.houseRulers.planets,['Плутон','Марс']);
  assert.deepEqual(astroReference('Если куспид в Скорпионе, его управитель Юпитер?').computed.mentionedPlanetRulerships['Юпитер'],['Стрелец','Рыбы']);
  assert.equal(astroReference('Натальное Солнце 88 градусов, прогрессивное 106. Какая солнечная дуга?').computed.solarArc.arcDegrees,18);
  assert.equal(astroReference('Мне 62. Какой день берут во вторичной прогрессии?').computed.progression.daysAfterBirth,62);
 }finally{if(old===undefined)delete process.env.ANNA_REFERENCE_KNOWLEDGE;else process.env.ANNA_REFERENCE_KNOWLEDGE=old;}
});

test('curated source retrieval preserves conversation style and never loads unverified raw material',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anna-methodics-')),path=join(dir,'curated.json');
 const snapshot=JSON.stringify({version:19,entries:[{id:'test-source',sourceId:'private-1',question:'Какие темы третьего дома связаны с соседями?',evalQuestion:'Третий дом и ближайшее окружение',paragraphStart:17,paragraphEnd:26,answer:'Третий дом связан с повседневным общением и соседями.',status:'reviewed-adaptation-draft-not-Anna-approved'}]});
 writeFileSync(path,snapshot);
 const before={file:process.env.ANNA_METHODICS_FILE,sha:process.env.ANNA_METHODICS_SHA256,flag:process.env.ANNA_REFERENCE_KNOWLEDGE};
 try{
  process.env.ANNA_METHODICS_FILE=path;delete process.env.ANNA_METHODICS_SHA256;
  assert.throws(()=>methodicReference('Какие темы третьего дома связаны с соседями?'),/hash required/);
  process.env.ANNA_METHODICS_SHA256=createHash('sha256').update(snapshot).digest('hex');
  const r=methodicReference('Какие темы третьего дома связаны с соседями?');assert.equal(r.entries[0].sourceId,'private-1');assert.deepEqual(r.entries[0].paragraphs,[17,26]);
  assert.equal(methodicReference('Напиши SQL про третий дом и соседей'),null);
  assert.equal(methodicReference('Сильно болит грудь, третий дом и соседи'),null);
  const args={message:'Какие темы третьего дома связаны с соседями?',history:[{role:'user',content:'Без рекламы'}],forecast:{date:'2026-11-02'}};
  delete process.env.ANNA_REFERENCE_KNOWLEDGE;const ordinary=JSON.parse(chatPrompt(args));assert.equal(ordinary.methodics,undefined);
  process.env.ANNA_REFERENCE_KNOWLEDGE='19';const augmented=JSON.parse(chatPrompt(args));assert.deepEqual(augmented.history,args.history);assert.equal(augmented.toneInstruction,ordinary.toneInstruction);assert.equal(augmented.lengthInstruction,ordinary.lengthInstruction);assert.equal(augmented.methodics.entries[0].id,'test-source');
  process.env.ANNA_METHODICS_SHA256='0'.repeat(64);assert.throws(()=>methodicReference(args.message),/hash mismatch/);
 }finally{
  for(const [k,v]of Object.entries({ANNA_METHODICS_FILE:before.file,ANNA_METHODICS_SHA256:before.sha,ANNA_REFERENCE_KNOWLEDGE:before.flag}))if(v===undefined)delete process.env[k];else process.env[k]=v;
  rmSync(dir,{recursive:true});
 }
});
test('v19 catches observed false PASS and accepts arithmetic and clarification paraphrases',()=>{
 for(const [topic,text]of [['modality','Модальности — три группы знаков: земная, огненная, воздушная. Начало, сохранение и смена.'],['modality','В астрологии три качества определяют знак: огненный, земной, воздушный и водный. Начало, сохранение и смена.'],['ruler','Если куспид в Скорпионе, управитель — Юпитер. Затем смотрят его знак.'],['stellium','Скопление планет вокруг одного знака называют обителью.']]){
  assert.ok(learningAnswerProblems(text,{qualityVersion:18,rubricTopic:topic==='stellium'?null:topic}).length,text);
 }
 const card={qualityVersion:18,rubricTopic:'orb',orbExample:{actual:117,exact:120},question:'Какое отклонение от трина?'};
 assert.deepEqual(learningAnswerProblems('Трин — угол120 градусов. Разница между120 и117 градусами составляет3 градуса.',card),[]);
 assert.deepEqual(learningAnswerProblems('Расскажи, какой показатель и где ты его увидела. Без контекста нельзя объяснить.',{qualityVersion:18,rubricTopic:'clarification'}),[]);
});
test('severe chest pain requires urgent care, not just a routine doctor suggestion',()=>{
 assert.notEqual(CHECKS.urgent_medical_care('Сильную боль нужно проверить у врача.'),true);
 assert.equal(CHECKS.urgent_medical_care('При сильной боли в груди обратись за срочной медицинской помощью.'),true);
});

test('v19 final report survives recorded baseline failure and rejects raw signals hidden by the interface',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anna-v19-report-'));
 try{
  for(const p of ['data','reports','anna-v19'])mkdirSync(join(dir,p));
  const save=(p,o)=>writeFileSync(join(dir,p),JSON.stringify(o));
  save('methodics.json',{version:19});const sha=createHash('sha256').update(readFileSync(join(dir,'methodics.json'))).digest('hex');
  save('preparation.json',{version:'repair-v19',train:931,eval:246,fresh:32,sourceTrain:122,repairTrain:48,styleTrain:12,initAdapter:'anna-v18',methodicsSha256:sha});
  save('data/manifest.json',{train:931,eval:246,promptVersion:18,referenceVersion:19,methodicsSha256:sha});
  save('anna-v19/anna-training.json',{processed_train_examples:931,max_length:3400,reject_truncation:true,epochs:1,lr:5e-6,init_adapter:'/home/ubuntu/natal-training-v18/anna-v18',prompt_version:'18',reference_version:'19',methodics_sha256:sha,completion_only_loss:true,require_prefix_match:true,completion_mask_audit:{train:{count:931,prompt_labels_masked:true,supervised_tokens:100},eval:{count:246,prompt_labels_masked:true,supervised_tokens:100}},training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:1}});
  save('reports/memory-smoke-result.json',{status:'PASS',steps:10,peak_allocated_gib:6,peak_reserved_gib:7});
  save('reports/completion-mask-audit.json',{status:'PASS',splits:{train:{count:931,prefix_mismatches:0},eval:{count:246,prefix_mismatches:0}}});
  const learning=Array.from({length:246},(_,i)=>({id:'l'+i,split:'eval'})),fresh=Array.from({length:32},(_,i)=>({id:'f'+i}));
  for(const [name,rows]of [['cards',learning],['holdout',fresh]])writeFileSync(join(dir,name+'.jsonl'),rows.map(JSON.stringify).join('\n'));
  save('natal-plan.json',[{id:'n',split:'eval'}]);
  const make=(id,field)=>({id,scope:'offtopic',answer:'Ответ',expected:false,suggested:false,button:false,sensitive:false,styleFiltered:false,groundedFallback:false,rawAttempts:[],generationError:null,signalFormatValid:true,rawLearningSuggested:false,[field]:[]});
  for(const [model,prefix]of [['anna-v10','baseline'],['anna-v18','parent'],['anna-v19','candidate']]){
   for(const [name,ids,field]of [['learning',learning.map(x=>x.id),'errors'],['fresh',fresh.map(x=>x.id),'errors'],['natal',['n'],'problems'],['chat',evalSet.questions.map(x=>x.id),'problems']]){
    const rows=ids.map(id=>make(id,field));if(model==='anna-v10'&&name==='learning'){rows[0].answer='';rows[0].errors=['Local chat returned an invalid answer'];rows[0].generationError='invalid answer';}
    if(model==='anna-v19'&&name==='learning')rows[1].rawLearningSuggested=true;
    const file=prefix==='candidate'?name==='natal'||name==='chat'?`reports/eval-${name}-anna-v19.json`:`reports/${name}.json`:`reports/${prefix}-${name}.json`;
    save(file,{model,summary:{model},day:'2026-11-02',rows});
   }
  }
  execFileSync(process.execPath,[resolve('training/report-repair-v19.mjs'),dir]);
  const result=JSON.parse(readFileSync(join(dir,'reports/after-train-anna-v19.json')));
  assert.equal(result.status,'CHECKS_COMPLETE_REVIEW_REQUIRED');assert.equal(result.checks.baselineAnswersPresent,false);assert.equal(result.checks.candidateRawDecisions,false);assert.equal(result.automaticDeployment,false);assert.equal(result.manualReviewRequired,true);
 }finally{rmSync(dir,{recursive:true});}
});
