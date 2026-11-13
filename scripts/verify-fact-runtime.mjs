// Run with the running service's environment; never uses a real account or model call.
import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const [base,expectedMode,expectedModel]=process.argv.slice(2);
assert.ok(base&&['0','1'].includes(expectedMode)&&expectedModel,'Expected release directory, fact mode 0/1 and configured model');
assert.equal(process.env.CHAT_LOCAL_MODEL,expectedModel);
assert.equal(process.env.ANNA_FACT_ANSWERS==='1'?'1':'0',expectedMode);
const {createLocalChat}=await import(pathToFileURL(base+'/server/local-chat.js'));
const {chartContext}=await import(pathToFileURL(base+'/server/chat-grounding.js'));
const profile={birthUtc:'1997-10-08T21:30:00Z',birthLatitude:48.48,birthLongitude:135.08};
const message='Какие планеты управляют денежным домом моей натальной карты и где они расположены?';
let calls=0;const chat=createLocalChat({model:expectedModel,learningSignals:false,fetchImpl:async()=>{
 calls++;assert.equal(expectedMode,'0','Calculated mode must not generate');
 return {ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({response:'Плутон в Стрельце во 2 доме. Марс в Стрельце во 2 доме. [[LEARNING_NONE]]',done:true,done_reason:'stop'})+'\n'));c.close();}})};
}});
const r=await chat.answer({message,history:[],chart:chartContext(profile,message).chart,forecast:null});
assert.equal(calls,expectedMode==='1'?0:1);assert.match(r.answer,/Плутон/u);assert.match(r.answer,/Марс/u);assert.doesNotMatch(r.answer,/Венер/u);
if(expectedMode==='1'){
 const u=await chat.answer({message,history:[],chart:chartContext({...profile,birthTime:null},message).chart,forecast:null});assert.match(u.answer,/врем/iu);
 const q='Если Венера связана с Юпитером, правда ли партнёр будет крупнее меня?';assert.equal(chartContext(profile,q).chart,null);
 const p=await chat.answer({message:q,history:[],chart:null,forecast:null});assert.match(p.answer,/нельзя определить/u);
}
console.log(JSON.stringify({status:'PASS',configuredModel:expectedModel,factMode:expectedMode,modelCalls:calls}));
