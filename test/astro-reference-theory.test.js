import {test} from 'node:test';
import assert from 'node:assert/strict';
import {astroReference,sourceGroundedTheoryProblems} from '../server/astro-reference.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {curriculum25} from '../training/curriculum-v25.mjs';
import {astroFactProblems} from '../server/astro-fact-guard.js';
import {createLocalChat} from '../server/local-chat.js';

test('implicit ruler pairs and Sun-sign paraphrases retrieve their source facts',()=>{
 for(const question of ['Учу пары: можно ли считать Уран главным у Козерога?','Кто главный у Рыб?','У Козерога какая пара планет?']){
  const reference=astroReference(question);
  assert.ok(reference?.topics.includes('ruler'),question);
  assert.match(reference.facts.join(' '),/Козерог — Сатурн\/Уран/u);
 }
 for(const question of ['Для учебы: знак Солнца указывает начало первого дома?','Как определить начало первого дома?'])assert.ok(astroReference(question)?.topics.includes('angles'),question);
});

test('Moon sign motion is retrieved for change and traversal morphology',()=>{
 for(const question of [
  'Проверяю утверждение: Луна обязана сменить знак к следующим суткам. Верно?',
  'Может ли Луна пройти знак всего за один день?',
  'Когда Луна перейдёт в другой знак?',
  'Луна свой знак сменит к завтрашнему утру?',
  'Почему Луна проходит по знаку больше суток?',
 ]){
  const reference=astroReference(question);
  assert.ok(reference?.topics.includes('moonMotion'),question);
  assert.match(reference.facts.join(' '),/два–три дня/u);
 }
 assert.equal(astroReference('Луна на фотографии напоминает красивый знак на небе.'),null);
});

test('zodiac qualities retrieve modalities without treating quality of life as astrology',()=>{
 for(const question of [
  'В учебнике нужно подписать качество Девы и Водолея. Какие подписи верны?',
  'Какое качество у знака? Качество знака Тельца объясни.',
  'Скорпион — какое качество?',
  'Качества Близнецов и Рака в таблице модальностей различаются?',
 ]){
  const reference=astroReference(question);
  assert.ok(reference?.topics.includes('modality'),question);
  assert.match(reference.facts.join(' '),/Мутабельные: Близнецы, Дева/u);
 }
 for(const question of ['Как улучшить качество жизни?','Какое качество общения ценят люди?','Расскажи о качестве сна Девы.','Качество чувств волнует меня.'])assert.equal(astroReference(question),null,question);
 assert.deepEqual(astroReference('Подпиши качество Девы и Водолея.').computed.signModalities,{Дева:'мутабельная',Водолей:'фиксированная'});
});

test('explicit angle exercises include computed difference and inclusion from the shared numeric source',()=>{
 const examples=[
  ['Фактический угол равен 118°, точный трин 120°, допуск 3°. Входит?',{actual:118,exact:120,limit:3,deviation:2,within:true}],
  ['Угол: 66°, точный секстиль: 60°, предел: 4°. Как проверить?',{actual:66,exact:60,limit:4,deviation:6,within:false}],
  ['Угол 88,5°, точный квадрат 90°, орбис 1,5°. Что получается?',{actual:88.5,exact:90,limit:1.5,deviation:1.5,within:true}],
 ];
 for(const [question,expected]of examples){
  const reference=astroReference(question);
  assert.deepEqual(reference.computed.orbExample,expected,question);
  const fact=reference.facts.join(' ');
  assert.ok(fact.includes(`составляет ${expected.deviation}°`),question);
  assert.ok(fact.includes(`аспект ${expected.within?'входит':'не входит'} в этот допуск`),question);
 }
 for(const question of ['Угол 118°, точный трин 120°: как выбрать допуск?','Орбис 4°, но сам угол неизвестен.','Угол 500°, точный квадрат 90°, допуск 3°.'])assert.equal(astroReference(question)?.computed?.orbExample,undefined,question);
});

test('theory claims are checked against the ordered ruler source without card-specific wording',()=>{
 for(const answer of [
  'Уран управляет Овном.',
  'Управитель Овна — Уран.',
  'У Козерога главный управитель — Уран.',
  'Уран является главным управителем Козерога.',
  'У Козерога учитывают две планеты. Главный управитель — Уран, соуправитель — Сатурн.',
  'У Рыб главный управитель — Юпитер.',
  'Знак Солнца указывает начало первого дома.',
  'Да, знак Солнца определяет куспид 1 дома.',
 ]){
  assert.ok(sourceGroundedTheoryProblems(answer).length,answer);
  assert.ok(learningAnswerProblems(answer,{requiredMeanings:[]}).length,answer);
 }
});

test('correct primary/co-rulers and explicit negations do not fail',()=>{
 for(const answer of [
  'У Козерога главный управитель — Сатурн, соуправитель — Уран.',
  'Уран управляет Козерогом и Водолеем.',
  'Уран не управляет Овном.',
  'Уран не является главным управителем Козерога.',
  'Нельзя считать Уран главным у Козерога.',
  'У Козерога не Уран главный управитель, а Сатурн.',
  'Знак Солнца не указывает начало первого дома.',
  'Нет, знак Солнца и начало первого дома — разные данные.',
  'Уран управляет Овном?',
 ])assert.deepEqual(sourceGroundedTheoryProblems(answer),[],answer);
});

test('source checks accept all existing v25 reference answers',()=>{
 for(const card of Object.values(curriculum25()).flat())assert.deepEqual(sourceGroundedTheoryProblems(card.answer),[],card.id);
});

test('Sun-on-cusp inference is rejected only in the relevant general question',()=>{
 const question='Знак Солнца указывает начало первого дома?';
 const answer='Солнце в первом доме — это начало, и оно действительно стоит в куспиде первого дома.';
 assert.ok(sourceGroundedTheoryProblems(answer,{question}).length);
 assert.ok(learningAnswerProblems(answer,{question,requiredMeanings:[]}).length);
 assert.deepEqual(sourceGroundedTheoryProblems(answer,{question:'Где находится Солнце в рассчитанной карте?'}),[]);
 assert.deepEqual(sourceGroundedTheoryProblems('Знак Солнца не означает, что Солнце стоит на куспиде первого дома.',{question}),[]);
});

test('runtime diagnostics include source-backed corrections for both theory families',()=>{
 for(const [answer,question,expected]of [
  ['У Козерога главный управитель — Уран.','Кто главный у Козерога?',/Козерог: главный управитель — Сатурн, соуправитель — Уран/u],
  ['Знак Солнца указывает начало первого дома.','Объясни начало дома.',/начало первого дома — асцендент/u],
 ]){
  const issues=astroFactProblems(answer,{question});
  assert.ok(issues.length);
  for(const issue of issues){assert.equal(typeof issue.code,'string');assert.equal(typeof issue.correction,'string');}
  assert.match(issues[0].correction,expected);
 }
});

test('repeated theory errors produce a corrected fallback with model null',async()=>{
 const keys=['CHAT_MODEL_PROTOCOL','CHAT_FACT_GUARD'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.CHAT_MODEL_PROTOCOL='19';process.env.CHAT_FACT_GUARD='1';
  for(const [message,bad,expected]of [
   ['Учу пары: можно ли считать Уран главным у Козерога?','У Козерога главный управитель — Уран, соуправитель — Сатурн.',/Козерог: главный управитель — Сатурн, соуправитель — Уран/u],
   ['Для учебы: знак Солнца указывает начало первого дома?','Солнце в первом доме — это начало, и оно действительно стоит в куспиде первого дома.',/начало первого дома — асцендент/u],
  ]){
   const inputs=[];
   const chat=createLocalChat({model:'anna-test',learningSignals:false,fetchImpl:async(url,options)=>{
    inputs.push(JSON.parse(options.body));
    return {ok:true,body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({response:bad+'\n[[LEARNING_NONE]]',done:true,done_reason:'stop'})+'\n'));controller.close();}})};
   }});
   const result=await chat.answer({message,history:[],forecast:{date:'2026-11-10'}});
   assert.equal(inputs.length,2);
   assert.match(inputs[1].system,expected);
   assert.equal(result.model,null);
   assert.equal(result.groundedFallback,true);
   assert.equal(result.factFiltered,true);
   assert.match(result.answer,expected);
  }
 }finally{
  for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
 }
});
