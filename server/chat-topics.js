// Shared by routing, grounding and answer checks; everyday wording matters as much as astrology terms.
export const isRelationshipQuestion = (message) => /отношени|любов|любви|влюб|партн[её]р|замуж|брак|мужчин|женщин|женить|женат|спутник[а-яё]* жизни|вторую половин|близост|довер|ревн|ссор|расстав|развод|одиноч|супруг|свидан|личн[а-яё]* жизн/iu.test(message);
export const isPartnerPreferenceQuestion = (message) => isRelationshipQuestion(message) && /како[йягую]|какого|какую|кто мне|кого (?:мне )?(?:искать|выбрать)|мне нужен|мне нужна/iu.test(message);
export const hasPersonalReference = (message) => /(?<!\p{L})(?:я|мне|меня|мной|мо[йяёеюи](?:[а-яё]*)?|мы|нам|нас|наш[а-яё]*|сво[йяюёеих][а-яё]*)(?!\p{L})/iu.test(message);
const LIFE_TOPIC = /сильн[а-яё]* сторон|слаб[а-яё]* сторон|талант|способност|характер|темперамент|самооценк|эмоци|границ|призвани|предназначени|реализ|заниматься|откладыва|прокрастин|уверенн|выгоран|тревож|мотиваци/iu;
const PLANET_TOPIC = /солнц|лун[а-яё]*|меркури|венер|марс|юпитер|сатурн|уран|нептун|плутон/iu;
export const isPersonalLifeQuestion = (message) => hasPersonalReference(message)
  && (isRelationshipQuestion(message) || LIFE_TOPIC.test(message) || PLANET_TOPIC.test(message)) || isPartnerPreferenceQuestion(message);

// Only short dependent questions inherit a topic. A new complete question must stand on its own.
export function groundingQuestion(message, history = []) {
  if (!/^\s*(?:(?:а|и|ну|тогда)\s+)?(?:подробнее[?!.,…]*|почему (?:это|так)[?!.,…]*|что (?:это|с этим) (?:значит|делать)[?!.,…]*|как (?:это|с этим) (?:исправить|работать|связано)[?!.,…]*|можно (?:подробнее|пример)[?!.,…]*|объясни (?:подробнее|проще)[?!.,…]*)\s*$/iu.test(message)) return message;
  const previous = [...history].reverse().find((item) => item.role === 'user' && typeof item.content === 'string'
    && !/^\s*(а |и )?(подробнее|почему так|что это значит|можно пример)/iu.test(item.content));
  return previous ? `${previous.content}\nУточнение: ${message}` : message;
}
