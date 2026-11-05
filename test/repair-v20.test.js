import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import evalSet from '../training/eval-questions.json' with {type:'json'};
test('v20 final report survives recorded baseline failure and rejects raw signals hidden by the interface',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anna-v20-report-'));
 try{
  for(const p of ['data','reports','anna-v20'])mkdirSync(join(dir,p));
  const save=(p,o)=>writeFileSync(join(dir,p),JSON.stringify(o));
  save('methodics.json',{version:19});const sha=createHash('sha256').update(readFileSync(join(dir,'methodics.json'))).digest('hex');
  save('preparation.json',{version:'repair-v20',train:1025,eval:246,fresh:56,addedTrain:94,initAdapter:'anna-v19',methodicsSha256:sha});
  save('data/manifest.json',{train:1025,eval:246,promptVersion:18,referenceVersion:19,methodicsSha256:sha});
  save('anna-v20/anna-training.json',{processed_train_examples:1025,max_length:3400,reject_truncation:true,epochs:1,lr:3e-6,init_adapter:'/home/ubuntu/natal-training-v19/anna-v19',prompt_version:'18',reference_version:'19',methodics_sha256:sha,completion_only_loss:true,require_prefix_match:true,completion_mask_audit:{train:{count:1025,prompt_labels_masked:true,supervised_tokens:100},eval:{count:246,prompt_labels_masked:true,supervised_tokens:100}},training_metrics:{train_loss:1},final_eval_metrics:{eval_loss:1}});
  save('reports/memory-smoke-result.json',{status:'PASS',steps:10,peak_allocated_gib:6,peak_reserved_gib:7});
  save('reports/serving-mode.json',{mode:'offline',productionModel:'anna-v19',automaticDeployment:false});
  save('reports/completion-mask-audit.json',{status:'PASS',splits:{train:{count:1025,prefix_mismatches:0},eval:{count:246,prefix_mismatches:0}}});
  const learning=Array.from({length:246},(_,i)=>({id:'l'+i,split:'eval'})),fresh=Array.from({length:56},(_,i)=>({id:'f'+i}));
  for(const [name,rows]of [['cards',learning],['holdout',fresh]])writeFileSync(join(dir,name+'.jsonl'),rows.map(JSON.stringify).join('\n'));
  save('natal-plan.json',[{id:'n',split:'eval'}]);
  const make=(id,field)=>({id,scope:'offtopic',answer:'Ответ',expected:false,suggested:false,button:false,sensitive:false,styleFiltered:false,groundedFallback:false,rawAttempts:[],generationError:null,signalFormatValid:true,rawLearningSuggested:false,[field]:[]});
  for(const [model,prefix]of [['anna-v10','baseline'],['anna-v19','parent'],['anna-v20','candidate']]){
   for(const [name,ids,field]of [['learning',learning.map(x=>x.id),'errors'],['fresh',fresh.map(x=>x.id),'errors'],['natal',['n'],'problems'],['chat',evalSet.questions.map(x=>x.id),'problems']]){
    const rows=ids.map(id=>make(id,field));if(model==='anna-v10'&&name==='learning'){rows[0].answer='';rows[0].errors=['Local chat returned an invalid answer'];rows[0].generationError='invalid answer';}
    if(model==='anna-v20'&&name==='learning'){rows[1].rawLearningSuggested=true;rows[2].answer='Обитель Луны — Близнецы.';}
    const file=prefix==='candidate'?name==='natal'||name==='chat'?`reports/eval-${name}-anna-v20.json`:`reports/${name}.json`:`reports/${prefix}-${name}.json`;
    save(file,{model,summary:{model},day:'2026-11-02',rows});
   }
  }
  execFileSync(process.execPath,[resolve('training/report-repair-v20.mjs'),dir]);
  const result=JSON.parse(readFileSync(join(dir,'reports/after-train-anna-v20.json')));
  assert.equal(result.status,'CHECKS_COMPLETE_REVIEW_REQUIRED');assert.equal(result.checks.baselineAnswersPresent,false);assert.equal(result.checks.candidateRawDecisions,false);assert.equal(result.checks.noKnownFactPatterns,false);assert.equal(result.factualAudit.candidate.candidate[2].issues[0].code,'moon_domicile');assert.equal(result.automaticDeployment,false);assert.equal(result.manualReviewRequired,true);
  assert.equal(result.servingMode.mode,'offline');
  assert.match(readFileSync(join(dir,'reports/after-train-anna-v20.md'),'utf8'),/Ollama остановлена/u);
 }finally{rmSync(dir,{recursive:true});}
});


