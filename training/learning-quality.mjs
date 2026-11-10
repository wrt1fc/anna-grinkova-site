// Observable regression checks, not a claim that an answer is factually complete.
import scopePolicy from '../config/chat-scope.json' with {type:'json'};
import {repairAnswerProblems} from './repair-v16-quality.mjs';
import {repair17AnswerProblems} from './repair-v17-quality.mjs';
import {repair18AnswerProblems,basicFactProblems} from './repair-v18-quality.mjs';
import {sourceGroundedTheoryProblems} from '../server/astro-reference.js';
import {orbExample,incorrectOrbClaim} from '../server/theory-numerics.js';
const body=text=>text.replace(/^\s*Привет[!.,]?\s*/iu,'').replace(/\s+/gu,' ').trim();
export function learningAnswerProblems(answer, card) {
 const problems=sourceGroundedTheoryProblems(answer,{question:card.question??''}).map(problem=>'source: '+problem);
 if(incorrectOrbClaim(answer,orbExample(card.question??'')))problems.push('source: incorrect orb arithmetic or conclusion');
 if(/(?<!\p{L})(?:ИИ|нейросет\p{L}*|языковая модель)(?!\p{L})/iu.test(answer))problems.push('AI words');
 if(/\bforecast\b|\bchart\.(?:aspects|relationship)\b|беру.*из.*facts|не шути и не обесценивай/iu.test(answer))problems.push('instruction echo');
 for(const [i,alternatives]of (card.requiredMeanings??[]).entries()) {
  if(!alternatives.some(pattern=>new RegExp(pattern,'iu').test(answer.replace(/\s+/gu,' '))))problems.push('missing meaning '+(i+1));
 }
 for(const pattern of card.forbiddenClaims??[])if(new RegExp(pattern,'iu').test(answer))problems.push('known false claim');
 if(card.scope==='offtopic'&&body(answer)!==body(scopePolicy.reply))problems.push('scope: unrelated task was not redirected with the approved reply');
 if(card.scope&&card.scope!=='offtopic'&&(body(answer)===body(scopePolicy.reply)||answer.includes('С этой темой не помогу')))problems.push('scope: false refusal of an allowed or sensitive question');
 if(card.qualityVersion===19)problems.push(...basicFactProblems(answer).map(p=>'v19: '+p));
 return [...problems,...repairAnswerProblems(answer,card),...repair17AnswerProblems(answer,card),...repair18AnswerProblems(answer,card)];
}
