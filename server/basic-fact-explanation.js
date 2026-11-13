import {eligibleNatalFacts,ownPointQuestion,positionText} from './chat-fact-answers.js';
import {calculatedPointMeaning,personalSolarSignAnswer} from './chart-answer-check.js';
import {isSimplificationRequest} from './chat-topics.js';
const SIMPLE={sun:'Это о важных целях и о том, как ты проявляешь себя.',moon:'Это о поддержке и ощущении спокойствия.',mercury:'Это о мышлении, обучении и общении.',venus:'Это о симпатии, ценностях и выражении расположения.',mars:'Это об инициативе и о том, как действовать.',jupiter:'Это о расширении опыта и поиске смысла.',saturn:'Это об ответственности, границах и практике.',uranus:'Это о самостоятельности и новых подходах.',neptune:'Это о воображении и чувствительности.',pluto:'Это о переменах и пересмотре привычного.',asc:'Это о первом впечатлении и начале общения.',mc:'Это о профессиональных целях.'};

// Existing editorial meanings only. A model paraphrase is not proof of source support.
export function basicFactExplanation(chart,question,length,history=[]){
 if(length==='detailed'||!eligibleNatalFacts(chart,question))return null;
 const key=ownPointQuestion(question,'meaning');
 if(!key||!SIMPLE[key])return null;
 if(chart.solarSignUncertain&&key==='sun')return personalSolarSignAnswer(chart);
 if(chart.uncertainPositions?.includes(key))return `${positionText(chart.calculated,key,{houseOnly:true})} Знак может меняться в течение этого дня; без времени рождения не буду давать точную личную трактовку.`;
 if(!chart.calculated.angles)return 'Для точного личного пояснения нужно время рождения. Без него дома не определяю; положение возле перехода знаков тоже может быть неоднозначным.';
 if(isSimplificationRequest(question.split('\nУточнение: ').at(-1))){
  const text=`${SIMPLE[key]} Это тема для размышления, а не оценка твоего характера.\n${positionText(chart.calculated,key)}`;
  const previous=[...history].reverse().find(row=>row.role==='assistant')?.content??'';
  return previous.replace(/^Привет!\s*/u,'').trim()===text?`${positionText(chart.calculated,key)} Какую часть пояснить: сам показатель или его значение?`:text;
 }
 const meaning=calculatedPointMeaning(chart,key);
 return meaning?`${meaning}\n${positionText(chart.calculated,key)}`:null;
}
