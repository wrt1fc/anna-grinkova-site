import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';

test('review stop-post does not touch another job before acquiring its lease and retries failed restore',{skip:process.platform==='win32'},async()=>{
 const root=fs.mkdtempSync(join(process.env.TMPDIR??tmpdir(),'anna-review-restore-'));
 try{
  fs.mkdirSync(join(root,'reports'));
  const marker=join(root,'reports/lease-owned'),called=join(root,'called'),mock=join(root,'mock.sh'),script=join(root,'restore.sh');
  const source=fs.readFileSync('training/server/restore-v26-review.sh','utf8')
   .replace('ROOT=/home/ubuntu/natal-training-v26-serving-r1',`ROOT='${root}'`)
   .replace('^/home/ubuntu/natal-training-v26-serving-r','^/invalid-test-root/natal-training-v26-serving-r')
   .replace('/home/ubuntu/anna-training-gpu.lock',join(root,'gpu.lock'))
   .replace('/home/ubuntu/natal-training-v26-r2/eval-code/training/server/restore-v26-serving.sh',mock);
  assert.ok(!source.includes('/home/ubuntu/'),'fixture must never access real training paths');
  fs.writeFileSync(script,source);
  assert.equal(spawnSync('bash',[script,'/tmp/untrusted-review']).status,64);
  fs.writeFileSync(mock,`printf called >> '${called}'\nexit 1\n`);
  assert.equal(spawnSync('bash',[script]).status,0);assert.equal(fs.existsSync(called),false);
  fs.writeFileSync(marker,'');assert.notEqual(spawnSync('bash',[script]).status,0);assert.equal(fs.existsSync(marker),true);
  // A stale marker after restore failure must not undo a different job's GPU lease.
  const holder=spawn('flock',[join(root,'gpu.lock'),'bash','-c','printf locked; read -r line']);
  await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('error',reject);});
  const before=fs.readFileSync(called,'utf8');
  try{
   assert.equal(spawnSync('bash',[script]).status,75);
   assert.equal(fs.readFileSync(called,'utf8'),before);assert.equal(fs.existsSync(marker),true);
  }finally{holder.stdin.end('\n');await new Promise(resolve=>holder.once('close',resolve));}
  fs.writeFileSync(mock,`printf called >> '${called}'\n`);
  assert.equal(spawnSync('bash',[script]).status,0);assert.equal(fs.existsSync(marker),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
