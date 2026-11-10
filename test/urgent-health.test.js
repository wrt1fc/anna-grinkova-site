import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createHttpServer} from 'node:http';
import {createChatRoutes} from '../server/routes/chat.js';
import {createLocalChat} from '../server/local-chat.js';
import {isUrgentHealthMessage,urgentHealthReply,URGENT_HEALTH_ANSWER} from '../server/urgent-health.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {evaluationTelemetry} from '../training/evaluation-telemetry.mjs';

test('current severe chest/heart symptoms receive an immediate emergency response',()=>{
 for(const message of ['У меня сильно болит сердце, карта подскажет, что делать?','Сейчас очень болит в груди.','У мамы сильная боль в области сердца.','Сердце невыносимо болит!','Сильная боль в грудной клетке не проходит.','Внезапно заболело сердце, что делать?']){
  assert.equal(isUrgentHealthMessage(message),true,message);
  const reply=urgentHealthReply(message);
  assert.match(reply.answer,/Сейчас немедленно вызови скорую помощь/u);
  assert.match(reply.answer,/103 или 112/u);
  assert.equal(reply.model,null);
  assert.deepEqual(learningAnswerProblems(reply.answer,{question:message,qualityVersion:19,scope:'safety'}),[],message);
 }
 for(const message of ['Я не знаю почему сильно болит сердце.','У мамы сильная боль в груди, объясни, что делать.'])assert.equal(isUrgentHealthMessage(message),true,message);
 for(const message of [
  'Вчера началось, сейчас сильно болит сердце',
  'Сильно болит сердце и не проходит со вчера',
  'У меня сильно болит сердце, но это не метафора',
  'Мне снилось что-то страшное, а сейчас сильно болит сердце',
  'Сильно болит сердце, если двигаюсь',
  'Сердце болит очень сильно',
  'У меня сильная давящая боль в груди',
  'В груди сильная боль',
  'Вчера было лучше, теперь в груди острая сжимающая боль',
  'Мне снилось, что сильно болит сердце, но наяву сейчас сердце болит невыносимо',
  'Сначала это была метафора, а сейчас действительно сильная боль в груди',
  'Сейчас у меня сильно болит сердце. У мамы боль уже прошла',
  'У мамы сильная боль в груди, у меня уже прошло',
  'Сейчас сильная боль в груди. Раньше я говорил образно',
 ])assert.equal(isUrgentHealthMessage(message),true,message);
});

test('quotes, denials, hypotheticals, dreams, metaphors and historical symptoms are not current emergencies',()=>{
 for(const message of [
  'Сердце иногда побаливает, что показывает карта?',
  'У меня не сильно болит сердце.',
  'Сердце не болит.',
  'Нет сильной боли в груди.',
  'У меня нет сильной боли в области сердца.',
  'Что означает фраза «У меня сильно болит сердце»?',
  'Переведи "Сильная боль в груди".',
  'Мне снилось, что сильно болит сердце.',
  'Мне снилось, что сильно болит сердце, но я проснулся.',
  'Мне снилось, что сейчас сильно болит сердце.',
  'Мне снилось, как сейчас в груди сильная боль.',
  'Мне снилось, будто сейчас сердце болит очень сильно.',
  'Во сне у меня сильно болит сердце.',
  'Сильно болит сердце — говорю образно.',
  'Сильно болит сердце. Это только метафора.',
  'Сильно болит сердце из-за расставания.',
  'Вчера сильно болело сердце, сейчас прошло.',
  'Раньше сильно болит сердце — так написано в дневнике.',
  'Если сильно болит сердце, что обычно делают?',
  'В учебнике описана сильная боль в груди.',
  'Что делать при сильной боли в груди?',
  'Что такое сильная боль в груди?',
  'Расскажи про сильную боль в груди.',
  'Сердце болит очень сильно — это метафора.',
  'Если бы в груди была сильная боль, что делать?',
  'У меня сильная боль в груди уже прошла.',
 ]){assert.equal(isUrgentHealthMessage(message),false,message);assert.equal(urgentHealthReply(message),null,message);}
 assert.equal(isUrgentHealthMessage('Вчера боль прошла. Сейчас сильно болит сердце.'),true);
 assert.equal(isUrgentHealthMessage('Я прочитал «сильно болит сердце». Но сейчас у меня очень болит в груди.'),true);
});

test('direct model writer never fetches and keeps fallback telemetry and conversation greeting honest',async()=>{
 const chat=createLocalChat({model:'test-emergency',fetchImpl:async()=>assert.fail('emergency must not call model')});
 for(const history of [[],[{role:'user',content:'Хочу поговорить.'}]]){
  const deltas=[];
  const result=await chat.answer({message:'Сейчас сильная боль в груди.',history,onDelta:delta=>deltas.push(delta)});
  assert.equal(result.answer,history.length?URGENT_HEALTH_ANSWER:'Привет! '+URGENT_HEALTH_ANSWER);
  assert.equal(result.learningSuggested,false);
  assert.equal(result.urgentHealth,true);
  assert.equal(result.model,null);
  assert.equal(result.groundedFallback,true);
  assert.deepEqual(deltas,[result.answer]);
  assert.equal(evaluationTelemetry(result,[]).rawAttempts.length,0);
  assert.equal(evaluationTelemetry(result,[]).generationModel,null);
 }
});

test('HTTP emergency JSON and SSE work without a writer, ahead of quotas and model gates, after authentication',async()=>{
 const blocked=()=>assert.fail('emergency must not reach quota, profile, model gate or limiter');
 const routes=createChatRoutes({store:new Proxy({},{get:()=>blocked}),chatWriter:null,chatLimiter:{check:blocked},chatGate:{tryAcquire:blocked},historySigner:{trusted:history=>history},metrics:{count(){}},readingKey:'test-key'});
 const server=createHttpServer(async(req,res)=>{
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  await routes({path:'/api/chat',req,res,user:req.headers.authorization?{id:1}:null,json,readJson:async(req)=>{let body='';for await(const part of req)body+=part;return JSON.parse(body);}});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/chat`;
  const send=(message,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'test',...headers},body:JSON.stringify({message})});
  const response=await send('У меня сильно болит сердце.');
  assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.urgentHealth,true);assert.equal(data.model,null);assert.match(data.answer,/немедленно вызови скорую/u);
  const stream=await send('Очень болит в груди.',{Accept:'text/event-stream'});
  assert.equal(stream.status,200);assert.match(await stream.text(),/event: done\ndata: .*"urgentHealth":true/u);
  const unauth=await send('У меня сильно болит сердце.',{Authorization:''});assert.equal(unauth.status,401);
  const normal=await send('Объясни куспид.');assert.equal(normal.status,503);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
