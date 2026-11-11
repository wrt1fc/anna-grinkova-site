import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.js';
import {createServer} from '../server/http.js';
import {hashPassword} from '../server/auth.js';
import {createTrafficLimiter} from '../server/traffic.js';

test('forecast caches invalidate coordinates and known-time status even with identical write timestamps',async()=>{
 const store=await createStore('pglite:memory');
 const server=createServer({store,codeSecret:'forecast-cache-fixture-secret-32-chars',trafficLimiter:createTrafficLimiter({perIpLimit:500,globalLimit:1000})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const password='Forecast-cache-password1!';
  const user=await store.createUser('forecast-cache@example.test',await hashPassword(password),Date.now(),Date.now());
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const get=async path=>{const r=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
  const profile={birthDate:'1990-05-15',birthUtc:'1990-05-15T09:30:00Z',birthTime:'12:30',birthLatitude:55.75,birthLongitude:37.62,birthPlace:'Москва'};
  const timestamp=Date.now();
  await store.saveBirthProfile(user.id,profile,timestamp);
  const before=await get('/api/forecast/day'),weekBefore=await get('/api/forecast/week');
  await store.saveBirthProfile(user.id,{...profile,birthLatitude:43.12,birthLongitude:131.88,birthPlace:'Другой город'},timestamp);
  const moved=await get('/api/forecast/day'),weekMoved=await get('/api/forecast/week');
  assert.deepEqual(moved.astronomy.natal,before.astronomy.natal,'geocentric positions use the same UTC instant');
  assert.notDeepEqual(moved.astronomy.natalHouses,before.astronomy.natalHouses);
  assert.notDeepEqual(weekMoved.days[0].astronomy.natalHouses,weekBefore.days[0].astronomy.natalHouses);
  await store.saveBirthProfile(user.id,{...profile,birthTime:''},timestamp);
  const unknown=await get('/api/forecast/day'),weekUnknown=await get('/api/forecast/week');
  assert.equal(unknown.astronomy.timeKnown,false);assert.equal(unknown.astronomy.natalHouses,null);
  assert.ok(weekUnknown.days.every(day=>day.astronomy.timeKnown===false&&day.astronomy.natalHouses===null));
 }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
