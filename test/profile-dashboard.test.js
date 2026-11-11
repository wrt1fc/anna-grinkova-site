import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.js';
import {createServer} from '../server/http.js';
import {hashPassword} from '../server/auth.js';
import {accountPlan} from '../server/plans.js';
import {moscowDate} from '../server/daily-forecast.js';

test('dashboard reports actual monthly usage and private relative chart is limited to its owner and subscription', async()=>{
 const store=await createStore('pglite:memory');
 const server=createServer({store,codeSecret:'test-dashboard-secret-with-more-than-32-characters'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const password='Long-password1!';
  const user=await store.createUser('owner@example.com',await hashPassword(password),Date.now(),Date.now());
  await store.setPlanPeriod(user.id,'subscription',Date.now()+30*86400000);
  await store.consumeMonthlyChatQuota(`chat:${user.id}`,moscowDate().slice(0,7),30);
  const plan=await accountPlan(store,'subscription',user);
  assert.equal(plan.chatUsage.remaining,29);assert.equal(plan.maxPeople,2);
  assert.equal(new Date(plan.chatUsage.resetsAt).getUTCHours(),21);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const added=await fetch(base+'/api/profiles',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({relation:'partner',label:'Анна',birthDate:'1990-05-15',birthTime:'12:30',birthCityId:524901})});
  assert.equal(added.status,201);const {profile}=await added.json();
  const url=base+`/api/natal/profiles/${profile.id}`;
  assert.equal((await fetch(url)).status,401);
  const natal=await fetch(url,{headers:{Cookie:cookie}});assert.equal(natal.status,200);assert.ok((await natal.json()).natal.sections.length);
  const other=await store.createUser('other@example.com',await hashPassword(password),Date.now(),Date.now());
  await store.setPlanPeriod(other.id,'subscription',Date.now()+86400000);
  const second=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'other@example.com',password})});
  assert.equal((await fetch(url,{headers:{Cookie:second.headers.get('set-cookie').split(';')[0]}})).status,404);
  await store.setPlanPeriod(user.id,'free');assert.equal((await fetch(url,{headers:{Cookie:cookie}})).status,403);
 }finally{await new Promise(r=>server.close(r));await store.close();}
});
