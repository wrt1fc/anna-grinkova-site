// Preparation only: does not load a model, train, deploy or modify prior snapshots.
import fs from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {curriculum27} from './curriculum-v27.mjs';
import {learningAnswerProblems} from './learning-quality.mjs';
import {hasFormalAddress} from '../server/chat-style.js';
import {unsafeChatAnswer} from '../server/chat-safety.js';

export const v27ParentAdapterSha256='08de2360d408eb1c4d63ff6e2fec96a419033c5b75d0a70571ce4f7c3c098ef4';
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=path=>fs.readFileSync(path,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const normalize=q=>q.toLowerCase().replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const words=q=>new Set(normalize(q).split(' ').filter(w=>w.length>2));
function nearDuplicate(a,b){
 const x=words(a),y=words(b),intersection=[...x].filter(w=>y.has(w)).length;
 return intersection>=6&&intersection/new Set([...x,...y]).size>=.8;
}

export function selectReplay27(parent,original){
 const train=parent.filter(c=>c.split==='train');
 assert.equal(train.length,504,'Wrong immutable v26 train count');
 assert.equal(original.filter(c=>c.split==='train').length,931,'Wrong immutable v19 train count');
 const calculated=train.filter(c=>c.chartFor);
 const theory=train.filter(c=>!c.chartFor&&c.id.startsWith('v26-'));
 assert.equal(calculated.length,152,'All 152 calculated teachers must be retained');
 assert.equal(theory.length,112,'All 112 v26 theory teachers must be retained');
 const detailed=original.filter(c=>c.split==='train'&&(c.length==='detailed'||c.answer.length>=400));
 const chosen=new Map();
 const add=c=>{
  if(chosen.has(c.id))assert.deepEqual(chosen.get(c.id),c,'Conflicting replay ID '+c.id);
  else chosen.set(c.id,structuredClone(c));
 };
 [...calculated,...theory,...detailed].forEach(add);
 assert.ok(chosen.size<=384,'Mandatory replay exceeds budget; do not silently discard detailed teachers');
 const pool=original.filter(c=>c.split==='train'&&!chosen.has(c.id)).toSorted((a,b)=>hash(a.id).localeCompare(hash(b.id)));
 // Preserve coverage of every curated source before filling behaviour strata.
 const sourceIds=new Set(original.filter(c=>c.split==='train'&&c.sourceId).map(c=>c.sourceId));
 for(const sourceId of sourceIds){
  if([...chosen.values()].some(c=>c.sourceId===sourceId))continue;
  const row=pool.find(c=>c.sourceId===sourceId);
  assert.ok(row,'Missing source replay '+sourceId);add(row);
 }
 assert.ok(chosen.size<=384,'Source coverage and detailed teachers exceed replay budget');
 const groups=new Map();
 for(const c of pool.filter(c=>!chosen.has(c.id))){
  const key=JSON.stringify([c.scope,c.learning,c.family,c.length??'medium']);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(c);
 }
 const queues=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>rows);
 while(chosen.size<384){
  let added=0;
  for(const rows of queues){
   const row=rows.shift();
   if(row){add(row);added++;}
   if(chosen.size===384)break;
  }
  assert.ok(added,'Insufficient original behaviour replay');
 }
 const replay=[...chosen.values()].toSorted((a,b)=>a.id.localeCompare(b.id));
 for(const c of detailed)assert.deepEqual(replay.find(r=>r.id===c.id),c,'Detailed original lost '+c.id);
 return {replay,detailedCount:detailed.length,explicitDetailedOriginal:detailed.filter(c=>c.length==='detailed').length,sourceCount:sourceIds.size};
}

export function prepare27(parent,original,archives,methodics,curriculum=curriculum27(methodics),historyOnly=[]){
 const {replay,detailedCount,explicitDetailedOriginal,sourceCount}=selectReplay27(parent,original);
 const development=parent.filter(c=>c.split==='eval');
 assert.equal(development.length,246,'Wrong immutable development count');
 assert.deepEqual(development,original.filter(c=>c.split==='eval'),'Development snapshots differ');
 assert.equal(curriculum.train.length,64,'Expected 64 new teachers');
 assert.equal(curriculum.eval.length,32,'Expected 32 new controls');
 const historical=[...original,...parent,...archives,...historyOnly];
 const historicalQuestions=new Set(historical.map(c=>normalize(c.question)));
 const historicalIds=new Set(historical.map(c=>c.id));
 const allNew=[...curriculum.train,...curriculum.eval];
 assert.equal(new Set(allNew.map(c=>c.id)).size,96,'Duplicate new ID');
 assert.equal(new Set(allNew.map(c=>normalize(c.question))).size,96,'Duplicate new question');
 const newTrainFamilies=new Set(curriculum.train.map(c=>c.family));
 for(const c of allNew){
  assert.ok(!historicalIds.has(c.id),'New ID previously exposed '+c.id);
  assert.ok(!historicalQuestions.has(normalize(c.question)),'New question previously exposed '+c.id);
  assert.ok(!historical.some(old=>nearDuplicate(c.question,old.question)),'New wording too similar to old question '+c.id);
  assert.equal(c.length==='detailed'?c.answer.length>=400:true,true,'Incomplete detailed teacher '+c.id);
  assert.ok(c.answer.length<900,'Overlong teacher '+c.id);
  assert.ok(!hasFormalAddress(c.answer),'Formal teacher '+c.id);
  assert.ok(!unsafeChatAnswer(c.answer,'2026-11-10'),'Unsafe teacher '+c.id);
  assert.deepEqual(learningAnswerProblems(c.answer,c),[],'Teacher quality '+c.id);
 }
 for(const c of curriculum.eval){
  assert.ok(!newTrainFamilies.has(c.family),'Fresh family leaked '+c.id);
  assert.ok(!curriculum.train.some(t=>nearDuplicate(c.question,t.question)),'Fresh wording too similar to training '+c.id);
 }
 const trainingNumbers=new Set(curriculum.train.filter(c=>c.solarArcExample).map(c=>JSON.stringify(c.solarArcExample)));
 for(const c of curriculum.eval.filter(c=>c.solarArcExample))assert.ok(!trainingNumbers.has(JSON.stringify(c.solarArcExample)),'Arithmetic pair leaked '+c.id);
 const regression=new Map();
 for(const c of archives){
  assert.ok(c.split!=='train','Archive controls must stay excluded from training');
  if(regression.has(c.id))assert.deepEqual(regression.get(c.id),c,'Conflicting archive ID '+c.id);
  else regression.set(c.id,structuredClone(c));
 }
 const cards=[...replay,...structuredClone(curriculum.train),...structuredClone(development)];
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'Card ID collision');
 const selectedTrainIds=new Set(cards.filter(c=>c.split==='train').map(c=>c.id));
 assert.ok([...regression.values()].every(c=>!selectedTrainIds.has(c.id)),'Exposed control entered training');
 return {cards,holdout:curriculum.eval.map(c=>({...structuredClone(c),evaluationStatus:'UNSEEN_WORDING_UNTIL_FIRST_BASELINE_NOT_UNSEEN_CONCEPT'})),
  regression:[...regression.values()].map(c=>({...c,evaluationStatus:'EXPOSED_PRE_V27_REGRESSION_NOT_FRESH'})),
  replayCount:384,newTrain:64,detailedOriginalPreserved:detailedCount,explicitDetailedOriginal,sourceReplayCoverage:sourceCount,
  explicitDetailedNew:curriculum.train.filter(c=>c.length==='detailed').length};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [parentPath,originalPath,methodicsPath,out,...archiveArgs]=process.argv.slice(2);
 const marker=archiveArgs.indexOf('--history-only');
 const archivePaths=marker<0?archiveArgs:archiveArgs.slice(0,marker);
 const historyPaths=marker<0?[]:archiveArgs.slice(marker+1);
 if(!out||!archivePaths.length||fs.existsSync(out))throw Error('Expected v26 cards, original v19 cards, private methodics, NEW output directory and prior control archive files');
 const methodicsBytes=fs.readFileSync(methodicsPath),methodics=JSON.parse(methodicsBytes);
 assert.equal(methodics.version,19,'Wrong curated source version');
 assert.equal(methodics.entries?.length,61,'Wrong curated source count');
 const inputPaths=[parentPath,originalPath,methodicsPath,...archivePaths,...historyPaths];
 const inputHashes=inputPaths.map(path=>({path:resolve(path),sha256:hash(fs.readFileSync(path))}));
 const result=prepare27(read(parentPath),read(originalPath),archivePaths.flatMap(read),methodics,undefined,historyPaths.flatMap(read));
 const preparation={version:'repair-v27',parent:'anna-v26',parentAdapterSha256:v27ParentAdapterSha256,
  train:448,eval:246,fresh:32,exposedRegression:result.regression.length,replay:384,newTrain:64,
  detailedOriginalPreserved:result.detailedOriginalPreserved,explicitDetailedOriginal:result.explicitDetailedOriginal,
  explicitDetailedNew:result.explicitDetailedNew,sourceReplayCoverage:result.sourceReplayCoverage,
  epochs:2,lr:5e-6,maxLength:4096,chartFocusVersion:26,promptVersion:18,referenceVersion:19,
  methodicsSha256:hash(methodicsBytes),inputHashes,historyOnlyFiles:historyPaths.length,status:'PREPARED_NOT_TRAINED',automaticDeployment:false,
  heldoutStatus:'source-concept-familiar; unseen wording/numbers until first baseline; not blind afterwards',
  limitations:'Editorial drafts, not Anna approved. Private approved source adaptations are reused with new questions and supporting source context. All original long natal teachers, all v26 calculated/theory teachers and original 246 development cards are unchanged. Prior controls are regression only. No training, export or promotion is performed by preparation.'};
 fs.mkdirSync(out,{recursive:true});
 for(const name of ['cards','holdout','regression'])fs.writeFileSync(join(out,name+'.jsonl'),result[name].map(c=>JSON.stringify(c)).join('\n')+'\n');
 fs.writeFileSync(join(out,'methodics.json'),methodicsBytes);
 fs.writeFileSync(join(out,'preparation.json'),JSON.stringify(preparation,null,2));
 // Paths may refer outside this new directory; this ledger is for provenance,
 // while a launcher creates its own relative frozen-input integrity manifest.
 fs.writeFileSync(join(out,'source-input-sha256.json'),JSON.stringify(inputHashes,null,2));
 for(const [i,path]of inputPaths.entries())assert.equal(hash(fs.readFileSync(path)),inputHashes[i].sha256,'Input changed during preparation '+basename(path));
 console.log(JSON.stringify(preparation));
}
