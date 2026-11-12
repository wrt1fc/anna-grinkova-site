import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';

const linux={skip:process.platform==='win32'};
const scripts=['repair-v29.sh','restore-v29-serving.sh','restore-v29-stop.sh','launch-v29-server.sh'];
test('v29 shell scripts parse and export resolves the physical frozen snapshot root',linux,()=>{
  for(const script of scripts) assert.equal(spawnSync('bash',['-n',`training/server/${script}`]).status,0,script);
  const root=fs.mkdtempSync(join(process.env.TMPDIR??tmpdir(),'anna-v29-path-'));
  try{
    const server=join(root,'eval-code/training/server');fs.mkdirSync(server,{recursive:true});
    assert.equal(fs.realpathSync(join(server,'../../..')),fs.realpathSync(root));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('v29 restoration only changes its own lease and retries interrupted cleanup under the GPU lock',linux,async()=>{
  const root=fs.mkdtempSync(join(process.env.TMPDIR??tmpdir(),'anna-v29-restore-'));
  try{
    fs.mkdirSync(join(root,'reports'));fs.mkdirSync(join(root,'bin'));
    fs.mkdirSync(join(root,'eval-code/training/server'),{recursive:true});
    const marker=join(root,'reports/lease-owned'),pending=join(root,'reports/restore-needed');
    const override=join(root,'90-training-v29.conf'),called=join(root,'called'),failure=join(root,'fail-curl');
    for(const name of ['systemctl','curl']){
      fs.writeFileSync(join(root,'bin',name),`#!/bin/bash\nprintf '%s %s\\n' '${name}' "$*" >> '${called}'\n${name==='curl'?`test ! -e '${failure}'`:'exit 0'}\n`,{mode:0o755});
    }
    for(const script of ['restore-v29-serving.sh','restore-v29-stop.sh']){
      const source=fs.readFileSync(`training/server/${script}`,'utf8')
        .replaceAll('/home/ubuntu/natal-training-v29-r1',root)
        .replaceAll('/home/ubuntu/anna-training-gpu.lock',join(root,'gpu.lock'))
        .replaceAll('/run/systemd/system/anna-site.service.d/90-training-v29.conf',override);
      assert.ok(!source.includes('/home/ubuntu/')&&!source.includes('/run/systemd/'),'fixture cannot access real training or service paths');
      fs.writeFileSync(join(root,'eval-code/training/server',script),source);
    }
    const helper=join(root,'eval-code/training/server/restore-v29-serving.sh');
    const stop=join(root,'eval-code/training/server/restore-v29-stop.sh');
    const env={...process.env,PATH:`${root}/bin:${process.env.PATH}`};
    const run=script=>spawnSync('bash',[script],{env});
    assert.equal(run(helper).status,0);assert.equal(run(stop).status,0);assert.equal(fs.existsSync(called),false);
    fs.writeFileSync(marker,'');fs.writeFileSync(override,'EnvironmentFile=/different-job/serving-disabled.env\n');
    assert.notEqual(run(stop).status,0);assert.equal(fs.existsSync(called),false);assert.ok(fs.existsSync(marker));assert.ok(fs.existsSync(override));
    fs.writeFileSync(override,`[Service]\nEnvironmentFile=${root}/serving-disabled.env\n`);
    const holder=spawn('flock',[join(root,'gpu.lock'),'bash','-c','printf locked; read -r line']);
    await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('error',reject);});
    try{
      assert.equal(run(stop).status,75);assert.equal(fs.existsSync(called),false);
      assert.ok(fs.existsSync(marker));assert.ok(fs.existsSync(override));
    }finally{holder.stdin.end('\n');await new Promise(resolve=>holder.once('close',resolve));}
    fs.writeFileSync(failure,'');assert.notEqual(run(stop).status,0);
    assert.equal(fs.existsSync(override),false);assert.ok(fs.existsSync(marker));assert.ok(fs.existsSync(pending));
    fs.rmSync(failure);assert.equal(run(stop).status,0);
    assert.equal(fs.existsSync(marker),false);assert.equal(fs.existsSync(pending),false);
    assert.match(fs.readFileSync(called,'utf8'),/systemctl restart anna-site/u);
    const before=fs.readFileSync(called,'utf8');assert.equal(run(stop).status,0);assert.equal(run(helper).status,0);
    assert.equal(fs.readFileSync(called,'utf8'),before,'idempotent cleanup never starts Ollama without its lease');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
