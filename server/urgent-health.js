import {conversationalOpening} from './chat-style.js';

// Emergency referral, never a diagnosis or a treatment recommendation.
// https://www.nhs.uk/symptoms/chest-pain/
// https://mchs.gov.ru/deyatelnost/bezopasnost-grazhdan/kak-pravilno-vyzvat-skoruyu_5
export const URGENT_HEALTH_ANSWER='Сейчас немедленно вызови скорую помощь: в России — 103 или 112, в другой стране — местную экстренную службу. Сильная боль в груди или в области сердца требует срочной медицинской помощи. Не жди ответа по карте или прогноза; сообщи диспетчеру симптомы и своё местонахождение.';

// Bounded current-symptom recognizer. Quotes, past events, dreams, hypotheticals and
// explicit denials are not evidence of a current emergency. It does not classify all illnesses.
export function isUrgentHealthMessage(message){
 const text=message.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,' ');
 const location='(?:сердц\\p{L}*|(?:в\\s+)?груд(?:ь|и|ной\\s+клетке))';
 const severe='(?:сильно|очень|невыносимо|резко|внезапно)';
 const pain='(?:болит|заболело|давит|сжимает)';
 const adjective='(?:сильн|остр|резк|невыносим)\\p{L}*';
 const nounPain=`${adjective}\\s+(?:(?:давящ|сжимающ|жгуч)\\p{L}*\\s+)?бол[ьи]\\p{L}*`;
 const symptomPattern=new RegExp(`${severe}\\s+${pain}\\s+(?:у\\s+меня\\s+)?${location}|${location}\\s+(?:сейчас\\s+)?${severe}\\s+${pain}|${location}\\s+${pain}\\s+(?:очень\\s+)?(?:сильно|невыносимо)|${nounPain}\\s+(?:в\\s+(?:области\\s+)?)?${location}|${location}\\s+(?:сейчас\\s+)?${nounPain}`,'giu');
 let urgent=false;
 for(const sentence of text.split(/[.!?;\n]+/u)){
  let fictional=false;
  for(const rawClause of sentence.split(/[,;]|\s+(?=(?:но|зато|а)\s+)/iu)){
   // A denied metaphor/dream must not negate an actual symptom declaration.
   const clause=rawClause.replace(/не\s+(?:метафора|сон|образно|фигурально)/giu,' ');
   const current=/сейчас|теперь|наяву|не\s+проходит|до\s+сих\s+пор/iu.test(clause);
   // "Что сейчас..." can still describe the dream; an explicit contrast/actual-world
   // shift is needed to leave that scope inside the same sentence.
   if(current&&(/^\s*(?:но|а|зато)\s+(?:сейчас|теперь|наяву)/iu.test(clause)||/наяву/iu.test(clause)))fictional=false;
   if(/(?<!\p{L})(?:сон|сны|сне)(?!\p{L})|снил\p{L}*|снюсь|в\s+(?:книге|учебнике|фильме)|фраз\p{L}*|цитат\p{L}*/iu.test(clause))fictional=true;
   const metaphor=/метафор|образно|фигурально|душевн|разбит\p{L}*\s+сердц|из-за\s+(?:расставан|разлук|любви)|за\s+(?:команд|судьб)/iu.test(clause);
   const resolved=/уже\s+прошл\p{L}*|сейчас\s+(?:не\s+болит|прошл\p{L}*|вс[её]\s+прошл\p{L}*)/iu.test(clause);
   if(metaphor||resolved){
    // A later person's resolution or an old metaphor cannot erase an earlier alarm.
    // Only an explicit referential correction of the current statement retracts it.
    if(/^\s*(?:это\s+(?:лишь\s+|только\s+)?метафора|говорю\s+(?:образно|фигурально))/iu.test(clause))urgent=false;
    continue;
   }
   const historical=/вчера|позавчера|раньше|в\s+прошлом|неделю\s+назад|год\s+назад/iu.test(clause);
   const hypothetical=/^\s*(?:если|допустим|предположим|например|когда-нибудь)(?!\p{L})/iu.test(clause);
   const educational=/^\s*(?:что\s+(?:такое|означает)|объясни|расскажи|как\s+отличить|что\s+делать\s+при|когда\s+нужн\p{L}*\s+скорая\s+при)/iu.test(clause)&&!/(?<!\p{L})(?:у меня|у него|у неё|у нее|сейчас)(?!\p{L})/iu.test(clause);
   if(fictional||hypothetical||educational||(historical&&!current))continue;
   for(const symptom of clause.matchAll(symptomPattern)){
    const prefix=clause.slice(0,symptom.index);
    if(!/(?<!\p{L})(?:не|нет|никакой|без)\s+(?:никакой\s+)?$/iu.test(prefix))urgent=true;
   }
  }
 }
 return urgent;
}

export function urgentHealthReply(message,history=[]){
 if(!isUrgentHealthMessage(message))return null;
 return {answer:conversationalOpening(URGENT_HEALTH_ANSWER,history),model:null,urgentHealth:true,groundedFallback:true,learningSuggested:false,truncated:false};
}
