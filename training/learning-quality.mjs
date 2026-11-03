// Observable regression checks, not a claim that an answer is factually complete.
import scopePolicy from '../config/chat-scope.json' with {type:'json'};
const body=text=>text.replace(/^\s*Привет[!.,]?\s*/iu,'').replace(/\s+/gu,' ').trim();
export function learningAnswerProblems(answer, card) {
 const problems=[];
 if(/(?<!\p{L})(?:ИИ|нейросет\p{L}*|языковая модель)(?!\p{L})/iu.test(answer))problems.push('AI words');
 if(/\bforecast\b|\bchart\.(?:aspects|relationship)\b|беру.*из.*facts|не шути и не обесценивай/iu.test(answer))problems.push('instruction echo');
 for(const [i,alternatives]of (card.requiredMeanings??[]).entries()) {
  if(!alternatives.some(pattern=>new RegExp(pattern,'iu').test(answer)))problems.push('missing meaning '+(i+1));
 }
 for(const pattern of card.forbiddenClaims??[])if(new RegExp(pattern,'iu').test(answer))problems.push('known false claim');
 if(card.scope==='offtopic'&&body(answer)!==body(scopePolicy.reply))problems.push('scope: unrelated task was not redirected with the approved reply');
 if(card.scope&&card.scope!=='offtopic'&&(body(answer)===body(scopePolicy.reply)||answer.includes('С этой темой не помогу')))problems.push('scope: false refusal of an allowed or sensitive question');
 return problems;
}
