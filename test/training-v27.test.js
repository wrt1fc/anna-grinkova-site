import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculum27,curriculum27Counts} from '../training/curriculum-v27.mjs';
import {prepare27,selectReplay27,v27ParentAdapterSha256} from '../training/prepare-repair-v27.mjs';
import {learningAnswerProblems} from '../training/learning-quality.mjs';

const sourceNames=['030','058','060','017','034','036'];
const methodics={version:19,entries:sourceNames.map(n=>({id:`method19-${n}`,sourceId:`private-${n}`,sourceSha256:'a'.repeat(64),
 status:'reviewed-adaptation-draft-not-Anna-approved',scope:n==='060'?'support':'astrology',evidence:['Private fixture evidence.'],
 reference:'Private fixture reference with independently reviewed context.',paragraphStart:2,paragraphEnd:7,
 answer:'Это проверенная авторская трактовка из частного источника. Она не устанавливает факты личной биографии и не гарантирует результат.',requiredMeanings:[['авторская трактовка']],
}))};
const original=[...Array.from({length:931},(_,i)=>({
 id:`original-${i}`,family:`old-family-${i%41}`,split:'train',question:`Историческая учебная запись под номером ${i}`,learning:i%2===0,
 scope:['astrology','service','safety','offtopic'][i%4],answer:i<66?'Развёрнутая исходная интерпретация. '.repeat(15):'Исходный ответ.',
 ...(i<80?{chartFor:{birthUtc:`1990-01-01T00:00:00Z`,latitude:55.75,longitude:37.62}}:{}),
 ...(i>=100&&i<161?{sourceId:`source-${i}`}:{})
})),...Array.from({length:246},(_,i)=>({id:`dev-${i}`,family:`dev-family-${i}`,question:`Старое контрольное задание ${i}`,split:'eval',answer:'Контрольный ответ.',learning:false}))];
const parent=[...original.filter(c=>c.split==='train').slice(0,320),
 ...Array.from({length:112},(_,i)=>({id:`v26-train-theory-${i}`,family:`v26-theory-${i}`,split:'train',question:`Ранее изученная теория ${i}`,answer:'Сохранённая теория.',learning:false})),
 ...Array.from({length:72},(_,i)=>({id:`v26-money-${i}`,family:`v26-money-${i}`,split:'train',question:`Предыдущий личный разбор ${i}`,answer:'Сохранённый расчёт.',learning:false,chartFor:{birthUtc:'1980-01-01T00:00:00Z',latitude:48,longitude:44}})),
 ...original.filter(c=>c.split==='eval')];
const archives=[{id:'previous-heldout',family:'previous-heldout',split:'eval',question:'Прежний опубликованный контроль',answer:'Прежний ответ.',learning:false}];

test('v27 has 64 new teachers and 32 separate controls across eight declared families',()=>{
 const c=curriculum27(methodics);
 assert.equal(c.train.length,64);assert.equal(c.eval.length,32);
 for(const [topic,[train,control]]of Object.entries(curriculum27Counts)){
  assert.equal(c.train.filter(c=>c.topic===topic).length,train);
  assert.equal(c.eval.filter(c=>c.topic===topic).length,control);
 }
 for(const row of [...c.train,...c.eval]){
  assert.deepEqual(learningAnswerProblems(row.answer,row),[],row.id);
  assert.ok(row.answer.length<900,row.id);
  if(row.length==='detailed')assert.ok(row.answer.length>=400,row.id);
 }
 assert.equal(c.train.filter(c=>c.topic==='support'&&c.length==='detailed').length,2);
 assert.ok(c.train.some(c=>c.topic==='arc'&&c.length==='detailed'));
 assert.equal(new Set([...c.train,...c.eval].map(c=>c.question)).size,96);
 const trainedNumbers=new Set(c.train.filter(c=>c.solarArcExample).map(c=>JSON.stringify(c.solarArcExample)));
 assert.ok(c.eval.filter(c=>c.solarArcExample).every(c=>!trainedNumbers.has(JSON.stringify(c.solarArcExample))));
});

test('private source content is supplied only from verified preparation input',()=>{
 assert.throws(()=>curriculum27(),/private methodics/);
 const bad=structuredClone(methodics);bad.entries[0].status='unreviewed';
 assert.throws(()=>curriculum27(bad),/Unverified private source/);
 for(const c of curriculum27(methodics).train.filter(c=>c.topic==='methodic')){
  assert.match(c.sourceId,/^private-/);assert.equal(c.sourceSha256,'a'.repeat(64));
  assert.deepEqual(c.paragraphs,[2,7]);assert.match(c.history[0].content,/Private fixture reference/);
 }
});

test('v27 labels match educational intent and fresh rubrics accept meaning without verbatim teachers',()=>{
 const c=curriculum27(methodics),byId=id=>c.eval.find(row=>row.id===id);
 assert.equal(c.train.filter(row=>row.learning).length,34);
 for(const row of [...c.train,...c.eval]){
  if(['arc','progression','relocation','modality'].includes(row.topic))assert.equal(row.learning,true,row.id);
  if(['support','offtopic'].includes(row.topic))assert.equal(row.learning,false,row.id);
 }
 const checks=[
  ['v27-eval-relocation-0','Из-за другого места расчёта дома меняются: меняются координаты горизонта.','Дома и место расчёта не меняются.'],
  ['v27-eval-relocation-1','Нет, дату первого рабочего дня брать нельзя. Сохраняют время рождения.','Да, первый рабочий день заменяет рождение.'],
  ['v27-eval-relocation-2','Планеты остаются в прежних положениях. Их геоцентрические аспекты не меняются.','Положения планет и аспекты не сохраняются.'],
  ['v27-eval-modality-0','Стихия и модальность — разные характеристики знака.','Стихия и модальность — одинаковая характеристика.'],
  ['v27-eval-modality-1','Кардинальное качество — начало. Фиксированное — сохранение. Мутабельное — адаптация.','Кардинальное качество — сохранение. Фиксированное — начало. Мутабельное — адаптация.'],
  ['v27-eval-modality-2','В каждой модальности по 4 знака; в каждой стихии по 3.','В каждой модальности по четыре знака, в каждой стихии по тридцать знаков.'],
  ['v27-eval-clarification-0','Пришли сам фрагмент карты. Какой показатель там выделен?','Я объясню показатель по карте без названия.'],
  ['v27-eval-clarification-3','Один день после рождения соответствует одному году жизни.','Один год соответствует двум дням после рождения.'],
  ['v27-eval-clarification-4','Момент рождения остаётся тем же, меняется место расчёта.','Момент рождения не сохраняется.'],
 ];
 for(const [id,good,bad]of checks){
  assert.deepEqual(learningAnswerProblems(good,byId(id)),[],id);
  assert.ok(learningAnswerProblems(bad,byId(id)).length,id+' rejects contrary answer');
 }
 for(const [id,answer]of [
  ['v27-eval-modality-1','Кардинальное качество — не начало. Фиксированное — не сохранение. Мутабельное — не адаптация.'],
  ['v27-eval-modality-2','В каждой модальности не четыре знака; в каждой стихии не три знака.'],
  ['v27-eval-clarification-3','Один день после рождения не соответствует одному году жизни.'],
  ['v27-eval-clarification-3','Один день после рождения соответствует двум годам жизни.'],
 ])assert.ok(learningAnswerProblems(answer,byId(id)).length,id+' rejects negated or incorrect relation');
});

test('384 replay retains all calculated, theory and long original teachers without mutation',()=>{
 const before=JSON.stringify([parent,original,archives,methodics]);
 const r=prepare27(parent,original,archives,methodics);
 assert.equal(r.cards.filter(c=>c.split==='train').length,448);
 assert.equal(r.holdout.length,32);assert.equal(r.replayCount,384);
 assert.equal(r.detailedOriginalPreserved,66);assert.equal(r.explicitDetailedOriginal,0);
 assert.equal(r.sourceReplayCoverage,61);
 assert.deepEqual(r.cards.filter(c=>c.split==='eval'),original.filter(c=>c.split==='eval'));
 for(const c of parent.filter(c=>c.split==='train'&&(c.chartFor||c.id.startsWith('v26-'))))assert.deepEqual(r.cards.find(x=>x.id===c.id),c,c.id);
 for(const c of original.slice(0,66))assert.deepEqual(r.cards.find(x=>x.id===c.id),c,c.id);
 assert.equal(JSON.stringify([parent,original,archives,methodics]),before);
 assert.equal(r.regression[0].evaluationStatus,'EXPOSED_PRE_V27_REGRESSION_NOT_FRESH');
 assert.ok(r.holdout.every(c=>c.evaluationStatus.includes('UNTIL_FIRST_BASELINE')));
 assert.match(v27ParentAdapterSha256,/^[a-f0-9]{64}$/);
});

test('preparation rejects leaked wording/families, missing replay and incomplete detailed teachers',()=>{
 const c=curriculum27(methodics);
 assert.throws(()=>prepare27(parent,original,[...archives,{...archives[0],id:'exposed-new',question:c.train[0].question}],methodics),/previously exposed/);
 const leaked=structuredClone(c);leaked.eval[0].family=leaked.train[0].family;
 assert.throws(()=>prepare27(parent,original,archives,methodics,leaked),/family leaked/);
 const near=structuredClone(c);near.eval[0].question=near.train[0].question+' Пожалуйста.';
 assert.throws(()=>prepare27(parent,original,archives,methodics,near),/wording too similar/);
 const short=structuredClone(c),d=short.train.find(c=>c.length==='detailed');d.answer='Краткий ответ.';
 assert.throws(()=>prepare27(parent,original,archives,methodics,short),/Incomplete detailed teacher/);
 assert.throws(()=>selectReplay27(parent.slice(1),original),/v26 train count/);
});
