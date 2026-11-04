// Explicit synthetic availability check during smoke training, never visitor logs.
import {writeFileSync} from 'node:fs';
import {createLocalChat} from '../../server/local-chat.js';
const trace=[],start=performance.now();
const chat=createLocalChat({model:'anna-v19',learningSignals:false,onTrace:t=>trace.push(t)});
const answer=await chat.answer({message:'Чем модальности отличаются от стихий?',history:[],forecast:{date:'2026-11-02',scope:'general'},length:'short'});
const result={model:answer.model,answer:answer.answer,groundedFallback:!!answer.groundedFallback,ms:Math.round(performance.now()-start),attempts:trace.length};
writeFileSync(process.argv[2],JSON.stringify(result,null,2));
if(result.model!=='anna-v19'||result.groundedFallback||result.ms>=45000)throw Error('CPU serving under training load failed its budget');
console.log(JSON.stringify({model:result.model,ms:result.ms,attempts:result.attempts}));
