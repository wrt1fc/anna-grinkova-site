import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { moscowDate } from '../server/daily-forecast.js';

test('only an operator-granted entitlement removes chat quota; identity and other limits remain separate',async()=>{
  const store=await createStore('pglite:memory'),seen=[];
  let fail=false;
  const server=createServer({store,codeSecret:'unlimited-local-only-secret-32-chars',trafficLimiter:createTrafficLimiter({perIpLimit:1000,globalLimit:10000}),
    chatLimiter:createTrafficLimiter({perIpLimit:1000,globalLimit:10000}),chatWriter:{async answer(input){seen.push(input);if(fail)throw Error('fixture failure');return{answer:'Привет! Это проверочный ответ с сохранённым контекстом.'};}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,cookie,body,method=body?'POST':'GET')=>{const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json()};};
  try{
    const password='Unlimited-local-only1!',hash=await hashPassword(password);
    const tester=await store.createUser('test1@anna.test',hash,Date.now(),Date.now());
    const normal=await store.createUser('normal@example.test',hash,Date.now(),Date.now());
    async function login(email){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});return response.headers.get('set-cookie').split(';')[0];}
    const cookie=await login(tester.email),normalCookie=await login(normal.email);
    // Merely having a test-looking email or editable display name must not grant unlimited chat.
    await request('/api/me/name',normalCookie,{name:'test1'},'PUT');
    for(const c of [cookie,normalCookie])assert.equal((await request('/api/plan',c)).data.plan.unlimitedChat,undefined);
    await store.q.run('UPDATE users SET chat_unlimited = TRUE WHERE id = $1',[tester.id]);
    for(const path of ['/api/plan','/api/profiles','/api/billing/subscription']){const data=(await request(path,cookie)).data;assert.equal(data.plan.unlimitedChat,true);assert.equal(data.plan.dailyChatMessages,null);assert.equal(data.plan.dailyTarotReadings,1);}
    const day=moscowDate();for(let n=0;n<5;n++)await store.consumeDailyQuota(`chat:${tester.id}`,day,5);
    for(let n=0;n<5;n++)await store.consumeDailyQuota(`chat:${normal.id}`,day,5);
    assert.equal((await request('/api/chat',normalCookie,{message:'Мой вопрос'})).status,429);
    await request('/api/profile',cookie,{birthDate:'1990-05-15',birthTime:'12:30',birthCityId:524901},'PUT');
    for(const message of ['Что означает мой Сатурн?','В чём мои сильные стороны?','Почему я ревную?','А что с работой?']){
      const reply=await request('/api/chat',cookie,{message,chatUnlimited:false});assert.equal(reply.status,200);assert.equal(reply.data.context.basis,'natal');assert.ok(seen.at(-1).chart.planets.length);
    }
    const follow=await request('/api/chat',cookie,{message:'А подробнее?',history:[{role:'user',content:'Что означает мой Сатурн?'}]});assert.equal(follow.data.context.basis,'natal');
    const dayFollow=await request('/api/chat',cookie,{message:'А подробнее?',history:[{role:'user',content:'Что означает моя карта дня?'}]});assert.equal(dayFollow.data.context.basis,'day');assert.ok(seen.at(-1).forecast.reading);
    assert.equal(await store.dailyQuotaUsed(`chat:${tester.id}`,day),5);
    fail=true;assert.equal((await request('/api/chat',cookie,{message:'Проверка ошибки'})).status,503);assert.equal(await store.dailyQuotaUsed(`chat:${tester.id}`,day),5);fail=false;
    // A request body cannot impersonate the operator grant.
    assert.equal((await request('/api/chat',normalCookie,{message:'Мой вопрос',chatUnlimited:true})).status,429);
    await store.q.run('UPDATE users SET chat_unlimited = FALSE WHERE id = $1',[tester.id]);
    assert.equal((await request('/api/chat',cookie,{message:'Мой вопрос'})).status,429);
  }finally{await new Promise(r=>server.close(r));await store.close();}
});
