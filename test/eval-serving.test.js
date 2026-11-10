import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('production evaluator ignores invitation decisions while preserving strict semantic failures and raw attempts',async()=>{
  const root=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'anna-serving-'));
  const server=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const question=JSON.parse(JSON.parse(data).prompt).question;
    const answer=question==='Точный вопрос'?'Привет! Асцендент — начало первого дома.':'Привет! Ответ совсем о другой теме.';
    res.setHeader('Content-Type','application/x-ndjson');
    res.end(JSON.stringify({response:answer+'\n[[LEARNING_NONE]]',done:true,done_reason:'stop'})+'\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const input=join(root,'cards.jsonl'),prefix=join(root,'report');
    await writeFile(input,['Точный вопрос','Другой вопрос'].map((question,i)=>JSON.stringify({id:String(i),split:'eval',question,learning:true,scope:'astrology',requiredMeanings:[['начало первого дома']],minAnswerChars:15})).join('\n'));
    const child=spawn(process.execPath,['training/eval-serving.mjs','fixture',input,prefix],{env:{...process.env,OLLAMA_URL:`http://127.0.0.1:${server.address().port}`,CHAT_FACT_GUARD:'1',CHAT_MODEL_PROTOCOL:'19'}});
    let error='';child.stderr.on('data',chunk=>error+=chunk);child.stdout.resume();
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    assert.equal(code,1,error);
    const report=JSON.parse(await readFile(prefix+'.json','utf8'));
    assert.equal(report.summary.total,2);assert.equal(report.summary.passed,1);
    assert.equal(report.summary.protocol,'production-learning-off');
    assert.deepEqual(report.rows[0].errors,[]);
    assert.ok(report.rows[1].errors.includes('missing meaning 1'));
    assert.equal(report.summary.rawAttempts,2);
    assert.equal(report.summary.automaticDeployment,false);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
