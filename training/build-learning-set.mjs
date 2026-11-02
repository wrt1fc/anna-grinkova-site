// Builds an explicitly labelled educational-intent set. Private cards stay outside git.
// node training/build-learning-set.mjs <cards.jsonl> <out-dir>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chatPrompt,systemFor,chatForecastContext,forecastForQuestion} from '../server/local-chat.js';
import {forecastForDate} from '../server/daily-forecast.js';
import {chartContext} from '../server/chat-grounding.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';
import {LEARNING_SIGNAL,LEARNING_SIGNAL_INSTRUCTION} from '../server/learning-signals.js';
const [input,out]=process.argv.slice(2);if(!input||!out)throw Error('Expected cards.jsonl and output directory');
const cards=readFileSync(input,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)),split={train:[],eval:[]},families=new Map(),ids=new Set();
const forecast=chatForecastContext(forecastForDate('2026-11-02'));
for(const c of cards){
 if(!c.id||ids.has(c.id)||!['train','eval'].includes(c.split)||typeof c.learning!=='boolean'||!c.family||!c.question||!c.answer)throw Error('Invalid card '+c.id);
 ids.add(c.id);if(families.has(c.family)&&families.get(c.family)!==c.split)throw Error('Family leakage: '+c.family);families.set(c.family,c.split);
 if(unsafeChatAnswer(c.answer,'2026-11-02')||c.answer.includes(LEARNING_SIGNAL)||c.answer.length>900)throw Error('Unsafe or overlong answer '+c.id);
 const history=c.history??[],profile=c.chartFor?{birthUtc:c.chartFor.birthUtc,birthLatitude:c.chartFor.latitude,birthLongitude:c.chartFor.longitude}:null;
 const astro=c.learning?{chart:null}:chartContext(profile,c.question,new Date('2026-11-02T09:00:00Z'),{history});
 const prompt=chatPrompt({message:c.question,history,forecast:forecastForQuestion(forecast,c.question),chart:astro.chart,length:'medium',tone:'playful',materials:[]});
 const system=systemFor(null)+LEARNING_SIGNAL_INSTRUCTION+(history.length?'\nПродолжай разговор без нового приветствия.':'\nПервый ответ начинается с «Привет!», затем сразу по сути.');
 split[c.split].push({id:c.id,prompt:[{role:'system',content:system},{role:'user',content:prompt}],completion:[{role:'assistant',content:c.answer+(c.learning?'\n'+LEARNING_SIGNAL:'')}]});
}
if(!split.train.length||!split.eval.length)throw Error('Both splits required');mkdirSync(out,{recursive:true});
for(const [name,rows]of Object.entries(split))writeFileSync(join(out,name+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
writeFileSync(join(out,'manifest.json'),JSON.stringify({sourceSha256:createHash('sha256').update(readFileSync(input)).digest('hex'),train:split.train.length,eval:split.eval.length,labels:Object.fromEntries(['train','eval'].map(s=>[s,{yes:cards.filter(c=>c.split===s&&c.learning).length,no:cards.filter(c=>c.split===s&&!c.learning).length}])),families:families.size,status:'synthetic-drafts-for-review'},null,2));
console.log(JSON.stringify({train:split.train.length,eval:split.eval.length,families:families.size}));
