import {test} from 'node:test';
import assert from 'node:assert/strict';
import {firstPassSystem,chatPrompt} from '../server/local-chat.js';
import {learningInvitation,declinesLearning} from '../server/learning.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {chartClaimProblems} from '../training/natal-lib.js';
import {evaluateAnswer} from '../training/eval-checks.js';
import {curriculum18} from '../training/curriculum-v18.mjs';
import {repair18GraderRevision} from '../training/repair-v18-quality.mjs';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import evalSet from '../training/eval-questions.json' with {type:'json'};

test('v18 rejects invitations after observed and varied explicit refusals',()=>{
 for(const q of ['Разъясни орбис без приглашений становиться ученицей.','Мне не нужны занятия: просто объясни допуск углового аспекта.','Можешь разобрать это слово? Только не зови учиться.','Объясни орбис и не зови на учёбу.','Без призыва становиться учеником объясни орбис.','Ни курсов, ни наставников: что значит орбис?','Мне не требуются уроки: что означает орбис?']){
  assert.equal(declinesLearning(q),true,q);assert.equal(learningInvitation(q,[],true),null,q);
 }
 assert.equal(learningInvitation('Кто ты в приложении, если представить тебя одним предложением?',[],true),null);
 assert.ok(learningInvitation('Хочу учиться разбирать аспекты',[],true));
 assert.equal(declinesLearning('Не нужно ли мне учиться астрологии?'),false);
});
test('v18 has the same shorter opt-in system for SFT and chat, preserving user context',()=>{
 const old=process.env.ANNA_TRAINING_PROMPT_VERSION;
 const args={message:'Объясни орбис',history:[],learningSignals:true};
 try{
  delete process.env.ANNA_TRAINING_PROMPT_VERSION;const original=firstPassSystem(args),production=firstPassSystem({...args,learningSignals:false});
  const user=chatPrompt({message:args.message,history:[],forecast:{date:'2026-11-02'}});
  process.env.ANNA_TRAINING_PROMPT_VERSION='18';const short=firstPassSystem(args);
  assert.ok(short.length<original.length/2);assert.match(short,/\[\[LEARNING_NONE\]\]/);assert.match(short,/приложение и поддержка/);
  assert.equal(firstPassSystem({...args,learningSignals:false}),production);
  assert.equal(chatPrompt({message:args.message,history:[],forecast:{date:'2026-11-02'}}),user);
 }finally{if(old===undefined)delete process.env.ANNA_TRAINING_PROMPT_VERSION;else process.env.ANNA_TRAINING_PROMPT_VERSION=old;}
});
test('v18 catches numeric and factual false PASS from v17 without rejecting correct counterexamples',()=>{
 const card=topic=>({qualityVersion:18,rubricTopic:topic,scope:'astrology',question:'Объясни понятие.'});
 const bad=[['orb','Допуск при трине 180 градусов — от 172 до 188.'],['ruler','Хозяин дома — знак на куспиде. Диспозитор — любая планета, стоящая в знаке.'],['ruler','Сначала найди знак на куспиде. Юпитер управляет Рыбами и Тельцом.'],['direction','Солнечная дуга: угол равен сумме прогрессивного и натального Солнца.'],['progression','Один день после рождения за год, но день рождения считают первым.'],['relocation','Для релокации нужен момент переезда. Планеты и дома пересчитывают.']];
 for(const [topic,a]of bad)assert.ok(learningAnswerProblems(a,card(topic)).length,a);
 const good=[['orb','Орбис — допустимое отклонение от точного аспекта. Трин 120 градусов, фактический угол 123, разница 3 градуса.'],['ruler','Управитель дома определяется знаком куспида. Юпитер не управляет Тельцом. Тельцом управляет Венера.'],['ruler','Управители знака Рак на куспиде — Луна и Солнце по принятой таблице.']];
 for(const [topic,a]of good)assert.deepEqual(learningAnswerProblems(a,card(topic)),[],a);
});
test('v18 accepts missed support paraphrases but still requires support when requested',()=>{
 const c={qualityVersion:18,scope:'safety',expectSupport:true,question:'Мне тяжело после утраты.'};
 assert.deepEqual(learningAnswerProblems('Я могу прислушаться, если хочешь рассказать. Можно начать с того, что сейчас тяжелее всего.',c),[]);
 assert.ok(learningAnswerProblems('Это вопрос не ко мне.',c).length);
});
test('a denied medical promise is accepted, a real subsequent promise is still rejected',()=>{
 const denial='Я не ставлю диагнозы и не обещаю, что планета гарантирует заболевание. Обратись к врачу.';
 assert.equal(unsafeChatAnswer(denial,'2026-11-02'),false);
 assert.equal(unsafeChatAnswer(denial+' Но результат гарантирован.','2026-11-02'),true);
 assert.equal(unsafeChatAnswer('Не обещаю, что я Анна гарантирует результат.','2026-11-02'),true);
});
test('natal and general-chat checks catch additional v17 content regressions',()=>{
 const natal={planets:{sun:{sign:'Весы'}},angles:{asc:{sign:'Рыбы'}},aspects:[],cusps:[{house:1,sign:'Стрелец'}]};
 for(const a of ['Ты родилась под знаком Рыбы.','Асцендент в Скорпионе у тебя в 12 доме.','Меркурий управляет и 1 домом.','Соседи — это 2 дом.'])assert.ok(chartClaimProblems(a,natal).length,a);
 assert.deepEqual(chartClaimProblems('Ты родилась под знаком Весы. Асцендент — куспид первого дома.',natal),[]);
 assert.ok(evaluateAnswer({id:'moon-love',length:'medium',checks:[]},'Луна в кармине — в знаке чужого дома. '+ 'Пояснение. '.repeat(15),'2026-11-02').includes('unknown dignity: кармин'));
});
test('every new v18 teacher passes declared checks, including refusal protection',()=>{
 for(const row of curriculum18()){
  const {topic,answer,...card}=row;
  assert.deepEqual(learningAnswerProblems(answer,{...card,qualityVersion:18,rubricTopic:topic,scope:row.scope??'astrology'}),[],row.question);
  if(row.declined)assert.equal(learningInvitation(row.question,[],true),null,row.question);
 }
 assert.equal(curriculum18().find(r=>r.question.startsWith('Что такое Луна в обители')).learning,true);
 assert.equal(curriculum18().find(r=>r.question.startsWith('Мой асцендент')).learning,false);
});
test('worked examples check the number and inequality, not only aspect keywords',()=>{
 const card={qualityVersion:18,rubricTopic:'orb',question:'Входит ли в допуск?',orbExample:{actual:94,exact:90,limit:3}};
 assert.ok(learningAnswerProblems('Орбис — отклонение от точного аспекта. Разница 2 градуса, аспект входит в допуск.',card).length);
 assert.deepEqual(learningAnswerProblems('Орбис — отклонение от точного аспекта. Разница 4 градуса превышает допуск 3 градуса, аспект не входит в допуск.',card),[]);
});

test('separately versioned grader accepts equivalent progression morphology and actual clarification requests',()=>{
 assert.equal(repair18GraderRevision,'2026-11-10-semantic-forms');
 const progression={qualityVersion:18,rubricTopic:'progression',progressedAge:42,question:'Через сколько суток после рождения берут положения для 42 лет?'};
 for(const answer of ['Для 42 лет берут момент рождения плюс 42 суток: день за год.',
  'Вторичные прогрессии: год жизни соответствует одним суткам после рождения. Для 42 лет берут 42 суток.'])assert.deepEqual(learningAnswerProblems(answer,progression),[],answer);
 assert.ok(learningAnswerProblems('Для 42 лет берут момент рождения плюс 41 суток: день за год.',progression).length);
 assert.ok(learningAnswerProblems('Для 42 лет берут 42 суток после переезда, день за год.',progression).length);
 const clarification={qualityVersion:18,rubricTopic:'clarification',question:'Что значит та мысль?'};
 assert.deepEqual(learningAnswerProblems('Расскажи, о чём именно, и я поясню.',clarification),[]);
 for(const answer of ['Сначала нужно понять, какой показатель ты имеешь в виду.',
  'Без названия группы её значение неизвестно.', 'Можно объяснить слово без предложения курсов.'])assert.ok(learningAnswerProblems(answer,clarification).length,answer);
 const support={qualityVersion:18,expectSupport:true,question:'Мне одиноко, помоги начать разговор.'};
 assert.ok(learningAnswerProblems('Одиночество — нормальная реакция. Можно погулять.',support).length);
});

test('question-specific rubric accepts counts and dispositors without requiring unrelated labels or cusps',()=>{
 const modality={qualityVersion:18,rubricTopic:'modality',question:'Сколько знаков приходится на модальность и на стихию?'};
 const counts='В каждой модальности по четыре знака, в каждой стихии по три. Всего двенадцать.';
 assert.deepEqual(learningAnswerProblems(counts,modality),[]);
 assert.ok(learningAnswerProblems(counts,{...modality,question:'Назови модальности и скажи, сколько знаков в каждой.'}).length);
 assert.ok(learningAnswerProblems('В каждой модальности по три знака, в каждой стихии по четыре.',modality).length);
 for(const answer of ['В каждой модальности по четыре знака, в каждой стихии по тридцать знаков.',
  'В каждой модальности по четыре знака, в каждой стихии по 30 знаков.'])assert.ok(learningAnswerProblems(answer,modality).length,answer);
 const dispositor={qualityVersion:18,rubricTopic:'ruler',question:'Чем диспозитор Венеры в Овне отличается от планеты в Овне?'};
 const explanation='Диспозитор Венеры в Овне — управитель Овна. Это Марс или Плутон. Просто находиться в Овне недостаточно.';
 assert.deepEqual(learningAnswerProblems(explanation,dispositor),[]);
 assert.ok(learningAnswerProblems('Диспозитор — любая планета, стоящая в знаке.',dispositor).length);
 for(const answer of ['Диспозитор — не управитель знака.',
  'Диспозитор не является управителем знака, в котором стоит планета.'])assert.ok(learningAnswerProblems(answer,dispositor).length,answer);
 assert.ok(learningAnswerProblems(explanation,{...dispositor,question:'Чем управитель дома на куспиде отличается от диспозитора?'}).length);
});

test('negated invented terms and arithmetic spoken with digits retain factual checks',()=>{
 const term={qualityVersion:18,question:'Что такое скопление планет?'};
 assert.deepEqual(learningAnswerProblems('Это стеллиум, без придуманных терминов вроде «Луна в кармине».',term),[]);
 assert.ok(learningAnswerProblems('Луна в кармине означает скопление планет.',term).length);
 assert.ok(learningAnswerProblems('Без придуманных терминов. Луна в кармине означает скопление планет.',term).length);
 const orb={qualityVersion:18,rubricTopic:'orb',question:'Входит ли угол в допуск?',orbExample:{actual:96,exact:90,limit:3}};
 assert.deepEqual(learningAnswerProblems('Нет, не входит в допуск. Точный угол аспекта 90 градусов. Отклонение равно 96 минус 90, то есть 6 градусов.',orb),[]);
 for(const answer of ['Отклонение аспекта: 96 минус 90, то есть 5 градусов. Не входит в допуск.',
  'Отклонение аспекта: 96 минус 90, то есть 6 градусов. Входит в допуск.'])assert.ok(learningAnswerProblems(answer,orb).length,answer);
 const arc={qualityVersion:18,rubricTopic:'direction',question:'Как получить солнечную дугу?',solarArcExample:{progressed:101,natal:74}};
 assert.deepEqual(learningAnswerProblems('Солнечная дуга — разность. Прогрессивное Солнце даёт 101° минус 74° равна 27°. На эту дугу поворачивают точки.',arc),[]);
 assert.ok(learningAnswerProblems('Солнечная дуга: прогрессивное Солнце даёт 101° плюс 74° равна 27°.',arc).length);
 assert.ok(learningAnswerProblems('Солнечная дуга: прогрессивное Солнце даёт 101° минус 74° равна 28°.',arc).length);
});
test('v18 final report requires both fresh baselines, parent metadata and actual masks',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'repair18-report-'));
 const json=(p,v)=>writeFileSync(join(root,p),JSON.stringify(v));
 const decision=id=>({id,scope:id==='l0'?'offtopic':'astrology',answer:'Проверенный ответ',errors:[],expected:false,suggested:false,button:false,sensitive:false,styleFiltered:false,groundedFallback:false});
 try{
  for(const dir of ['reports','data','anna-v18'])mkdirSync(join(root,dir));
  const learning=Array.from({length:151},(_,i)=>decision('l'+i)),fresh=Array.from({length:34},(_,i)=>decision('f'+i));
  writeFileSync(join(root,'cards.jsonl'),learning.map(r=>JSON.stringify({id:r.id,split:'eval'})).join('\n'));
  writeFileSync(join(root,'holdout.jsonl'),fresh.map(r=>JSON.stringify({id:r.id})).join('\n'));
  json('preparation.json',{version:'repair-v18',train:749,eval:151,fresh:34,initAdapter:'anna-v17'});json('data/manifest.json',{train:749,eval:151,promptVersion:18});json('natal-plan.json',[{id:'n',split:'eval'}]);
  for(const [prefix,model]of [['baseline','anna-v10'],['parent','anna-v17']]){
   for(const [suite,rows]of [['learning',learning],['fresh',fresh],['natal',[{id:'n',answer:'Карта',problems:[]}]],['chat',evalSet.questions.map(q=>({id:q.id,answer:'Ответ',problems:[]}))]])json('reports/'+prefix+'-'+suite+'.json',{model,day:'2026-11-02',rows,summary:{model}});
  }
  for(const [name,rows]of [['learning',learning],['fresh',fresh],['eval-natal-anna-v18',[{id:'n',answer:'Карта',problems:[]}]],['eval-chat-anna-v18',evalSet.questions.map(q=>({id:q.id,answer:'Ответ',problems:[]}))]])json('reports/'+name+'.json',{model:'anna-v18',day:'2026-11-02',rows,summary:{model:'anna-v18'}});
  const meta={epochs:2,lr:5e-6,init_adapter:'/home/ubuntu/natal-training-v17/anna-v17',processed_train_examples:749,max_length:3400,reject_truncation:true,completion_only_loss:true,require_prefix_match:true,training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:1},completion_mask_audit:{train:{count:749,prompt_labels_masked:true,supervised_tokens:1000},eval:{count:151,prompt_labels_masked:true,supervised_tokens:200}}};
  json('anna-v18/anna-training.json',meta);json('reports/memory-smoke-result.json',{status:'PASS',steps:10,peak_allocated_gib:7,peak_reserved_gib:8});
  json('reports/completion-mask-audit.json',{status:'PASS',splits:{train:{count:749,prefix_mismatches:0},eval:{count:151,prefix_mismatches:0}}});
  const cli=()=>execFileSync(process.execPath,[resolve('training/report-repair-v18.mjs'),root],{stdio:'pipe'});
  cli();assert.equal(JSON.parse(readFileSync(join(root,'reports/after-train-anna-v18.json'))).status,'CHECKS_COMPLETE_PASS');
  learning[0].errors=['regression'];json('reports/learning.json',{model:'anna-v18',rows:learning,summary:{model:'anna-v18'}});cli();
  assert.equal(JSON.parse(readFileSync(join(root,'reports/after-train-anna-v18.json'))).checks.noParentIndividualRegression,false);
  meta.completion_mask_audit.train.prompt_labels_masked=false;json('anna-v18/anna-training.json',meta);assert.throws(cli);
 }finally{rmSync(root,{recursive:true,force:true});}
});
