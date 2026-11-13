// Observable rubric revision. These checks do not establish full semantic accuracy.
import {quality29} from './quality-v29.mjs';
import {learningAnswerProblems} from './learning-quality.mjs';
import {wrongCalculatedClaim,namedChartPoints} from '../server/chart-answer-check.js';
import {intentAnswerProblem} from '../server/chat-explanation.js';
import {groundingQuestion} from '../server/chat-topics.js';
import {requestedStepCount,chatIntent} from '../server/chat-intent.js';

export function revision31Card(card){
 const c=structuredClone(card);
 // Retain the task, not a required editorial word such as «расчёт».
 if(['income','unsupported-source','unsupported-metaphor','steps'].includes(c.topic))c.requiredMeanings=[];
 if(c.topic==='growth')c.requiredMeanings=[['навык|задач|практик|потренир|попроб|провер']];
 if(c.topic==='workfit')c.requiredMeanings=[['професси|заняти|работ'],['опыт|проект|подработ|стажиров|попроб|провер|сравн|проб|услови|задач']];
 if(c.topic==='relationship')c.requiredMeanings=[['симпати|ценност|близост|отношени|довер|любов|чувств']];
 return {...c,rubricVersion:31};
}

export function quality31(answer,card,chart){
 const question=groundingQuestion(card.question,card.history??[]);
 const errors=[...learningAnswerProblems(answer,card),...quality29(answer,card)];
 if(wrongCalculatedClaim(answer,chart))errors.push('calculated fact contradiction');
 if(intentAnswerProblem(answer,question,{checkCount:false}))errors.push('wrong practical intent');
 const count=requestedStepCount(question);
 if(count&&['workfit','income','growth','promotion','budget','support','rest'].includes(chatIntent(question))&&(answer.replace(/^Привет!\s*/u,'').match(/(?:^|\n)\s*\d+[.)]\s+/gu)??[]).length!==count)errors.push('requested numbered format');
 if(card.topic==='income'&&chart?.calculated?.houseRulers){
  const names=new Set(namedChartPoints(answer));
  const rulers=chart.calculated.houseRulers.find(r=>r.house===2)?.rulers??[];
  if(rulers.some(r=>!names.has(r.planet)))errors.push('missing calculated monetary ruler');
 }
 if(card.topic==='unsupported-metaphor'&&!/(?:не\s+(?:доказыва\p{L}*|позволя\p{L}*\s+(?:предсказ|определ|вывест)\p{L}*)|нельзя\s+(?:определ|предсказ|вывест)\p{L}*|не\s+следует)/iu.test(answer))errors.push('physical inference not rejected');
 if(card.topic==='unsupported-source'&&!/(?:нет|не\s+дано|не\s+указано|отсутствует)[^.!?\n]{0,45}(?:определени|объяснени|описани)|не\s+знаю[^.!?\n]{0,35}(?:значени|определени)/iu.test(answer))errors.push('missing source limitation');
 for(const sentence of answer.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,' ').split(/[.!?;\n]/u)){
  if(/(?<!\p{L})(?:не|нельзя|неверно|если)(?!\p{L})/iu.test(sentence))continue;
  if(card.topic==='unsupported-metaphor'&&/доказыва|определя|показыва|предсказыва/iu.test(sentence)&&/рост|вес|внешност/iu.test(sentence))errors.push('unsupported physical assertion');
  if(card.topic==='unsupported-source'&&/(?:твой|этот|такой)\s+тип\s+(?:означает|говорит|показывает)/iu.test(sentence))errors.push('invented type meaning');
 }
 return [...new Set(errors)];
}
