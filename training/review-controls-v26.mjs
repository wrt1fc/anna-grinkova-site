// Derive grading-only revisions; never rewrite frozen training inputs or old reports.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {curriculum26} from './curriculum-v26.mjs';

export function deriveReviewControls(original){
 assert.equal(original.length,24,'Expected the complete 24-control frozen set');
 const revised=new Map(curriculum26().eval.map(card=>[card.id,card]));
 let updated=0;
 const result=original.map(card=>{
  const rubric=revised.get(card.id);if(!rubric)return structuredClone(card);
  for(const key of ['question','answer','learning','split','chartFor'])assert.deepEqual(card[key],rubric[key],'Frozen control identity changed: '+card.id+'/'+key);
  updated++;
  const next={...structuredClone(card),requiredMeanings:rubric.requiredMeanings,rubricVersion:3};
  if(rubric.forbiddenClaims)next.forbiddenClaims=rubric.forbiddenClaims;
  return next;
 });
 assert.equal(updated,12,'Expected all twelve theory controls');
 assert.equal(new Set(result.map(card=>card.id)).size,24,'Duplicate control');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output)||fs.existsSync(output+'.revision.json'))throw Error('Expected frozen controls and NEW output path');
 const source=fs.readFileSync(input),cards=source.toString().trim().split(/\r?\n/u).map(JSON.parse);
 const derived=deriveReviewControls(cards).map(card=>JSON.stringify(card)).join('\n')+'\n';
 const sha=value=>createHash('sha256').update(value).digest('hex');
 fs.writeFileSync(output,derived,{flag:'wx'});
 fs.writeFileSync(output+'.revision.json',JSON.stringify({rubricVersion:3,originalSha256:sha(source),derivedSha256:sha(derived),trainingInputsModified:false,questionsAndAnswersUnchanged:true,status:'GRADING_REVISION_NOT_NEW_OR_BLIND_HOLDOUT',reason:'Remove unasked exposition; accept equivalent inflections and conclusions. Factual rejection and original reports preserved.'},null,2),{flag:'wx'});
}
