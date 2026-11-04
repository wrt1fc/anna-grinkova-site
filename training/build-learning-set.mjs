// Builds an explicitly labelled educational-intent set. Private cards stay outside git.
// node training/build-learning-set.mjs <cards.jsonl> <out-dir>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chatPrompt,firstPassSystem,historyForQuestion,chatForecastContext,forecastForQuestion} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {chartContext} from '../server/chat-grounding.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {LEARNING_SIGNAL,LEARNING_NONE} from '../server/learning-signals.js';
import {learningAnswerProblems} from './learning-quality.mjs';
import {hasFormalAddress} from '../server/chat-style.js';
const [input,out]=process.argv.slice(2);if(!input||!out)throw Error('Expected cards.jsonl and output directory');
const cards=readFileSync(input,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)),split={train:[],eval:[]},families=new Map(),ids=new Set();
const forecast=chatForecastContext(forecastForDate('2026-11-02'));
for(const c of cards){
 if(!c.id||ids.has(c.id)||!['train','eval'].includes(c.split)||typeof c.learning!=='boolean'||!c.family||!c.question||!c.answer)throw Error('Invalid card '+c.id);
 ids.add(c.id);if(families.has(c.family)&&families.get(c.family)!==c.split)throw Error('Family leakage: '+c.family);families.set(c.family,c.split);
 if(unsafeChatAnswer(c.answer,'2026-11-02')||c.answer.includes('[[LEARNING_')||c.answer.length>900)throw Error('Unsafe or overlong answer '+c.id);
 if(c.scope==='offtopic'&&(c.learning||c.sensitive))throw Error('Offtopic cards must not offer learning or replace crisis support: '+c.id);
 if(c.scope&&learningAnswerProblems(c.answer,c).some(p=>p.startsWith('scope:')))throw Error('Scope policy mismatch in teacher answer '+c.id);
 if([16,17].includes(c.qualityVersion)&&(hasFormalAddress(c.answer)||learningAnswerProblems(c.answer,c).length))throw Error('Invalid v'+c.qualityVersion+' teacher answer '+c.id+': '+learningAnswerProblems(c.answer,c).join('; '));
 const history=c.history??[],profile=c.chartFor?{birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude}:null;
 const astro=c.learning?{chart:null}:chartContext(profile,c.question,new Date('2026-11-02T09:00:00Z'),{history});
 const prompt=chatPrompt({message:c.question,history:historyForQuestion(history,c.question),forecast:forecastForQuestion(forecast,c.question),chart:astro.chart,length:c.length??'medium',tone:c.tone??null,materials:[]});
 const system=firstPassSystem({message:c.question,chart:astro.chart,history,learningSignals:true});
 split[c.split].push({id:c.id,prompt:[{role:'system',content:system},{role:'user',content:prompt}],completion:[{role:'assistant',content:c.answer+'\n'+(c.learning?LEARNING_SIGNAL:LEARNING_NONE)}],...(c.qualityVersion===17?{chat_template_kwargs:{enable_thinking:false}}:{})});
}
if(!split.train.length||!split.eval.length)throw Error('Both splits required');mkdirSync(out,{recursive:true});
for(const [name,rows]of Object.entries(split))writeFileSync(join(out,name+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
writeFileSync(join(out,'manifest.json'),JSON.stringify({sourceSha256:createHash('sha256').update(readFileSync(input)).digest('hex'),train:split.train.length,eval:split.eval.length,labels:Object.fromEntries(['train','eval'].map(s=>[s,{yes:cards.filter(c=>c.split===s&&c.learning).length,no:cards.filter(c=>c.split===s&&!c.learning).length}])),families:families.size,status:'synthetic-drafts-for-review'},null,2));
console.log(JSON.stringify({train:split.train.length,eval:split.eval.length,families:families.size}));
