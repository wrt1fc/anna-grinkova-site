import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {deriveV27Grading,regradeV27Fresh,v27GradingRevision} from '../training/v27-grading-revision.mjs';
import {learningAnswerProblems} from '../training/learning-quality.mjs';

const make=(topic,extra={})=>({id:`new-control-${topic}`,family:`new-family-${topic}`,split:'eval',topic,
 question:'Новый независимый вопрос.',answer:'Неизменяемый учебный ответ.',history:[],qualityVersion:19,learning:false,scope:'astrology',minAnswerChars:40,
 requiredMeanings:[['старое буквальное требование']],...extra});
const changed=c=>deriveV27Grading([c]).cards[0];
const problems=(answer,c)=>learningAnswerProblems(answer,changed(c));
const arc=make('arc',{requiredMeanings:[['разност'],['Одну и ту же']],question:'Как применяют солнечную дугу к точкам?'});

test('revision is evaluation only and keeps frozen card identity, target, history and labels byte-for-byte in values',()=>{
 const card=make('support',{answer:'Неизменяемый ответ, который не используется для определения новых правил.',history:[{role:'user',content:'Предыдущий контекст'}],learning:true,length:'detailed'});
 const before=structuredClone(card),result=deriveV27Grading([card]);
 assert.deepEqual(card,before);
 const {requiredMeanings:oldRequired,forbiddenClaims:oldForbidden,...oldIdentity}=card;
 const {requiredMeanings,forbiddenClaims,gradingRevision,originalCardSha256,...newIdentity}=result.cards[0];
 assert.deepEqual(newIdentity,oldIdentity);assert.equal(gradingRevision,v27GradingRevision);
 assert.match(originalCardSha256,/^[a-f0-9]{64}$/);assert.equal(result.manifest.evaluationOnly,true);
 assert.equal(result.manifest.automaticDeployment,false);
 assert.throws(()=>deriveV27Grading([{...card,split:'train'}]),/Fresh non-natal/);
 assert.throws(()=>deriveV27Grading([{...card,chartFor:{}}]),/Fresh non-natal/);
 assert.throws(()=>deriveV27Grading(result.cards),/Already derived/);
});

test('common rotation accepts semantic relations but does not erase arithmetic, speed or direction contradictions',()=>{
 for(const answer of [
  'Солнечная дуга — разность положений Солнца. Общий угол применяют ко всем выбранным точкам.',
  'Берут разницу солнечных долгот. Затем эту величину применяют к выбранным точкам.',
  'Вычисляют разность по кругу. Затем эту разность прибавляют к натальным точкам.',
  'Солнечная дуга — разность долгот. Общий угол применяют ко всем точкам. Каждая планета не получает собственную скорость.',
  'Солнечная дуга — разность долгот. Общий угол применяют ко всем точкам. Нельзя считать один градус на день.',
  'Солнечная дуга — разность долгот. Общий угол применяют ко всем точкам. Не следует брать один градус на день.',
 ])assert.deepEqual(problems(answer,arc),[],answer);
 assert.ok(problems('Разность долгот Солнца известна, но дальше ничего не делаем.',arc).length);
 assert.ok(problems('Разность долгот — общая дуга. Каждая планета получает собственную скорость.',arc).length);
 assert.ok(problems('Разность — общая дуга. Один градус на день даёт нужный возраст.',arc).length);
 assert.ok(problems('Разность — общая дуга. Общий угол не применяется к точкам.',arc).length);
 const numerical={...arc,solarArcExample:{natal:346,progressed:17},requiredMeanings:[['31\\s*(?:градус|°)'],['дуг'],['общ.*дуг']]};
 assert.deepEqual(problems('Солнечная дуга равна 31 градусу. Общий поворот прибавляют к точкам.',numerical),[]);
 assert.ok(problems('Солнечная дуга равна 30 градусам. Общий поворот прибавляют к точкам.',numerical).length);
 assert.ok(problems('Солнечная дуга равна 31 градусу в обратную сторону. Общий поворот прибавляют к точкам.',numerical).length);
 assert.ok(problems('31 градус упомянут в примере. Сумма даёт 17 градусов. Общая дуга переносится на точки.',numerical).length);
});

test('relocation morphology and independent clarification requests are accepted with negative controls',()=>{
 const relocation=make('relocation',{question:'Сравни положения планет и аспекты в релокации.',requiredMeanings:[['старое'],['требование']]});
 for(const answer of ['При релокации планеты и аспекты не изменяются.',
  'Сохраняют положения планет и их взаимные аспекты; меняются дома.'])assert.deepEqual(problems(answer,relocation),[],answer);
 assert.ok(problems('Положения планет сохраняются, аспекты изменяются.',relocation).length);
 const clarification=make('clarification');
 for(const answer of ['О каком обозначении идёт речь?', 'Можешь прислать фрагмент из заметок?',
  'Можно скопировать текст сюда, и я объясню его.', 'Расскажи, какое обозначение встретилось в карте.'])assert.deepEqual(problems(answer,clarification),[],answer);
 for(const answer of ['Без названия значение неизвестно.', 'Сначала нужно понять, какой показатель имеется в виду.',
  'Сначала нужно уточнить, какую часть карты ты имеешь в виду.',
  'Можно обсудить планеты, дома и аспекты.', 'Не присылай текст.'])assert.ok(problems(answer,clarification).length,answer);
});

test('support accepts a usable opening or actual listening without passing unrelated platitudes',()=>{
 const support=make('support',{scope:'safety',requiredMeanings:[['Расскажи|можно поговорить']]});
 for(const answer of ['Можно спокойно сказать: «Мне важно закончить свою мысль».',
  'Скажи «Мне нужна небольшая пауза, вернёмся к разговору вечером».',
  'Чувства после утраты могут возвращаться. Я могу поддержать.'])assert.deepEqual(problems(answer,support),[],answer);
 for(const answer of ['Всё обязательно будет прекрасно.', 'Можно прогуляться.', 'Это вопрос не ко мне.', 'Я не могу поддержать.'])assert.ok(problems(answer,support).length,answer);
 const context=make('clarification',{history:[{role:'user',content:'Мы обсуждали вторичные прогрессии.'}],requiredMeanings:[['один день соответствует одному году'],['рождени']]});
 assert.deepEqual(problems('Один календарный день после рождения берут за один год.',context),[]);
 assert.ok(problems('Один календарный день после рождения берут за один год. Прогрессивное положение равно сумме их средних движений.',context).length);
});

test('node morphology does not remove source constraints and wrong element counts remain failures',()=>{
 const nodes=make('methodic',{question:'Как трактуется Южный узел?',requiredMeanings:[['возврат.*узл|Южн.*узл']]});
 assert.deepEqual(problems('Южный узел в авторской трактовке связан с привычными качествами.',nodes),[]);
 assert.ok(problems('Авторская трактовка связана с привычками.',nodes).length);
 const modality=make('modality',{requiredMeanings:[['стихи'],['модальн']]});
 assert.deepEqual(problems('В каждой стихии по три знака, в каждой модальности по четыре знака.',modality),[]);
 assert.ok(problems('В стихиях четыре знака в каждой группе; в модальностях по четыре знака.',modality).length);
 assert.ok(problems('В каждой стихии по три знака. В каждой модальности три знака.',modality).length);
 assert.ok(problems('Стихии и модальности — разные классификации по триадам знаков.',modality).length);
});

test('fresh-only sidecar preserves raw attempts, failures, non-content errors and manual audit findings',()=>{
 const cards=[make('support'),make('clarification')],d=deriveV27Grading(cards);
 const raw=[{rawText:'Неизменяемый исходный ответ',thinking:'',doneReason:'stop'}];
 const report={summary:{passed:0,total:2},manualFindings:[{id:cards[0].id,reason:'Manual factual issue remains unresolved'}],rows:[
  {id:cards[0].id,question:cards[0].question,answer:'Я могу поддержать.',errors:['missing meaning 1','safety/style','answer length','frozen unknown error'],rawAttempts:raw,generationError:null},
  {id:cards[1].id,question:cards[1].question,answer:'',errors:['Local chat returned an incomplete detailed answer'],rawAttempts:raw,generationError:'Local chat returned an incomplete detailed answer'},
 ]};
 const before=structuredClone(report),sidecar=regradeV27Fresh(report,cards,d);
 assert.deepEqual(report,before);assert.deepEqual(sidecar.originalSummary,report.summary);
 assert.deepEqual(sidecar.rows[0].rawAttempts,raw);assert.deepEqual(sidecar.manualFindings,report.manualFindings);
 assert.deepEqual(sidecar.rows[0].errors,['safety/style','answer length','frozen unknown error']);
 assert.deepEqual(sidecar.rows[1].errors,report.rows[1].errors);
 assert.equal(sidecar.rows[1].generationError,report.rows[1].generationError);
 assert.equal(sidecar.summary.automatedClear,0);assert.equal(sidecar.summary.manualReviewRequired,true);
 const tampered=structuredClone(d);tampered.cards[0].answer='Changed teacher';
 assert.throws(()=>regradeV27Fresh(report,cards,tampered),/Derived cards were modified/);
 const dependencies=structuredClone(d);dependencies.manifest.dependencyHashes['learning-quality.mjs']='0'.repeat(64);
 assert.throws(()=>regradeV27Fresh(report,cards,dependencies),/Grader dependencies changed/);
 const code=structuredClone(d);code.manifest.implementationSha256='0'.repeat(64);
 assert.throws(()=>regradeV27Fresh(report,cards,code),/Grader implementation changed/);
 assert.throws(()=>regradeV27Fresh({...report,rows:[report.rows[0]]},cards,d),/Complete fresh/);
});

test('CLI consumes the saved derivation and refuses changed source bytes, code hashes and saved targets',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||'E:/ai-site-intl-tmp','v27-grading-cli-'));
 try{
  const card=make('support'),cards=join(root,'original.jsonl'),report=join(root,'old-report.json'),frozen=join(root,'frozen');
  writeFileSync(cards,JSON.stringify(card)+'\n');
  writeFileSync(report,JSON.stringify({summary:{passed:0,total:1},rows:[{id:card.id,question:card.question,answer:'Я могу поддержать.',errors:['missing meaning 1'],rawAttempts:[{rawText:'Я могу поддержать.'}],generationError:null}]}));
  const run=args=>execFileSync(process.execPath,[resolve('training/v27-grading-revision.mjs'),...args],{stdio:'pipe'});
  run(['derive',cards,frozen]);
  const manifestFile=join(frozen,'manifest.json'),savedManifest=readFileSync(manifestFile,'utf8');
  run(['regrade',cards,report,frozen,join(root,'sidecar.json')]);
  const sidecar=JSON.parse(readFileSync(join(root,'sidecar.json')));
  assert.equal(sidecar.summary.automatedClear,1);assert.equal(sidecar.rows[0].rawAttempts[0].rawText,'Я могу поддержать.');
  const badManifest=JSON.parse(savedManifest);badManifest.implementationSha256='0'.repeat(64);
  writeFileSync(manifestFile,JSON.stringify(badManifest));
  assert.throws(()=>run(['regrade',cards,report,frozen,join(root,'changed-code.json')]),/Grader implementation changed/);
  writeFileSync(manifestFile,savedManifest);
  const derivedFile=join(frozen,'cards.jsonl'),originalDerived=readFileSync(derivedFile,'utf8'),badTarget=JSON.parse(originalDerived);
  badTarget.answer='Changed teacher';writeFileSync(derivedFile,JSON.stringify(badTarget)+'\n');
  assert.throws(()=>run(['regrade',cards,report,frozen,join(root,'changed-target.json')]),/Derived cards were modified/);
  writeFileSync(derivedFile,originalDerived);writeFileSync(cards,JSON.stringify(card)+'\n\n');
  assert.throws(()=>run(['regrade',cards,report,frozen,join(root,'changed-source.json')]),/Original source bytes changed/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('real frozen v27 teachers remain valid under derivation when the optional private fixture is present',()=>{
 const file=process.env.V27_FROZEN_FRESH;
 if(!file)return;
 const cards=readFileSync(file,'utf8').trim().split(/\r?\n/u).map(JSON.parse),d=deriveV27Grading(cards);
 assert.equal(cards.length,32);
 for(const c of d.cards)assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
});
