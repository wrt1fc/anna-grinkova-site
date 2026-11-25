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
  const month = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow'}).format(new Date()).slice(0,7);
  await store.q.run('INSERT INTO monthly_chat_quotas (kind,month,used) VALUES ($1,$2,29)',[`chat:${u.id}`,month]);
  assert.equal((await request('/api/chat',{message:'Ещё один вопрос'})).status,200);assert.equal((await store.welcomeBonus(u.id)).remainingQuestions,0);
  const monthlyBlocked = await request('/api/chat',{message:'Вопрос сверх месячного лимита'});
  assert.equal(monthlyBlocked.status,429);assert.equal(monthlyBlocked.data.quotaPeriod,'month');
  await store.refundMonthlyChatQuota(`chat:${u.id}`,month);
  fail=true;assert.equal((await request('/api/chat',{message:'Проверка возврата вопроса'})).status,503);fail=false;
  assert.equal(await store.monthlyChatQuotaUsed(`chat:${u.id}`,month),29);
  await store.setPlanPeriod(u.id,'free');await store.q.run('UPDATE users SET chat_unlimited=TRUE WHERE id=$1',[u.id]);
  assert.equal((await request('/api/chat',{message:'Тестовый безлимит'})).status,200);
 }finally{await new Promise(r=>server.close(r));await store.close();}
});

test('ФОРТУНА adds one chat question per account, including after monthly quota is spent', async (t) => {
  const store = await createStore('pglite:memory');
  t.after(() => store.close());
  let fail = false;
  const server = createServer({ store, codeSecret: 'promo-local-only-secret-32-chars',
    chatWriter: { async answer() {
      if (fail) throw Error('fixture failure');
      return { answer: 'Управитель — планета, связанная со знаком зодиака. Например, Стрельцом управляет Юпитер.' };
    } },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const password = 'Promo-local-only1!';
  const hash = await hashPassword(password);
  const first = await store.createUser('promo-first@example.test', hash, Date.now(), Date.now());
  const second = await store.createUser('promo-second@example.test', hash, Date.now(), Date.now());
  const request = async (path, body, cookie = '') => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async (user) => (await request('/api/auth/login', { email: user.email, password })).cookie;
  const redeem = (cookie, code = 'ФОРТУНА') => request('/api/promo/redeem', { code }, cookie);
  const ask = (cookie) => request('/api/chat', { message: 'Что такое управитель?' }, cookie);
  const promo = async (cookie) => (await request('/api/plan', null, cookie)).data.plan.promoQuestion;
  const firstCookie = await login(first);
  const otherSession = await login(first);
  const secondCookie = await login(second);

  assert.equal((await redeem()).status, 401);
  assert.equal((await redeem(firstCookie, 'неверный')).status, 400);
  assert.deepEqual(await promo(firstCookie), { redeemed: false, remainingQuestions: 0 });
  const claims = await Promise.all([redeem(firstCookie, ' фортуна '), redeem(otherSession)]);
  assert.deepEqual(claims.map(({ status }) => status).sort(), [200, 409]);
  assert.deepEqual(await promo(otherSession), { redeemed: true, remainingQuestions: 1 });
  assert.deepEqual(await promo(secondCookie), { redeemed: false, remainingQuestions: 0 });
  for (let i = 0; i < 3; i++) assert.equal(await store.consumeWelcomeQuestion(first.id), true);
  fail = true;
  assert.equal((await ask(firstCookie)).status, 503);
  assert.equal((await promo(otherSession)).remainingQuestions, 1);
  fail = false;
  assert.equal((await ask(firstCookie)).status, 200);
  assert.equal((await ask(otherSession)).status, 402);
  assert.equal((await redeem(otherSession)).status, 409);
  assert.deepEqual(await promo(otherSession), { redeemed: true, remainingQuestions: 0 });

  assert.equal((await redeem(secondCookie)).status, 200);
  await store.setPlanPeriod(second.id, 'subscription', Date.now() + 86_400_000);
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date()).slice(0, 7);
  await store.q.run('INSERT INTO monthly_chat_quotas (kind,month,used) VALUES ($1,$2,30)', [`chat:${second.id}`, month]);
  assert.equal((await ask(secondCookie)).status, 200);
  assert.equal((await ask(secondCookie)).status, 429);
  assert.equal(await store.monthlyChatQuotaUsed(`chat:${second.id}`, month), 30);
});
