import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import evalSet from './eval-questions.json' with {type:'json'};
import {assessRepairRun} from './repair-v16-gates.mjs';
import {astroFactProblems} from '../server/astro-fact-guard.js';
const [root]=process.argv.slice(2);if(!root)throw Error('Expected experiment root');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const rows=p=>readFileSync(join(root,p),'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const p=read('preparation.json'),m=read('data/manifest.json'),meta=read('anna-v20/anna-training.json'),smoke=read('reports/memory-smoke-result.json'),mask=read('reports/completion-mask-audit.json');
assert.equal(p.version,'repair-v20');assert.equal(p.train,1025);assert.equal(p.eval,246);assert.equal(p.fresh,56);assert.equal(p.addedTrain,94);assert.equal(p.initAdapter,'anna-v19');
assert.equal(m.train,p.train);assert.equal(m.eval,p.eval);assert.equal(m.promptVersion,18);assert.equal(m.referenceVersion,19);
assert.equal(meta.epochs,1);assert.equal(meta.lr,3e-6);assert.match(meta.init_adapter,/natal-training-v19\/anna-v19$/u);
assert.equal(meta.prompt_version,'18');assert.equal(meta.reference_version,'19');
const sourceSha=createHash('sha256').update(readFileSync(join(root,'methodics.json'))).digest('hex');
for(const v of [p.methodicsSha256,m.methodicsSha256,meta.methodics_sha256])assert.equal(v,sourceSha);
assert.equal(meta.completion_only_loss,true);assert.equal(meta.require_prefix_match,true);assert.equal(mask.status,'PASS');
for(const [split,count]of [['train',p.train],['eval',p.eval]]){
 assert.equal(mask.splits[split].count,count);assert.equal(mask.splits[split].prefix_mismatches,0);
 assert.equal(meta.completion_mask_audit[split].count,count);assert.equal(meta.completion_mask_audit[split].prompt_labels_masked,true);assert.ok(meta.completion_mask_audit[split].supervised_tokens>0);
}
const expected={train:p.train,learning:rows('cards.jsonl').filter(c=>c.split==='eval').map(c=>c.id),fresh:rows('holdout.jsonl').map(c=>c.id),natal:read('natal-plan.json').filter(c=>c.split==='eval').map(c=>c.id),chat:evalSet.questions.map(q=>q.id)};
const candidate={candidate:read('reports/learning.json'),fresh:read('reports/fresh.json'),natal:read('reports/eval-natal-anna-v20.json'),chat:read('reports/eval-chat-anna-v20.json')};
const base=prefix=>({baseline:read(`reports/${prefix}-learning.json`),freshBase:read(`reports/${prefix}-fresh.json`),natalBase:read(`reports/${prefix}-natal.json`),chatBase:read(`reports/${prefix}-chat.json`)});
const baseline=base('baseline'),parent=base('parent');
for(const r of [candidate.natal,candidate.chat,baseline.natalBase,baseline.chatBase,parent.natalBase,parent.chatBase])assert.equal(r.day,'2026-11-02');
const assess=(b,model)=>assessRepairRun({...candidate,...b,expected,meta,smoke,candidateModel:'anna-v20',baselineModel:model,requireTelemetry:true});
const v10=assess(baseline,'anna-v10'),v19=assess(parent,'anna-v19');
const factRows=report=>report.rows.map(row=>({id:row.id,question:row.question,issues:astroFactProblems(row.answer,{question:row.question??''}),rawIssues:(row.rawAttempts??[]).flatMap((t,i)=>astroFactProblems(t.rawText??'',{question:row.question??''}).map(issue=>({attempt:i+1,...issue})))}));
const factualAudit={candidate:Object.fromEntries(Object.entries(candidate).map(([k,r])=>[k,factRows(r)])),parent:Object.fromEntries(Object.entries(parent).map(([k,r])=>[k,factRows(r)])),baseline:Object.fromEntries(Object.entries(baseline).map(([k,r])=>[k,factRows(r)])),limitation:'Bounded observed patterns, not complete semantic validation. Original generation remains unchanged; manual review of every answer required.'};
const checks={...v10.checks,parentAnswersPresent:v19.checks.baselineAnswersPresent,noParentIndividualRegression:v19.checks.noIndividualRegression,noKnownFactPatterns:Object.values(factualAudit.candidate).flat().every(r=>!r.issues.length)};
const status=Object.values(checks).every(Boolean)?'CHECKS_COMPLETE_PASS':'CHECKS_COMPLETE_REVIEW_REQUIRED';
const summary=b=>({learning:b.baseline.summary,fresh:b.freshBase.summary,natal:b.natalBase.summary,chat:b.chatBase.summary});
const result={status,model:'anna-v20',checks,regressions:{v10:v10.regressions,v19:v19.regressions},failures:v10.failures,factualAudit,preparation:p,training:meta,memorySmoke:smoke,completionMaskAudit:mask,baseline:summary(baseline),parent:summary(parent),candidate:{learning:candidate.candidate.summary,fresh:candidate.fresh.summary,natal:candidate.natal.summary,chat:candidate.chat.summary},sourceOpenBook:true,manualReviewRequired:true,automaticDeployment:false,productionModelUnchanged:'anna-v19'};
const text=['# anna-v20: исправления оставшихся ошибок v19','',`Статус: ${status}. Кандидат к сайту не подключён. Нужен ручной обзор всех ответов.`,'',JSON.stringify(result,null,2),'','Ограничения: прежние вопросы открыты; 24 новых формулировки знакомых понятий не являются независимым экзаменом неизвестных концепций. Методички доступны как справка. Проверка весов выполняется без runtime fact guard, чтобы исправления не подменялись запасным текстом. Смысловые признаки неполны; даже PASS не доказывает безошибочность. Synthetic drafts не одобрены Анной. Production остаётся v19, learned invitations выключены; временно использовался CPU для сохранения ответов во время GPU-обучения.',''].join('\n');
for(const ext of ['json','md','txt'])writeFileSync(join(root,'reports/after-train-anna-v20.'+ext),ext==='json'?JSON.stringify(result,null,2):ext==='txt'?text.replace(/^#+\s*/gmu,''):text);
writeFileSync(join(root,'reports/status.txt'),status+'\n');console.log(JSON.stringify({status,checks,regressions:result.regressions}));

