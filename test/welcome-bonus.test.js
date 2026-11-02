import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStore} from '../server/store.js';
import {createServer} from '../server/http.js';
import {hashPassword} from '../server/auth.js';
import {createTrafficLimiter} from '../server/traffic.js';

test('registration bonus has three lifetime questions, is atomic, and survives quota cleanup and sign-in',async()=>{
 const store=await createStore('pglite:memory');
 try{
  const u=await store.createUser('welcome@example.test','hash',Date.now(),Date.now());
  assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,3);
  const claims=await Promise.all(Array.from({length:7},()=>store.consumeWelcomeQuestion(u.id)));
  assert.equal(claims.filter(Boolean).length,3);
  await store.pruneExpired(Date.now()+10*86400000);
  assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,0);
  await store.refundWelcomeQuestion(u.id);
  assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,1);
  const unverified=await store.createUser('unverified@example.test','hash');
  assert.equal(await store.consumeWelcomeQuestion(unverified.id),false);
 }finally{await store.close();}
});

test('free answers spend the welcome bonus once; failures refund it, paid and operator access remain separate',async()=>{
 const store=await createStore('pglite:memory');let fail=false,calls=0;
 const server=createServer({store,codeSecret:'welcome-local-only-secret-32-chars',
  trafficLimiter:createTrafficLimiter({perIpLimit:1000,globalLimit:10000}),chatLimiter:createTrafficLimiter({perIpLimit:1000,globalLimit:10000}),
  chatWriter:{async answer(){calls++;if(fail)throw Error('fixture failure');return{answer:'Управитель — планета, связанная со знаком зодиака. Например, Стрельцом управляет Юпитер.'};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const password='Welcome-local-only1!';
 const u=await store.createUser('bonus@example.test',await hashPassword(password),Date.now(),Date.now());
 async function login(){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
 let cookie=await login();
 async function request(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};}
 try{
  for(const path of ['/api/plan','/api/billing/subscription']){const {data}=await request(path);assert.equal(data.plan.dailyChatMessages,0);assert.equal(data.plan.welcomeBonus.remainingQuestions,3);assert.equal(data.plan.welcomeBonus.natalChartIncluded,true);}
  fail=true;assert.equal((await request('/api/chat',{message:'Что такое управитель?'})).status,503);fail=false;
  assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,3);
  let first;
  for(let n=0;n<3;n++){const r=await request('/api/chat',{message:'Что такое управитель?',welcomeQuestions:999});assert.equal(r.status,200);first??=r;}
  assert.match(first.data.learning.text,/Институте прогрессивной психологии/);assert.equal(first.data.learning.url,undefined);
  const blocked=await request('/api/chat',{message:'Ещё один вопрос',chatUnlimited:true});assert.equal(blocked.status,402);assert.equal(blocked.data.error,'subscription_required');
  // The included own chart is not a fourth question and remains viewable.
  const profile=await fetch(base+'/api/profile',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({birthDate:'1990-05-15',birthTime:'12:30',birthCityId:524901})});
  assert.equal(profile.status,200);for(let n=0;n<2;n++)assert.equal((await request('/api/natal/me')).status,200);
  assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,0);
  const count=calls;cookie=await login();assert.equal((await request('/api/chat',{message:'Новый вход'})).status,402);assert.equal(calls,count);
  assert.equal((await request('/api/tarot/reading',{question:'Вопрос о моей работе',draw:0})).status,402);
  await store.setPlanPeriod(u.id,'subscription',Date.now()+86400000);
  assert.equal((await request('/api/chat',{message:'Ещё один вопрос'})).status,200);assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,0);
  await store.setPlanPeriod(u.id,'free');await store.q.run('UPDATE users SET chat_unlimited=TRUE WHERE id=$1',[u.id]);
  assert.equal((await request('/api/chat',{message:'Тестовый безлимит'})).status,200);
 }finally{await new Promise(r=>server.close(r));await store.close();}
});
