// Evaluation-only, preregistered after the parent baseline and before candidate
// answers. Never changes training cards, model/runtime code, or an old report.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {learningAnswerProblems} from './learning-quality.mjs';

export const v27GradingRevision='v27-fresh-semantic-2026-11-11-r1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const implementationSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));
const dependencyPaths=['learning-quality.mjs','repair-v16-quality.mjs','repair-v17-quality.mjs','repair-v18-quality.mjs','answer-regressions.mjs',
 '../server/astro-reference.js','../server/theory-numerics.js','../server/anna-method.js','../server/astro-chart.js',
 '../server/astro-personal.js','../server/chat-topics.js','../config/chat-scope.json','../config/money-rules.json','../package-lock.json'];
const dependencyHashes=Object.fromEntries(dependencyPaths.map(path=>[path,sha(fs.readFileSync(new URL(path,import.meta.url)))]));
const canonical=value=>JSON.stringify(value);
const topics=new Set(['arc','progression','relocation','modality','clarification','support','offtopic','methodic']);
const distance=String.raw`[^.!?;]{0,65}`;
const commonRotation=[
 String.raw`(?<!не )(?:одн\p{L}*\s+и\s+т[уы]\p{L}*|одинаков\p{L}*|общ\p{L}*)${distance}(?:дуг|уг(?:ол|л)|поворот|сдвиг)`,
 String.raw`(?:эт[уо]\p{L}*|полученн\p{L}*)\s+(?:дуг|разност|величин|угол)\p{L}*${distance}(?<!не )(?:прибав|примен|добав|перенос|сдвиг)\p{L}*${distance}точк`,
 String.raw`(?:эту|полученную)\s+разност\p{L}*${distance}(?<!не )прибав\p{L}*${distance}точк`,
];
const contextObject=String.raw`(?:названи|обозначени|термин|показател|строк|запис|фрагмент|карт|текст|част\p{L}*\s+карт)`;
const contextRequest=[
 String.raw`(?<!не )(?:назови|напиши|пришли|уточни|покажи|сообщи|скопируй|вставь|расскажи)(?!\p{L})${distance}${contextObject}`,
 String.raw`(?:о\s+каком|о\s+какой|како\p{L}*|что\s+именно)${distance}${contextObject}[^.!?;]{0,35}\?`,
 String.raw`(?:можешь|можно)\s+(?<!не )(?:прислать|скопировать|вставить|написать|показать|уточнить)${distance}${contextObject}`,
];
const invariance=String.raw`(?:(?<!не )сохраня\p{L}*|(?<!не )оста\p{L}*|не\s+(?:меня|изменя)\p{L}*|неизменн\p{L}*)`;
const sourceContext=card=>[card.question,...(card.history??[]).map(t=>t.content)].join(' ');
const sameDayYear=[
 String.raw`(?<!не )(?:один|1)\s+(?:календарный\s+)?день${distance}(?:берут\s+за|соответству\p{L}*|равен)\s+(?:один|одному|1)\s+год`,
 String.raw`(?<!не )(?:один|1)\s+год(?:\s+жизни)?\s+(?:это|равен|соответству\p{L}*)\s+(?:одному|один|1)\s+(?:дню|день|суткам)`,
];

function revisedCard(original){
 const card=structuredClone(original),required=card.requiredMeanings??[];
 switch(card.topic){
  case 'arc': {
   const difference=['разност|разниц'];
   card.requiredMeanings=card.solarArcExample?
    [required[0],['дуг|поворот|сдвиг'],commonRotation]:[difference,commonRotation];
   break;
  }
  case 'relocation':
   // Broaden morphology while retaining each original requested relation.
   card.requiredMeanings=required.map(group=>group.map(p=>p
    .replaceAll('не меня',String.raw`не\s+(?:меня|изменя)`)
    .replaceAll('(?:меня|различ)',String.raw`(?:меня|различ|разниц)`)));
   if(/положени\p{L}*\s+планет.*аспект/iu.test(card.question))card.requiredMeanings=[
    [String.raw`планет${distance}${invariance}|${invariance}${distance}планет`],
    [String.raw`аспект${distance}${invariance}|${invariance}${distance}аспект`],
   ];
   break;
  case 'clarification':
   if(!card.history?.length)card.requiredMeanings=[contextRequest];
   else if(/прогресси/iu.test(sourceContext(card)))card.requiredMeanings=[
    [...required[0],...sameDayYear],...(required.slice(1)),
   ];
   break;
  case 'support':
   // A request for a first phrase may be answered with a usable first phrase;
   // it need not contain an invitation to tell the assistant more.
   card.requiredMeanings=[[
    ...(required[0]??[]),
    String.raw`(?:можно|попробуй|начни)${distance}(?:сказать|начать|фраз|слов)${distance}[«"]`,
    String.raw`(?:скажи|фраза|словами)\s*[:—-]?\s*[«"][^»"]{8,180}[»"]`,
    String.raw`(?<!не )могу\s+(?:выслушать|поддержать|побыть\s+рядом)`,
   ]];
   break;
  case 'methodic':
   card.requiredMeanings=required.map(group=>group.map(p=>p.replaceAll('узл',String.raw`уз(?:е)?л`)));
   break;
 }
 const extra=[];
 // General fact guards, not answer-ID exceptions. Old safety/style/length and
 // original forbidden claims remain in force in addition to these checks.
 if(card.topic==='arc'||/прогресси/iu.test(sourceContext(card))){
  extra.push(String.raw`(?<![\p{L}\d])(?<!не\s+[^.!?;,]{0,45}|нельзя[^.!?;,]{0,45}|неверно[^.!?;,]{0,45})(?:один|1)\s+градус\p{L}*\s+(?:(?:на|за)\s+)?(?:один\s+)?день`);
  extra.push(String.raw`(?<!не )прогрессивн\p{L}*\s+положени\p{L}*\s+равн\p{L}*\s+сумм\p{L}*\s+(?:их\s+)?средн\p{L}*\s+движени`);
 }
 if(card.topic==='arc'){
  extra.push(String.raw`(?:кажд\p{L}*\s+планет\p{L}*)\s+(?:получа|име|использу)\p{L}*\s+(?:собственн|сво|разн)\p{L}*\s+скорост`);
  extra.push(String.raw`(?:общ\p{L}*|одинаков\p{L}*)\s+(?:угол|поворот|дуг\p{L}*)\s+не\s+(?:нуж|использ|примен)`);
  if(card.solarArcExample){
   const {natal,progressed}=card.solarArcExample,expected=(progressed-natal+360)%360;
   extra.push(String.raw`(?:дуг|поворот|сдвиг|результат|сумм)\p{L}*[^.!?;]{0,55}(?:равн\p{L}*|составля\p{L}*|да[её]т|=)\s*(?!${expected}(?!\d))\d+\s*(?:°|градус)`);
   if(progressed<natal)extra.push(String.raw`${expected}\s*(?:°|градус\p{L}*)\s+в\s+обратн\p{L}*\s+сторон`);
  }
 }
 if(card.topic==='modality'){
  extra.push(String.raw`(?:в\s+кажд\p{L}*\s+стихи\p{L}*|в\s+стихи\p{L}*)\s+(?:по\s+)?(?<!не )(?:4|четыре)(?![\p{L}\d])\s+знак`);
  extra.push(String.raw`(?:в\s+кажд\p{L}*\s+модальност\p{L}*|в\s+модальност\p{L}*)\s+(?:по\s+)?(?<!не )(?:3|три)(?![\p{L}\d])\s+знак`);
  extra.push(String.raw`(?<!не )по\s+триад\p{L}*\s+знак`);
 }
 if(card.topic==='relocation'||card.topic==='methodic'&&/релокац|дом.*мест|мест.*дом/iu.test(sourceContext(card))){
  extra.push(String.raw`(?:геоцентрическ\p{L}*\s+)?аспект\p{L}*\s+(?<!не )(?:меня|изменя|смещ|сдвига)\p{L}*`);
 }
 if(card.topic==='methodic'&&/южн\p{L}*\s+узл|уз(?:е)?л/iu.test(sourceContext(card))){
  extra.push(String.raw`(?:возврат\p{L}*|уз(?:е)?л\p{L}*)${distance}(?<!не )(?:гарантиру|обязательно\s+(?:означа|принос))\p{L}*\s+(?:наказани|расплат)`);
 }
 card.forbiddenClaims=[...(card.forbiddenClaims??[]),...extra];
 return card;
}

export function deriveV27Grading(cards,{sourceBytes}={}){
 assert.ok(Array.isArray(cards)&&cards.length,'Fresh evaluation cards required');
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'Duplicate card IDs');
 for(const c of cards){
  assert.ok(c.split==='eval'&&!c.chartFor&&topics.has(c.topic),'Fresh non-natal cards only');
  assert.ok(!c.gradingRevision,'Already derived cards cannot be rebased silently');
 }
 const derived=cards.map(c=>({...revisedCard(c),gradingRevision:v27GradingRevision,originalCardSha256:sha(canonical(c))}));
 const manifest={revision:v27GradingRevision,implementationSha256,dependencyHashes:structuredClone(dependencyHashes),evaluationOnly:true,sourceCardsSha256:sha(sourceBytes??canonical(cards)),
  sourceCanonicalSha256:sha(canonical(cards)),derivedCanonicalSha256:sha(canonical(derived)),count:cards.length,
  preregistrationBasis:'parent baseline only; no candidate answers used',manualReviewRequired:'all rows; automated checks do not prove factual completeness',
  changes:['semantic alternatives for requested relations','inflected words and actual clarification requests','usable dialogue starts','additional general contradiction guards'],
  automaticDeployment:false,overwritesOriginal:false};
 return {cards:derived,manifest};
}

export function regradeV27Fresh(report,originalCards,derivation){
 const expected=deriveV27Grading(originalCards);
 assert.equal(derivation.manifest.revision,v27GradingRevision,'Wrong grading revision');
 assert.equal(derivation.manifest.implementationSha256,implementationSha256,'Grader implementation changed');
 assert.deepEqual(derivation.manifest.dependencyHashes,dependencyHashes,'Grader dependencies changed');
 assert.equal(derivation.manifest.sourceCanonicalSha256,expected.manifest.sourceCanonicalSha256,'Original cards changed');
 assert.equal(derivation.manifest.derivedCanonicalSha256,expected.manifest.derivedCanonicalSha256,'Derived hash changed');
 assert.deepEqual(derivation.cards,expected.cards,'Derived cards were modified');
 assert.equal(report.rows.length,originalCards.length,'Complete fresh report required');
 assert.equal(new Set(report.rows.map(r=>r.id)).size,report.rows.length,'Duplicate report row');
 const index=new Map(originalCards.map((c,i)=>[c.id,i]));
 const rows=report.rows.map(row=>{
  assert.ok(index.has(row.id),'Report contains non-fresh row');
  const i=index.get(row.id),original=originalCards[i],derived=derivation.cards[i];
  assert.equal(row.question,original.question,'Report question changed');
  assert.ok(Array.isArray(row.errors),'Recorded errors required');
  const before=learningAnswerProblems(row.answer??'',original);
  const after=row.generationError?[]:learningAnswerProblems(row.answer??'',derived);
  // Only an actual old required-meaning failure may be superseded. Every other
  // recorded error survives, including unknown errors from frozen serving code.
  const removable=new Set(before.filter(e=>/^missing meaning \d+$/u.test(e)));
  const preserved=row.errors.filter(e=>row.generationError||!removable.has(e));
  const errors=[...new Set([...preserved,...after])];
  return {...structuredClone(row),errors,originalErrors:structuredClone(row.errors),
   gradingRevision:v27GradingRevision,manualReviewRequired:true,
   gradingDelta:{removed:row.errors.filter(e=>!errors.includes(e)),added:errors.filter(e=>!row.errors.includes(e))}};
 });
 return {originalSummary:structuredClone(report.summary),
  summary:{revision:v27GradingRevision,total:rows.length,automatedClear:rows.filter(r=>!r.errors.length).length,
   automatedFailures:rows.filter(r=>r.errors.length).length,manualReviewRequired:true,automaticDeployment:false},
  originalReportSha256:sha(canonical(report)),derivation:structuredClone(derivation.manifest),
  ...(report.manualFindings?{manualFindings:structuredClone(report.manualFindings)}:{}),rows};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,input,other,out,last]=process.argv.slice(2);
 if(action==='derive'){
  if(!input||!other||out||last||fs.existsSync(other))throw Error('derive <original fresh.jsonl> <NEW directory>');
  const bytes=fs.readFileSync(input),cards=bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
  const result=deriveV27Grading(cards,{sourceBytes:bytes});
  result.manifest.preregisteredAtUtc=new Date().toISOString();
  fs.mkdirSync(other,{recursive:true});
  fs.writeFileSync(join(other,'cards.jsonl'),result.cards.map(c=>JSON.stringify(c)).join('\n')+'\n',{flag:'wx'});
  fs.writeFileSync(join(other,'manifest.json'),JSON.stringify(result.manifest,null,2),{flag:'wx'});
  console.log(JSON.stringify(result.manifest));
 }else if(action==='regrade'){
  if(!input||!other||!out||!last||fs.existsSync(last))throw Error('regrade <original fresh.jsonl> <old report.json> <FROZEN derivation directory> <NEW sidecar.json>');
  const bytes=fs.readFileSync(input),cards=bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse),report=JSON.parse(fs.readFileSync(other));
  const derivation={cards:fs.readFileSync(join(out,'cards.jsonl'),'utf8').trim().split(/\r?\n/u).map(JSON.parse),manifest:JSON.parse(fs.readFileSync(join(out,'manifest.json')))};
  assert.equal(derivation.manifest.sourceCardsSha256,sha(bytes),'Original source bytes changed');
  const result=regradeV27Fresh(report,cards,derivation);
  fs.writeFileSync(last,JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result.summary));
 }else throw Error('Expected derive or regrade; no training or generation is performed');
}
