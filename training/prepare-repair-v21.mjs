import fs from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {curriculum21} from './curriculum-v21.mjs';
import {learningAnswerProblems} from './learning-quality.mjs';
import {hasFormalAddress,conversationalOpening} from '../server/chat-style.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

const [source,opened,out]=process.argv.slice(2);
if(!out||fs.existsSync(out))throw Error('Expected v20-r4 cards, exposed controls and NEW output directory');
const read=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const old=read(source),previousControls=read(opened),cards=structuredClone(old);
assert.equal(old.filter(c=>c.split==='train').length,1025);
assert.equal(old.filter(c=>c.split==='eval').length,246);
assert.equal(previousControls.length,56);
assert.equal(new Set(old.map(c=>c.id)).size,old.length);
assert.equal(new Set(previousControls.map(c=>c.id)).size,previousControls.length);

// The r4 controls remain evaluation-only. New repairs receive new IDs and never overwrite r4.
const rows=curriculum21();
for(const [i,r]of rows.entries())cards.push({
 id:'repair21-train-'+(i+1),family:'repair21-train-'+(i+1),split:'train',qualityVersion:19,
 question:r.question,answer:conversationalOpening(r.answer,[]),learning:r.learning,scope:r.scope,
 sensitive:!!r.sensitive,requiredMeanings:r.requiredMeanings,minAnswerChars:30,
 origin:'v20-r4-manual-error-cluster-new-formulation',repairTopic:r.topic,
});

const freshQuestions=[
 ['Назови обе планеты Льва и укажи главную.',true,[['Солнц'],'Луна',['главн']]],
 ['Плутон и Луна вместе управляют Львом?',true,[['нет|не'],['Солнц'],'Луна','Плутон']],
 ['Какие две планеты ведут Овен и кто из них главный?',true,[['Марс'],'Плутон',['главн']]],
 ['У Рака только один управитель — Луна?',true,[['нет|не'],['Солнц'],'Луна']],
 ['Назови управителей Скорпиона без подмены знаком Льва.',true,[['Плутон'],'Марс']],
 ['Какие управители у Стрельца по таблице методики?',true,[['Юпитер'],'Нептун']],
 ['У Рыб главный Юпитер или Нептун? Назови обе планеты.',true,[['Нептун'],'Юпитер',['главн']]],
 ['Чем список управителей Козерога отличается от списка Водолея?',true,[['Сатурн'],'Уран',['главн']]],
 ['Куспид пятого дома во Льве, а внутри стоит Луна. Какие у неё роли?',true,[['соуправител'],'участниц|положен']],
 ['Десятый дом в Козероге. Каких управителей ищем в карте?',true,[['Сатурн'],'Уран']],
 ['Куспид шестого дома в Овне. Доказывает ли это положение Марса в шестом?',true,[['не|нет'],['Марс'],'Плутон',['расчёт|куспид']]],
 ['Что буквально означает запись 2#7?',true,[['управител'],['второго|2'],['седьмом|7']]],
 ['Управители второго дома стоят в седьмом и десятом домах. Запиши обе формулы.',true,[['2#7'],'2#10']],
 ['Формула повторилась ровно три раза. Достигнут ли порог активной темы?',true,[['три|3'],'активн']],
 ['2#7 повторилась дважды и 2#10 один раз. Можно сложить их до активной темы?',true,[['нет|нельзя|не'],['разн|одинаков'],['три|3']]],
 ['Если дом земной по знаку куспида, означает ли это автоматически фиксированную модальность?',false,[['модальност'],['стихи|земн']]],
 ['Между планетами 119°, точный трин 120°, предел 2°. В допуске?',true,[['1|один'],['входит|не превыш']]],
 ['Натальное Солнце 355°, прогрессивное 14°. Найди солнечную дугу.',true,[['19|девятнадцать'],'градус']],
 ['Можно ли по положению Венеры в Овне узнать её дом?',true,[['нет|нельзя|не'],['расчёт|куспид|данн']]],
 ['Объясни значение Сатурна простыми словами и без наставлений.',false,[['границ|опор'],['постепен|выдержк|результат']]],
 ['Не приглашай на обучение. Что означает активная формула?',false,[['три|3'],'активн']],
 ['Может ли карта гарантировать рост дохода через партнёрство при формуле 2#7?',false,[['не|нет'],['гарант|обеща'],['символ|тема|связ']]],
 ['Как тебя называть, если я ещё не указал имя и пол?',false,[['Фортуна']]],
 ['Мне тревожно ждать анализы. Просто побудь рядом.',false,[['рядом|здесь'],['расскаж|послуша|выслуша']],'safety',true],
];
const holdout=[...structuredClone(previousControls),...freshQuestions.map(([question,learning,requiredMeanings,scopeName,sensitive],i)=>({
 id:'repair21-control-'+(i+1),family:'repair21-control-'+(i+1),split:'eval',qualityVersion:19,
 scope:scopeName||'astrology',sensitive:!!sensitive,question,learning,
 requiredMeanings:requiredMeanings.map(m=>Array.isArray(m)?m:[m]),minAnswerChars:30,
}))];

for(const c of cards.filter(c=>c.id.startsWith('repair21-train-'))){
 assert.equal(hasFormalAddress(c.answer),false,c.id);
 assert.equal(!!unsafeChatAnswer(c.answer,'2026-11-02'),false,c.id);
 assert.deepEqual(learningAnswerProblems(c.answer,c),[],c.id);
}
for(const c of old)assert.deepEqual(cards.find(x=>x.id===c.id),c,'Changed an r4 card: '+c.id);
for(const c of previousControls)assert.deepEqual(holdout.find(x=>x.id===c.id),c,'Changed an exposed control: '+c.id);
assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
assert.equal(new Set(holdout.map(c=>c.id)).size,holdout.length);
const existingQuestions=new Set([...old,...previousControls].map(c=>c.question));
for(const r of rows)assert.equal(existingQuestions.has(r.question),false,'Repair copies an exposed question: '+r.question);
const newQuestions=[...rows.map(r=>r.question),...freshQuestions.map(r=>r[0])];
assert.equal(new Set(newQuestions).size,newQuestions.length,'New formulation duplicated');

fs.mkdirSync(out,{recursive:true});
for(const [name,items]of [['cards',cards],['holdout',holdout]])fs.writeFileSync(join(out,name+'.jsonl'),items.map(c=>JSON.stringify(c)).join('\n')+'\n');
const preparation={
 version:'repair-v21',train:cards.filter(c=>c.split==='train').length,eval:cards.filter(c=>c.split==='eval').length,
 fresh:holdout.length,addedTrain:rows.length,initAdapter:'anna-v19',epochs:1,lr:3e-6,
 promptVersion:18,referenceVersion:19,methodicsSha256:'16089c6fb654a2e81c451094b5d85eda65d6692002dcbf281a1ea90f918de06e',
 sourceSha256:sha(source),openedSha256:sha(opened),status:'PREPARED_NOT_TRAINED',
 limitations:'Synthetic repair drafts are not Anna-approved transcriptions. All r4 cards and controls are preserved. New controls vary known concepts and are not a fully independent exam. Runtime fact guard is disabled for model evaluation. No automatic deployment.',
};
fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(preparation,null,2));
console.log(JSON.stringify(preparation,null,2));
