import {test} from 'node:test';
import assert from 'node:assert/strict';
import {declinesLearning,isLearningQuestion,learningInvitation} from '../server/learning.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {evaluateAnswer} from '../training/eval-checks.js';
import {chartClaimProblems} from '../training/natal-lib.js';
import {canonical,curriculum17} from '../training/curriculum-v17.mjs';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import evalSet from '../training/eval-questions.json' with {type:'json'};

test('v17 accepts honest identity paraphrases while rejecting actual v16 instruction echoes',()=>{
 const card={qualityVersion:17,rubricTopic:'identity',scope:'service',question:'Кто отвечает?'};
 for(const answer of ['Я цифровой помощник Фортуна, а не живой человек.','Я Фортуна, цифровой помощник. Это автоматический ответ, а не личная переписка с Анной.'])assert.deepEqual(learningAnswerProblems(answer,card),[]);
 for(const answer of ['Я Анна Гринькова, живой человек.','Я цифровой помощник Фортуна. Не представляйся Анной или человеком.','Я Фортуна. На прямой вопрос честно объясню, что я цифровой помощник.'])assert.ok(learningAnswerProblems(answer,card).length,answer);
 assert.ok(evaluateAnswer({id:'is-anna',length:'short',checks:['identity_not_anna']},'Привет! Я Фортуна. Не представляйся Анной или человеком.','2026-11-02').includes('instruction echo'));
});

test('explicit pupil/course refusals defeat even a positive learned signal',()=>{
 for(const q of ['Объясни допуск аспекта, но без предложений стать ученицей.','Без приглашений на обучение расскажи про орбис.','Не предлагай становиться ученицей: что такое орбис?','Никаких курсов сейчас не хочу; что такое орбис?','Мне не нужно наставничество, просто объясни орбис.']){
  assert.equal(declinesLearning(q),true,q);assert.equal(isLearningQuestion(q),false,q);assert.equal(learningInvitation(q,[],true),null,q);
 }
 assert.equal(declinesLearning('Не нужно ли мне учиться астрологии?'),false);
 assert.ok(learningInvitation('Хочу научиться читать натальную карту',[],true));
});

test('an aspect after index 12 is valid, a genuinely absent aspect is still rejected',()=>{
 const fillers=Array.from({length:13},()=>({first:'sun',second:'mars',aspect:'trine'}));
 const natal={planets:{},angles:null,cusps:null,aspects:[...fillers,{first:'moon',second:'venus',aspect:'square',orb:3.21}]};
 assert.deepEqual(chartClaimProblems('Квадрат Луны и Венеры.',natal),[]);
 assert.ok(chartClaimProblems('Оппозиция Луны и Венеры.',natal).length);
});

test('v17 catches previously passed wrong rulers, missing terms and leaked greeting instructions',()=>{
 const ruler={qualityVersion:17,rubricTopic:'ruler',question:'Как найти управителя дома?'};
 assert.ok(learningAnswerProblems('Сначала найди знак на куспиде. Например, управитель Скорпиона — Юпитер.',ruler).some(e=>e.includes('incorrect ruler')));
 assert.deepEqual(learningAnswerProblems(canonical.ruler,ruler),[]);
 assert.ok(learningAnswerProblems('Допуск аспекта — разница углов.',{qualityVersion:17,rubricTopic:'orb',question:'Как называется этот допуск?'}).some(e=>e.includes('name missing')));
 assert.ok(learningAnswerProblems('Это первый ответ в разговоре. Начни с «Привет!», затем сразу ответь на вопрос.',{qualityVersion:17}).some(e=>e.includes('instruction echo')));
});

test('curriculum teachers all meet their declared rubric and do not copy instructions',()=>{
 for(const row of curriculum17()){
  const {topic,answer,...card}=row;
  assert.deepEqual(learningAnswerProblems(answer,{...card,qualityVersion:17,rubricTopic:topic,scope:row.scope??'astrology'}),[],row.question);
 }
 assert.deepEqual(learningAnswerProblems('Какой термин ты имеешь в виду? Уточни название, и я объясню его.',{qualityVersion:17,rubricTopic:'clarification'}),[]);
});

test('v17 final report requires real completion-mask evidence for every processed example',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'repair17-report-'));
 const json=(p,v)=>writeFileSync(join(root,p),JSON.stringify(v));
 const decision=id=>({id,scope:id==='l0'?'offtopic':'astrology',answer:'Проверенный ответ',errors:[],expected:false,suggested:false,button:false,sensitive:false,styleFiltered:false,groundedFallback:false});
 try{
  for(const dir of ['reports','data','anna-v17'])mkdirSync(join(root,dir));
  const learning=Array.from({length:119},(_,i)=>decision('l'+i)),fresh=Array.from({length:32},(_,i)=>decision('f'+i));
  writeFileSync(join(root,'cards.jsonl'),learning.map(r=>JSON.stringify({id:r.id,split:'eval'})).join('\n'));
  writeFileSync(join(root,'holdout.jsonl'),fresh.map(r=>JSON.stringify({id:r.id})).join('\n'));
  json('preparation.json',{version:'repair-v17',train:627,eval:119,fresh:32,enableThinking:false,requirePrefixMatch:true});json('data/manifest.json',{train:627,eval:119});json('natal-plan.json',[{id:'n',split:'eval'}]);
  for(const [name,model,rows]of [['baseline-learning','anna-v10',learning],['learning','anna-v17',learning],['baseline-fresh','anna-v10',fresh],['fresh','anna-v17',fresh],['baseline-natal','anna-v10',[{id:'n',answer:'Карта',problems:[]}]],['eval-natal-anna-v17','anna-v17',[{id:'n',answer:'Карта',problems:[]}]],['baseline-chat','anna-v10',evalSet.questions.map(q=>({id:q.id,answer:'Ответ',problems:[]}))],['eval-chat-anna-v17','anna-v17',evalSet.questions.map(q=>({id:q.id,answer:'Ответ',problems:[]}))]])json('reports/'+name+'.json',{model,day:'2026-11-02',rows,summary:{model}});
  json('anna-v17/anna-training.json',{processed_train_examples:627,max_length:3400,reject_truncation:true,completion_only_loss:true,require_prefix_match:true,training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:1},completion_mask_audit:{train:{count:627,prompt_labels_masked:true},eval:{count:119,prompt_labels_masked:true}}});
  json('reports/memory-smoke-result.json',{status:'PASS',steps:10,peak_allocated_gib:7,peak_reserved_gib:8});
  const mask={status:'PASS',splits:{train:{count:627,prefix_mismatches:0},eval:{count:119,prefix_mismatches:0}}};json('reports/completion-mask-audit.json',mask);
  const cli=()=>execFileSync(process.execPath,[resolve('training/report-repair-v17.mjs'),root],{stdio:'pipe'});
  cli();assert.equal(JSON.parse(readFileSync(join(root,'reports/after-train-anna-v17.json'))).status,'CHECKS_COMPLETE_PASS');
  mask.splits.train.prefix_mismatches=1;json('reports/completion-mask-audit.json',mask);assert.throws(cli,/Completion mask contract/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
