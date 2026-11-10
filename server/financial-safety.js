import {conversationalOpening} from './chat-style.js';

// Product choice is outside a natal interpretation. Real financial decisions need
// the actual terms, budget and risks (Bank of Russia financial education):
// https://fincult.info/upload/iblock/070/uchebnik_e_book.pdf
const ASTRO=/по\s+(?:натальн\p{L}*\s+)?карт\p{L}*|натальн\p{L}*\s+карт\p{L}*|гороскоп|астрологи/iu;
const PRODUCT='(?:кредит\\p{L}*|за[её]м\\p{L}*|ипотек\\p{L}*|вложени\\p{L}*|инвестици\\p{L}*)';
const CHOOSE=new RegExp(`(?:выбрать|выбирать|выбери|подобрать|подбери|взять|возьми|брать|оформить|оформи|посоветуй|порекомендуй)[^.!?;]{0,45}${PRODUCT}|(?:выбор|подбор)\\s+${PRODUCT}|как(?:ой|ая|ое|ие|ую|ого|ому|их)\\p{L}*\\s+${PRODUCT}[^.!?;]{0,35}(?:лучше|выбрать|взять|подход\\p{L}*)`,'iu');
export const FINANCIAL_DECISION_ANSWER='Карта не даёт оснований выбирать кредит или рискованное вложение. Для решения нужны реальные условия и оценка рисков, а не положение планет. Это можно обсудить с финансовым специалистом; здесь — поговорить о твоих переживаниях и привычках в обращении с деньгами.';
export function financialDecisionReply(message,history=[]){
  const text=message.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,' ');
  if(!ASTRO.test(text))return null;
  const decision=text.split(/[.!?;,\n]|\s+(?:но|однако|а)\s+/iu).some(clause=>{
    if(/не\s+(?:хочу|планирую|собираюсь|буду|надо|нужно)\s+(?:брать|выбирать|взять|оформлять)/iu.test(clause))return false;
    const feelings=/боюсь|страшно|тревож|переживаю|страх/iu.test(clause);
    const request=/како[йяеюгмх]|какие|стоит\s+ли|можно\s+ли|подбери|выбери|посоветуй|порекомендуй|помоги/iu.test(clause);
    return CHOOSE.test(clause)&&(!feelings||request);
  });
  if(!decision)return null;
  return {answer:conversationalOpening(FINANCIAL_DECISION_ANSWER,history),model:null,groundedFallback:true,financialSafety:true,learningSuggested:false,truncated:false};
}
