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
const DEPENDENT_QUESTION = /^\s*(?:(?:а|и|ну|тогда)\s+)?(?:подробнее|конкретнее|почему\s+(?:это|так)|что\s+(?:это|с\s+этим)\s+(?:значит|делать)|что\s+(?:именно\s+)?(?:сделать|делать)(?:\s+(?:сначала|вначале|в\s+первую\s+очередь))?|с\s+чего\s+начать|как\s+(?:это|с\s+этим)\s+(?:исправить|работать|связано)|можно\s+(?:подробнее|пример)|дай\s+пример|объясни\s+(?:подробнее|проще))[?!.,…]*\s*$/iu;
export function groundingQuestion(message, history = []) {
  if (!DEPENDENT_QUESTION.test(message)) return message;
  const previous = [...history].reverse().find((item) => item.role === 'user' && typeof item.content === 'string'
    && !DEPENDENT_QUESTION.test(item.content));
  return previous ? `${previous.content}\nУточнение: ${message}` : message;
}

// Explicit own-sign requests stand alone, including corrections of an earlier topic.
export function personalSolarSignQuestion(message) {
  const text = String(message);
  if (/асцендент|лунн\p{L}*\s+знак|знак\p{L}*\s+Лун/iu.test(text)) return false;
  return /кто\s+я\s+по\s+гороскопу|под\s+каким\s+знаком\s+я\s+родил/iu.test(text)
    || /(?:знак\p{L}*\s+зодиак\p{L}*|солнечн\p{L}*\s+знак|знак\p{L}*\s+Солнц)/iu.test(text)
      && (hasPersonalReference(text) || /я\s+спрашиваю|назови\s+(?:только\s+)?(?:его|знак)/iu.test(text));
}
