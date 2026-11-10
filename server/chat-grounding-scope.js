import { hasPersonalReference, isPersonalLifeApplication } from './chat-topics.js';

// Grounding is independent of whether the interface may offer a course. A definition
// is general unless the visitor explicitly asks about a particular person's chart.
// Bare «мне» in «объясни мне понятие» addresses the assistant, not a natal chart.
const ASTRO = String.raw`(?:расч[её]т\p{L}*|данн\p{L}*|показател\p{L}*|планет\p{L}*|натальн\p{L}*\s+карт\p{L}*|карт\p{L}*(?:\s+рождени\p{L}*)?|гороскоп\p{L}*|управител\p{L}*|куспид\p{L}*|асцендент\p{L}*|десцендент\p{L}*|дом(?:а|е|ом|ов|у)?|аспект\p{L}*|транзит\p{L}*|дирекци\p{L}*|прогресси\p{L}*|солнц\p{L}*|лун\p{L}*|меркури\p{L}*|венер\p{L}*|марс\p{L}*|юпитер\p{L}*|сатурн\p{L}*|уран\p{L}*|нептун\p{L}*|плутон\p{L}*)`;
const POSSESSIVE = String.raw`(?:мо(?:й|я|ё|е|ю|и|его|ей|ему|им|ём|их|ими)|сво(?:й|я|ё|е|ю|и|его|ей|ему|им|ём|их|ими)|наш\p{L}*)`;
const MODIFIER = String.raw`(?:(?:натальн|личн|рассчитанн|полученн|денежн|финансов|перв|втор|треть|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат)\p{L}*|\d+(?:-?(?:й|го|м))?)`;
const PERSONAL_ASTRO = new RegExp(String.raw`(?<!\p{L})(?:${POSSESSIVE}\s+(?:${MODIFIER}\s+){0,3}${ASTRO}|у\s+меня\s+(?:(?:в|с|стои[тят]|наход\p{L}*|расположен\p{L}*)\s+)?(?:${MODIFIER}\s+){0,3}${ASTRO}|${ASTRO}(?:\s+\p{L}+){0,4}\s+у\s+меня)(?!\p{L})`, 'iu');
const PERSON_CHART = /карт\p{L}*\s+(?:рождени\p{L}*\s+)?(?:(?:моего|моей|нашего|нашей)\s+)?(?:партн[её]р|мужа|жены|сына|дочери|реб[её]нк)\p{L}*/iu;
// Personal application can refer to a life situation rather than an adjacent planet:
// «мои эмоции», «совместимость с мужем», or «почему я ...» still need the chart.
const LIFE = String.raw`(?:доход|деньг|работ|карьер|професси|отношени|совместим|эмоци|чувств|поведени|характер|талант|способност|сильн\p{L}*\s+сторон)`;
const PERSONAL_SITUATION = new RegExp(String.raw`${POSSESSIVE}\s+(?:(?:подход|отношени\p{L}*)\s+к\s+)?${LIFE}|почему\s+(?:я|мы|мне|нам)(?!\p{L})|как\s+(?:мне|нам)\s+(?:увеличить|повысить|зарабатывать|копить|пережить|справиться|отстоять)|(?:совместим|отношени)\p{L}*\s+с\s+(?:(?:моим|моей)\s+)?(?:муж|жен|партн[её]р)`, 'iu');
// Applying a chart to a life choice is personal even when «моя» is omitted.
// Keep this separate from finding a chart's ruler, aspect or other technical item.
const APPLICATION_FRAME = /(?:по|через|на\s+основе|с\s+помощью)\s+(?:(?:(?:натальн|рассчитанн)\p{L}*\s+)?карт\p{L}*|гороскоп\p{L}*)/iu;
// Career and money wording often has no choice verb: «кем мне работать»,
// «что у меня с карьерой», «где мои миллионы». Require a chart application
// and an actual personal reference, excluding pronouns addressing an explanation.
const CHART_LIFE_TOPIC = /работ|карьер|професси|доход|деньг|зараб|финанс|миллион|богатств/iu;
const LIFE_CHOICE = /как(?:ой|ая|ое|ую|ие|ого|ому|ом|их)\s+(?:подходящ\p{L}*\s+)?(?:работ|професси|карьер|партн[её]р|мужчин|женщин)\p{L}*|(?:выбрать|сменить|найти|искать|выстроить|улучшить)\s+(?:подходящ\p{L}*\s+)?(?:работ|професси|карьер|отношени|партн[её]р)\p{L}*|как\s+(?:(?:лучше|проще|больше)\s+)?(?:зарабатывать|копить|экономить|увеличить\s+доход)/iu;
const INCOME_ACTIVITY = /(?:заняти|деятел|професси|работ|возможност|потенциал|тем|сфер|направлени).{0,90}(?:доход|деньг|зараб)|(?:доход|деньг|зараб).{0,90}(?:заняти|деятел|професси|работ|возможност|потенциал|тем|сфер|направлени)/iu;
// A reference to the current calculated result is data application, not a term
// definition. An explicitly hypothetical exercise still uses its own given facts.
const CALCULATED_REFERENCE = /(?:в|по|из)\s+(?:этом|этой|данном|данной|текущ\p{L}*|рассчитанн\p{L}*)\s+(?:расч[её]т|карт|гороскоп|данн|показател)/iu;
const HYPOTHETICAL = /(?:условн|учебн|вымышленн|абстрактн)\p{L}*\s+(?:задач|пример|расч[её]т)|в\s+примере/iu;
const NO_PERSONAL_CHART = /(?:не\s+(?:используй|учитывай|разбирай|смотри|подставляй|бери)|не\s+про)\s+(?:(?:данные|положения)\s+(?:из\s+)?)?(?:мо\p{L}*|личн\p{L}*)\s+(?:натальн\p{L}*\s+)?(?:карт|гороскоп|данн|расч[её]т|показател)|без\s+(?:мо\p{L}*|личн\p{L}*)\s+(?:натальн\p{L}*\s+)?(?:карт|гороскоп|данн|расч[её]т|показател)/iu;
const THEORY_TOPIC = /планет|стеллиум|обител|экзальтац|изгнани|падени|натал|гороскоп|управител|куспид|асцендент|десцендент|аспект|тригон|квадратур|секстил|оппозиц|ретроград|синастри|астрологи|астропсихолог|плацидус|транзит|дирекци|прогресси|узл|солнечн\p{L}*\s+дуг|релокац|орбис|модальност|стихи|(?:\d+|перв\p{L}*|втор\p{L}*|седьм\p{L}*)\s*дом|солнц|лун|меркури|венер|марс|юпитер|сатурн|уран|нептун|плутон/iu;
const THEORY_REQUEST = /что\s+(?:это\s+)?(?:такое|значит|означает)|кто\s+тако[йя]|объясни|расскажи|подскажи|поясни|чем\s+отлича|как\s+(?:самостоятел\p{L}*\s+)?(?:найти|определить|рассчитать|считать|строить|построить|читать|разбирать|разобрать)|хочу\s+(?:изучать|изучить|научиться|учиться|разобраться)/iu;

const THEORY_EXERCISE = /изуча|изучить|учу(?!\p{L})|учусь|уч[её]б|условн|задач|сколько|вычисл|может\s+ли|явля|где\s+наход|како[йяею]\p{L}*\s+(?:момент|дата|планет|знак|дом)/iu;

// These pronouns address the explanation or describe studying, not a personal
// life situation. Keep the rest of the question, including any actual self-reference.
function lifeQuestion(question) {
  return question
    .replace(/((?:объясни|поясни|расскажи|покажи|подскажи)\s+)(?:мне|нам)(?!\p{L})/giu, '$1')
    .replace(/((?:объясни|поясни|расскажи|покажи|подскажи)\s+)(?:моей|моему|нашей|нашему)\s+\p{L}+\s+(?=понятие|термин|что|как)/giu, '$1')
    .replace(/(?<!\p{L})(?:я|мы)\s+(?=(?:(?:не\s+)?(?:хочу|хотим)\s+)?(?:учу(?:сь)?|учим(?:ся)?|изучаю|изучаем|изучать|изучить|учиться|научиться|осваиваю|осваиваем|понять|разобраться)(?!\p{L}))/giu, '')
    .replace(/((?:не\s+)?(?:предлагай|советуй|приглашай)\s+)(?:мне|нам)(?!\p{L})/giu, '$1')
    .replace(/(?<!\p{L})(?:мне|нам)\s+(?=(?:не\s+(?:нужн|интерес)|интересно|любопытно))/giu, '')
    .replace(/(можно\s+)(?:мне|нам)\s+(?=объяснить|пояснить|рассказать|узнать|понять)/giu, '$1');
}

// The caller supplies groundingQuestion(message, history), so dependent follow-ups
// retain the original topic and a complete new question starts afresh.
export function isGeneralAstrologyQuestion(question) {
  if (NO_PERSONAL_CHART.test(question) && THEORY_TOPIC.test(question)) return true;
  if (PERSONAL_ASTRO.test(question) || PERSON_CHART.test(question) || PERSONAL_SITUATION.test(question)
    || isPersonalLifeApplication(lifeQuestion(question))
    || !HYPOTHETICAL.test(question) && (CALCULATED_REFERENCE.test(question)
      || APPLICATION_FRAME.test(question) && (LIFE_CHOICE.test(question) || INCOME_ACTIVITY.test(question)
        || hasPersonalReference(lifeQuestion(question)) && CHART_LIFE_TOPIC.test(question)))) return false;
  // Technical quiz questions need the same scope even without a definition verb.
  return THEORY_TOPIC.test(question) && (THEORY_REQUEST.test(question) || THEORY_EXERCISE.test(question) || /[?？]/u.test(question));
}
