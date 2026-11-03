// Observable regression checks, not a claim that an answer is factually complete.
export function learningAnswerProblems(answer, card) {
 const problems=[];
 if(/(?<!\p{L})(?:ИИ|нейросет\p{L}*|языковая модель)(?!\p{L})/iu.test(answer))problems.push('AI words');
 if(/\bforecast\b|\bchart\.(?:aspects|relationship)\b|беру.*из.*facts|не шути и не обесценивай/iu.test(answer))problems.push('instruction echo');
 for(const [i,alternatives]of (card.requiredMeanings??[]).entries()) {
  if(!alternatives.some(pattern=>new RegExp(pattern,'iu').test(answer)))problems.push('missing meaning '+(i+1));
 }
 for(const pattern of card.forbiddenClaims??[])if(new RegExp(pattern,'iu').test(answer))problems.push('known false claim');
 return problems;
}
