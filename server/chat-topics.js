// Shared by routing, grounding and answer checks; everyday wording matters as much as astrology terms.
export const isRelationshipQuestion = (message) => /отношени|любов|любви|влюб|партн[её]р|замуж|брак|мужчин|женщин|женить|женат|спутник[а-яё]* жизни|вторую половин|близост|довер|ревн|ссор|расстав|развод|одиноч|супруг|свидан|личн[а-яё]* жизн/iu.test(message);
export const isPartnerPreferenceQuestion = (message) => isRelationshipQuestion(message) && /како[йягую]|какого|какую|кто мне|кого (?:мне )?(?:искать|выбрать)|мне нужен|мне нужна/iu.test(message);
export const hasPersonalReference = (message) => /(?<!\p{L})(?:я|мне|меня|мной|мо[йяёеюи](?:[а-яё]*)?|мы|нам|нас|наш[а-яё]*|сво[йяюёеих][а-яё]*)(?!\p{L})/iu.test(message);
const LIFE_TOPIC = /сильн[а-яё]* сторон|слаб[а-яё]* сторон|талант|способност|характер|темперамент|самооценк|эмоци|границ|призвани|предназначени|реализ|заниматься|откладыва|прокрастин|уверенн|выгоран|тревож|мотиваци|восстанов|устал|отдых|раздраж|договар|говорить о|желани|выража[а-яё]* забот/iu;
const PLANET_TOPIC = /солнц|лун[а-яё]*|меркури|венер|марс|юпитер|сатурн|уран|нептун|плутон/iu;
// Personal application requires a life topic; addressing a planet definition with
// «мне» alone does not make that definition a reading of the visitor's chart.
export const isPersonalLifeApplication = (message) => hasPersonalReference(message)
  && (isRelationshipQuestion(message) || LIFE_TOPIC.test(message));
export const isPersonalLifeQuestion = (message) => hasPersonalReference(message)
  && (isRelationshipQuestion(message) || LIFE_TOPIC.test(message) || PLANET_TOPIC.test(message)) || isPartnerPreferenceQuestion(message);

// Match the whole message: a named new subject must never inherit an old topic.
// The same predicate skips dependent history turns, preserving the last real
// user question through a chain of clarifications and intervening assistant text.
const DEPENDENT_QUESTION = /^\s*(?:(?:а|и|ну|тогда)\s+)?(?:подробнее|конкретнее|почему\s+(?:это|так)|что\s+(?:это|с\s+этим)\s+(?:значит|делать)|что\s+(?:именно\s+)?(?:сделать|делать)(?:\s+(?:сначала|вначале|в\s+первую\s+очередь))?|с\s+чего\s+начать|как\s+(?:это|с\s+этим)\s+(?:исправить|работать|связано|проявляется(?:\s+в\s+(?:работе|отношениях|жизни|деньгах))?)|можно\s+(?:подробнее|пример)|дай\s+(?:пример|(?:[1-5]|один|два|две|три|четыре|пять)\s+(?:(?:конкретн|практическ|небольш|прост|понятн)\p{L}*\s+)?(?:шаг\p{L}*|действи\p{L}*|пункт\p{L}*))|(?:объясни|скажи)\s+(?:подробнее|проще|попроще|простыми\s+словами))(?:\s+(?:простыми\s+словами|проще|попроще))?[?!.,…]*\s*$/iu;
const APPLICATION_CLARIFICATION=/^\s*(?:а\s+)?как\s+это\s+проявляется\s+в\s+(работе|отношениях|жизни|деньгах)[?!.,…]*\s*$/iu;
export function applicationClarification(question){
 return String(question).split('\nУточнение: ').reverse().map(part=>APPLICATION_CLARIFICATION.exec(part)?.[1]).find(Boolean)??null;
}
export const isSimplificationRequest=message=>/^\s*(?:а\s+)?(?:если\s+)?(?:(?:объясни(?:ть)?|скажи|расскажи|можно)\s+(?:это\s+)?)?(?:совсем\s+)?(?:проще|попроще|по[-\s]простому|простыми\s+словами|обычными\s+словами|без\s+(?:терминов|сложных\s+слов)|короче)(?:\s*,?\s*без\s+(?:планет|знаков|домов|терминов)(?:\s*(?:,|и)\s*(?:планет|знаков|домов|терминов))*)?(?:\s*,?\s*пожалуйста)?[.!?…]*\s*$/iu.test(message);
export const wantsNoAstroTerms=message=>/по[-\s]простому|обычными\s+словами|без\s+(?:астрологическ\p{L}*\s+)?(?:терминов|сложных\s+слов|домов|планет|знаков|названий\s+(?:планет|знаков))|не\s+(?:называй|используй|упоминай)[^.!?]{0,30}(?:термин|названи\p{L}*\s+планет|планет|знак|дома|домов)/iu.test(message);
const dependentQuestion=message=>DEPENDENT_QUESTION.test(message)||isSimplificationRequest(message);
export const isMeaningClarification=message=>isSimplificationRequest(message)||/^\s*(?:а\s+)?что\s+это\s+значит(?:\s+простыми\s+словами)?[.!?…]*\s*$/iu.test(message);
export function repeatedSimplification(answer,message,history=[]){
 if(!isSimplificationRequest(message))return false;
 const previous=[...history].reverse().find(row=>row.role==='assistant'&&typeof row.content==='string');
 const normalized=text=>text.replace(/^\s*Привет[!.,]?\s*/iu,'').replace(/^\s*Главное\s*[—–:-]\s*/iu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 if(!previous)return false;
 const after=normalized(answer),before=normalized(previous.content);
 if(Math.min(after.length,before.length)<=60)return false;
 if(after===before)return true;
 const grams=text=>{const words=text.split(' ');return new Set(words.slice(0,-2).map((_,i)=>words.slice(i,i+3).join(' ')));};
 const a=grams(after),b=grams(before),common=[...a].filter(g=>b.has(g)).length;
 return a.size+b.size>0&&2*common/(a.size+b.size)>=0.9;
}
export function groundingQuestion(message, history = []) {
  if (!dependentQuestion(message)) return message;
  let scoped=null;
  for(const item of [...history].reverse()){
    if(item.role!=='user'||typeof item.content!=='string')continue;
    if(!dependentQuestion(item.content))return [item.content,...(scoped&&!APPLICATION_CLARIFICATION.test(message)?[scoped]:[]),message].join('\nУточнение: ');
    if(!scoped&&APPLICATION_CLARIFICATION.test(item.content))scoped=item.content;
  }
  return message;
}

// Explicit own-sign requests stand alone, including corrections of an earlier topic.
export function personalSolarSignQuestion(message) {
  const text = String(message);
  if(applicationClarification(text))return false;
  if (/асцендент|лунн\p{L}*\s+знак|знак\p{L}*\s+Лун/iu.test(text)) return false;
  return /кто\s+я\s+по\s+гороскопу|под\s+каким\s+знаком\s+я\s+родил/iu.test(text)
    || /(?:знак\p{L}*\s+зодиак\p{L}*|солнечн\p{L}*\s+знак|знак\p{L}*\s+Солнц)/iu.test(text)
      && (hasPersonalReference(text) || /я\s+спрашиваю|назови\s+(?:только\s+)?(?:его|знак)/iu.test(text));
}
