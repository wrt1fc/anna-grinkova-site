// New editorial teachers; synthetic profiles only. Prior serialized replay is preserved.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chatPrompt,firstPassSystem,historyForQuestion,chatForecastContext,forecastForQuestion} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {chartContext} from '../server/chat-grounding.js';
import {wrongCalculatedClaim,groundedNatalAnswer,personalSolarSignAnswer} from '../server/chart-answer-check.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import scope from '../config/chat-scope.json' with {type:'json'};
const [parent,out]=process.argv.slice(2);
assert.ok(parent&&out&&!fs.existsSync(out),'Need existing parent and NEW output directory');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const cards=[], newData={train:[],eval:[]};
assert.equal(process.env.CHAT_MODEL_PROTOCOL,'19','Match active serving protocol');
assert.equal(process.env.ANNA_TRAINING_PROMPT_VERSION,'18','Match active serving prompt');
const forecast=chatForecastContext(forecastForDate('2026-11-12'));
const add=(split,topic,question,answer,extra={})=>{
 const c={id:`v28-${split}-${topic}-${cards.length}`,family:`v28-${split}-${topic}`,split,topic,question,answer,
  scope:topic==='offtopic'?'offtopic':'astrology',learning:false,qualityVersion:19,status:'draft',
  origin:'synthetic-editorial-not-Anna-approved',minAnswerChars:30,...extra};
 const history=c.history??[];
 const profile=c.chartFor?{birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude}:null;
 const {chart}=chartContext(profile,question,new Date('2026-11-12T09:00:00Z'),{history});
 assert.deepEqual(learningAnswerProblems(answer,c),[],c.id);
 assert.equal(wrongCalculatedClaim(answer,chart),false,c.id);
 const prompt=chatPrompt({message:question,history:historyForQuestion(history,question),chart,forecast:forecastForQuestion(forecast,question),materials:[],length:'medium'});
 newData[split].push({id:c.id,prompt:[{role:'system',content:firstPassSystem({message:question,chart,history,learningSignals:true,length:'medium'})},{role:'user',content:prompt}],completion:[{role:'assistant',content:answer+'\n[[LEARNING_NONE]]'}],chat_template_kwargs:{enable_thinking:false}});
 cards.push(c);
};
const groups=[
 ['growth',['Что поможет мне расти в профессии?','Как перестать топтаться на месте в карьере?','Как развиваться в выбранном деле?','Дай план профессионального роста.','Как перейти к более сложным задачам?','Какими действиями повысить свой рабочий уровень?'],
 'Начни с одного навыка, который нужен для следующего уровня в твоей работе. Возьми небольшую задачу, где сможешь его применить. После выполнения попроси обратную связь и выбери, что улучшить. В какой сфере ты сейчас работаешь? Так можно составить конкретный план.'],
 ['skills',['Какие навыки мне развивать для карьерного роста?','Чему учиться для роста на работе?','Как понять, какого умения мне не хватает?','Какие рабочие способности стоит подтянуть?','Как выбрать обучение для следующей должности?','Что освоить, чтобы улучшить результат в профессии?'],
 'Сначала выбери рабочую задачу, которая пока даётся трудно. Раздели её на умения: например, объяснить идею, спланировать сроки или договориться с коллегой. Выбери одно умение и потренируй его на небольшой задаче. Расскажи о своей профессии и цели — тогда совет будет точнее.'],
 ['promotion',['Как мне добиться повышения на нынешней работе?','Как подготовиться к разговору о новой должности?','Что сделать перед просьбой о повышении?','Как показать руководителю свой вклад?','Хочу больше ответственности: с чего начать?','Как обсудить переход на следующий уровень с начальником?'],
 'Собери два-три примера результата своей работы: что изменилось благодаря твоим действиям. Уточни у руководителя критерии новой должности и предложи задачу, на которой сможешь их показать. Договорись о сроке следующего разговора. Карта не может гарантировать повышение.'],
 ['budget',['Почему мне сложно откладывать деньги?','Как начать копить небольшую сумму?','Как удержаться от лишних покупок?','Что поможет привести расходы в порядок?','Почему к концу месяца ничего не остаётся?','Как сделать накопления привычкой?'],
 'Причину трудно понять без твоих доходов и расходов. Для начала запиши обязательные платежи и недавние покупки. Посмотри, какие траты можно уменьшить без ущерба необходимому. Выбери небольшую посильную сумму для накопления. Если дохода едва хватает на основное, это тоже важно учитывать, а не винить себя.'],
 ['support',['Я боюсь потерять доход. Как справиться с этой тревогой?','Переживаю из-за денег, мне нужна поддержка.','Меня пугает неопределённость на работе.','Мне страшно ошибиться в профессии.','Не могу успокоиться перед рабочим разговором.','Боюсь, что не справлюсь с новой задачей.'],
 'Похоже, сейчас много тревоги. Попробуй отделить то, что уже произошло, от того, чего ты опасаешься. Выбери одно небольшое действие, на которое можешь повлиять сегодня, и оставь время для отдыха. Можно попросить близкого человека выслушать тебя. Если тревога постоянно мешает спать и жить, обсуди её с психологом.'],
 ['rest',['Как мне восстанавливаться после работы?','Как перестать думать о задачах вечером?','Что делать с усталостью после рабочего дня?','Как дать себе отдых без чувства вины?','Как перейти из рабочего режима в домашний?','После смены нет сил: с чего начать восстановление?'],
 'Начни с простого: поесть, отдохнуть и на время убрать рабочие сообщения. Выбери спокойное занятие, после которого тебе обычно легче. Если сил мало, не добавляй ещё один план достижений. При постоянной сильной усталости стоит обсудить нагрузку и обратиться к врачу: причину нельзя определить по карте.'],
 ['offtopic',['почему не работает отопление','Почему не работает интернет?','Как починить двигатель автомобиля?','Исправь мой код на Python.','Почему холодильник перестал охлаждать?','Помоги настроить домашний роутер.'],scope.reply],
];
for(const [topic,questions,answer]of groups)questions.forEach((q,i)=>add(i<4?'train':'eval',topic,q,answer));
// Different birth profiles in the two splits: no customer's screenshot data.
const profiles=['1986-02-09T04:20:00Z','1993-08-21T16:10:00Z','1978-12-05T11:45:00Z','2001-04-17T07:25:00Z','1989-10-28T18:50:00Z','1996-06-02T02:35:00Z','1982-03-25T08:15:00Z','1998-09-11T13:40:00Z','1975-01-19T21:05:00Z'];
for(const [i,birthUtc]of profiles.entries()){
 const split=i<6?'train':'eval';
 const chartFor={birthUtc,latitude:i<6?55.75:59.93,longitude:i<6?37.62:30.31};
 const profile={birthUtc,birthLatitude:chartFor.latitude,birthLongitude:chartFor.longitude};
 const questions=split==='train'?['Что главное в моей натальной карте?','Какие у меня сильные стороны?','кто я по гороскопу','Какой у меня знак зодиака?','Объясни мою натальную карту простыми словами.']:['С чего начать понимание моей натальной карты?','Какие сильные стороны есть в моей натальной карте?','Назови мой солнечный знак.','Я спрашиваю только знак зодиака. Назови его.','Расскажи о главных чертах по моей натальной карте без сложных слов.'];
 for(const [j,q]of questions.entries()){
  const history=j===3?[{role:'user',content:'Какие у меня сильные стороны?'},{role:'assistant',content:'Давай разберём твою карту.'}]:[];
  const {chart}=chartContext(profile,q,new Date('2026-11-12T09:00:00Z'),{history});
  assert.ok(chart?.calculated?.positions?.sun,'Missing personal grounding '+q);
  const answer=j===2||j===3?personalSolarSignAnswer(chart):groundedNatalAnswer(chart,j===1?'Какие у меня сильные стороны?':q);
  add(split,'personal-'+j,q,answer,{chartFor,history});
 }
}
const parentCards=read(join(parent,'cards.jsonl'));
const oldTrain=read(join(parent,'data/train.jsonl')),oldEval=read(join(parent,'data/eval.jsonl'));
assert.equal(oldTrain.length,448);assert.equal(oldEval.length,246);
const ids=new Set([...oldTrain,...oldEval].map(r=>r.id));
for(const c of cards){assert.ok(!ids.has(c.id));ids.add(c.id);}
const heldProfiles=new Set(cards.filter(c=>c.split==='eval'&&c.chartFor).map(c=>c.chartFor.birthUtc));
assert.ok(cards.filter(c=>c.split==='train'&&c.chartFor).every(c=>!heldProfiles.has(c.chartFor.birthUtc)));
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(join(out,'data'));
const write=(file,rows)=>fs.writeFileSync(join(out,file),rows.map(c=>JSON.stringify(c)).join('\n')+'\n');
write('cards.jsonl',[...parentCards,...cards.filter(c=>c.split==='train')]);
write('holdout.jsonl',cards.filter(c=>c.split==='eval').map(c=>({...c,evaluationStatus:'held-out-profile-or-wording; shared editorial concept; not blind after baseline'})));
write('regression.jsonl',[...read(join(parent,'regression.jsonl')),...read(join(parent,'holdout.jsonl'))]);
write('data/train.jsonl',[...oldTrain,...newData.train]);write('data/eval.jsonl',oldEval);
write('data/heldout.jsonl',newData.eval);
fs.copyFileSync(join(parent,'methodics.json'),join(out,'methodics.json'));
const manifest={version:28,parent:'anna-v27',parentAdapterSha256:'62edafbe44d5110035ec6f2ca992c5d8b0d8ef8c6cfbdc0d26c752b745cdaa7c',replay:448,newTrain:newData.train.length,totalTrain:448+newData.train.length,development:246,heldout:newData.eval.length,regression:88,automaticDeployment:false,epochs:2,lr:5e-6,sourceParentCardsSha256:hash(fs.readFileSync(join(parent,'cards.jsonl'))),limitations:'Editorial drafts, not Anna-approved. Replay bytes are retained as rows. New examples use production protocol without learning offers. Shared concepts and some questions are known; heldout profiles/wording are excluded from training. Forecast calculation is server-owned, not retrained.'};
fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));

