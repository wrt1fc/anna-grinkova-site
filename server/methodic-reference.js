// Explicit isolated experiment only. Never loads raw documents or executes their instructions.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
let cached;
const stop=new Set('какие какой какую каком каких как что это для при или без один только можно нужно будет методик методичк материал объяснит расскажи связан связыва использ значит рассматр'.split(' '));
const words=text=>[...new Set((text.toLowerCase().replaceAll('ё','е').match(/[а-яa-z]+/gu)??[]).map(w=>w.length>6?w.slice(0,6):w).filter(w=>w.length>=3&&!stop.has(w)&&!stop.has(w.slice(0,5))))];
export function loadMethodics(){
 const path=process.env.ANNA_METHODICS_FILE,expected=process.env.ANNA_METHODICS_SHA256;
 if(!path)return [];
 if(!expected||!/^[a-f0-9]{64}$/u.test(expected))throw Error('Methodic snapshot hash required');
 if(cached?.path===path&&cached.expected===expected)return cached.entries;
 const bytes=readFileSync(path);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Methodic snapshot hash mismatch');
 const document=JSON.parse(bytes);
 if(document.version!==19||!Array.isArray(document.entries)||!document.entries.length)throw Error('Invalid curated methodic snapshot');
 const ids=new Set();
 for(const e of document.entries){
  if(ids.has(e.id)||!e.id||!e.sourceId||!e.question||!e.answer||e.answer.length>800||typeof e.reference!=='string'||e.reference.length<20||e.reference.length>500||e.reference===e.answer||e.status!=='reviewed-adaptation-draft-not-Anna-approved')throw Error('Unreviewed methodic entry');
  ids.add(e.id);
 }
 cached={path,expected,entries:document.entries};return cached.entries;
}
export function methodicReference(message,history=[]){
 if(/\b(?:SQL|Python|JavaScript)\b|напиш\p{L}* код|рецепт|переведи|сильн.{0,15}боль.{0,15}груд|сильно болит (?:сердце|грудь)/iu.test(message))return null;
 let query=words(message);
 if(query.length<2&&history.length)query=words([...history].reverse().find(t=>t.role==='user')?.content??message);
 if(!query.length)return null;
 const entries=loadMethodics();
 const ranked=entries.map(e=>{
  const title=words(e.question+' '+e.evalQuestion),content=words(e.reference);
  const overlap=query.filter(w=>title.includes(w));
  const score=overlap.length/Math.sqrt(Math.max(1,title.length))+query.filter(w=>content.includes(w)).length*.04;
  return {e,score,overlap:overlap.length};
 }).filter(r=>r.overlap>=2&&r.score>=.6).sort((a,b)=>b.score-a.score||a.e.id.localeCompare(b.e.id)).slice(0,2);
 return ranked.length?{version:19,kind:'curated-author-method-not-calculated-chart',entries:ranked.map(({e})=>({id:e.id,sourceId:e.sourceId,paragraphs:[e.paragraphStart,e.paragraphEnd],text:e.reference}))}:null;
}
