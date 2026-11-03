// Evaluates learned decisions separately from the legacy rule fallback. Held-out families only.
// node training/eval-learning.mjs <model> <cards.jsonl> <report-prefix>
import {readFileSync,writeFileSync} from 'node:fs';
import {createLocalChat,chatForecastContext,forecastForQuestion,ANSWER_LENGTHS} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {learningInvitation,isLearningQuestion} from '../server/learning.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {hasFormalAddress} from '../server/chat-style.js';
import {chartContext} from '../server/chat-grounding.js';
import {learningAnswerProblems} from './learning-quality.mjs';
const [model,path,prefix]=process.argv.slice(2);if(!model||!path||!prefix)throw Error('Expected model, cards.jsonl, report-prefix');
const cards=readFileSync(path,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)).filter(c=>c.split==='eval');
const chat=createLocalChat({model,learningSignals:true}),forecast=chatForecastContext(forecastForDate('2026-11-02')),rows=[];
for(const c of cards){const started=performance.now();let r={},errors=[];try{
 const history=c.history??[],profile=c.chartFor?{birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude}:null;
 const astro=c.learning?{chart:null}:chartContext(profile,c.question,new Date('2026-11-02T09:00:00Z'),{history});
 r=await chat.answer({message:c.question,history,forecast:forecastForQuestion(forecast,c.question),chart:astro.chart,length:c.length??'medium'});
 if(unsafeChatAnswer(r.answer,'2026-11-02')||hasFormalAddress(r.answer))errors.push('safety/style');
 if(/\[\[LEARN/.test(r.answer))errors.push('internal marker leaked');
 if(r.answer.length<(c.minAnswerChars??(c.scope==='offtopic'||c.scope==='service'?30:150))||r.answer.length>ANSWER_LENGTHS[c.length??'medium'].maxChars)errors.push('answer length');
 errors.push(...learningAnswerProblems(r.answer,c));
 if(!!r.learningSuggested!==c.learning)errors.push('learned decision mismatch');
 if(!!learningInvitation(c.question,history,r.learningSuggested===true)!==c.learning)errors.push('button decision mismatch');
 if(c.sensitive&&learningInvitation(c.question,history,r.learningSuggested===true))errors.push('sensitive offer');
 }catch(e){errors.push(e.message);}rows.push({id:c.id,family:c.family,scope:c.scope??null,question:c.question,history:c.history??[],expected:c.learning,legacy:isLearningQuestion(c.question,c.history??[]),suggested:!!r.learningSuggested,button:!!learningInvitation(c.question,c.history??[],r.learningSuggested===true),answer:r.answer??'',styleFiltered:!!r.styleFiltered,groundedFallback:!!r.groundedFallback,errors,ms:Math.round(performance.now()-started),sensitive:!!c.sensitive});console.log(c.id,errors.length?'FAIL':'PASS');writeFileSync(prefix+'.partial.json',JSON.stringify(rows,null,2));}
const positives=rows.filter(r=>r.expected),negatives=rows.filter(r=>!r.expected),tp=positives.filter(r=>r.suggested).length,fp=negatives.filter(r=>r.suggested).length;
const offTopic=rows.filter(r=>r.scope==='offtopic');
const summary={model,total:rows.length,passed:rows.filter(r=>!r.errors.length).length,recall:positives.length?tp/positives.length:null,precision:tp+fp?tp/(tp+fp):null,falsePositives:fp,sensitiveOffers:rows.filter(r=>r.sensitive&&r.suggested).length,sensitiveButtons:rows.filter(r=>r.sensitive&&r.button).length,meaningFailures:rows.filter(r=>r.errors.some(e=>/meaning|false claim|instruction echo/.test(e))).length,offTopicTotal:offTopic.length,offTopicPassed:offTopic.filter(r=>!r.errors.length).length,falseScopeRefusals:rows.filter(r=>r.scope&&r.scope!=='offtopic'&&r.errors.some(e=>e.startsWith('scope:'))).length,errors:rows.filter(r=>r.errors.length).length};
writeFileSync(prefix+'.json',JSON.stringify({summary,rows},null,2));writeFileSync(prefix+'.md',[`# Учебные вопросы: ${model}`,'',JSON.stringify(summary),'',...rows.flatMap(r=>[`## ${r.errors.length?'✖':'✔'} ${r.question}`,`Ожидание: ${r.expected}; модель: ${r.suggested}; прежние правила: ${r.legacy}.`,r.answer,`Проверка: ${r.errors.join('; ')||'пройдена'}`,''])].join('\n'));
console.log(JSON.stringify(summary));process.exitCode=summary.recall>=.9&&summary.precision>=.95&&summary.sensitiveOffers===0&&summary.errors<=2?0:1;
