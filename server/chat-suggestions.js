import { moscowDate, tarotForDate } from './daily-forecast.js';

const PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'pluto'];
const TOPICS = {
  sun: ['Что помогает мне проявлять себя увереннее?', 'Где искать то, что меня по-настоящему увлекает?', 'Как замечать свои сильные стороны?'],
  moon: ['Что помогает мне восстановить силы?', 'Как лучше понимать свои эмоции?', 'Что даёт мне ощущение безопасности?'],
  mercury: ['Как мне проще договариваться с людьми?', 'Какой способ учиться мне ближе?', 'Что помогает мне яснее выражать мысли?'],
  venus: ['Что для меня особенно важно в отношениях?', 'Как я выражаю симпатию и заботу?', 'Как понять, что мне действительно нравится?'],
  mars: ['Как мне легче решиться на первый шаг?', 'Как отстаивать свои границы без ссоры?', 'Куда направить энергию, когда всё раздражает?'],
  jupiter: ['В чём я могу расширить свои возможности?', 'Что помогает мне видеть перспективу?', 'Как выбирать то, во что хочется вкладываться?'],
  saturn: ['Как справляться со страхом не справиться?', 'Как не требовать от себя слишком многого?', 'Что помогает мне доводить начатое до конца?'],
  pluto: ['Как отпускать то, что уже не подходит?', 'Как замечать повторяющиеся сценарии?', 'Как проходить перемены бережнее к себе?'],
};
const GENERAL = [
  'Как замечать свои таланты?', 'Что помогает мне выбирать работу?',
  'Как находить общий язык с людьми?', 'Как я принимаю важные решения?',
  'Какой подход к деньгам мне ближе?', 'Как находить баланс в отношениях?',
  'Что помогает мне принимать перемены?', 'Как бережнее относиться к себе?',
];
const GROUPS = [
  { id: 'work', label: 'Работа', questions: ['Какая работа мне подходит?', 'Какие у меня сильные стороны?', 'Что поможет мне расти в профессии?'],
    subject: ['Какая работа ему подходит?', 'Какие у него сильные стороны?', 'Что поможет ему расти в профессии?'] },
  { id: 'money', label: 'Деньги', questions: ['Какой подход к деньгам мне ближе?', 'Что помогает мне больше зарабатывать?', 'Как мне увереннее обращаться с деньгами?'],
    subject: ['Какой подход к деньгам ему ближе?', 'Что помогает ему больше зарабатывать?', 'Как ему увереннее обращаться с деньгами?'] },
  { id: 'relationships', label: 'Отношения', questions: ['Что для меня важно в отношениях?', 'Как я выражаю заботу?', 'Как мне легче договариваться с партнёром?'],
    subject: ['Что для него важно в отношениях?', 'Как он выражает заботу?', 'Как ему легче договариваться с партнёром?'] },
];
const SUBJECT_TOPICS = {
  sun: ['Что помогает этому человеку проявлять себя увереннее?', 'Что его по-настоящему увлекает?', 'Какие у него сильные стороны?'],
  moon: ['Что помогает ему восстановить силы?', 'Как он проживает эмоции?', 'Что даёт ему ощущение безопасности?'],
  mercury: ['Как ему проще договариваться с людьми?', 'Какой способ учиться ему ближе?', 'Как он выражает свои мысли?'],
  venus: ['Что для него особенно важно в отношениях?', 'Как он выражает симпатию и заботу?', 'Как понять, что ему нравится?'],
  mars: ['Как ему легче решиться на первый шаг?', 'Как он отстаивает свои границы?', 'Как он обычно выражает раздражение?'],
  jupiter: ['В чём он может расширить свои возможности?', 'Что помогает ему видеть перспективу?', 'Что ему интересно развивать?'],
  saturn: ['Как он справляется со страхом не справиться?', 'Как поддержать его, когда он слишком требователен к себе?', 'Что помогает ему доводить начатое до конца?'],
  pluto: ['Как он отпускает то, что уже не подходит?', 'Какие сценарии у него могут повторяться?', 'Как ему бережнее проходить перемены?'],
};

const normalizeQuestion = text => text.toLocaleLowerCase('ru').replaceAll('ё','е').replace(/[?!.,…]+$/u,'').trim();
const generalForPerson = text => text.replace(/мне/g,'ему').replace(/меня/g,'него').replace(/я /g,'он ').replace(/свои/g,'его');
const NATAL_QUESTIONS = new Set([
  ...Object.values(TOPICS).flat(), ...Object.values(SUBJECT_TOPICS).flat(),
  ...GENERAL, ...GENERAL.map(generalForPerson),
  ...GROUPS.flatMap(group => [...group.questions,...group.subject]),
].map(normalizeQuestion));

// Keep the calculated context when editorial display text deliberately contains no astrology terms.
export function isNatalSuggestion(message) { return NATAL_QUESTIONS.has(normalizeQuestion(message)); }

// A fixed account offset and a day counter avoid random repeats on consecutive days.
// This is an editorial question to start a conversation, not an event prediction.
export function chatSuggestions({ userId, profile = null, profileId = null, now = new Date(), draw = 0 }) {
  const date = moscowDate(now);
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const topics = profileId ? SUBJECT_TOPICS : TOPICS;
  const bank = PLANETS.flatMap((planet) => topics[planet].map((text, index) => ({ id: `${planet}-${index}`, text })))
    .concat(GENERAL.map((text, index) => ({ id: `general-${index}`, text: profileId
      ? text.replace(/мне/g, 'ему').replace(/меня/g, 'него').replace(/Как я /g, 'Как он ') : text })));
  const offset = (userId % bank.length) * 17 + ((profileId ?? 0) % bank.length) * 11;
  const daily = bank[(dayNumber + offset) % bank.length];
  const card = tarotForDate(date, profile?.birthUtc && profileId ? 1_000_000_000 + profileId : userId, draw);
  return {
    date,
    dailyQuestion: { ...daily, personalization: profile?.birthUtc ? 'natal' : 'account' },
    groups: GROUPS.map(({ id, label, questions, subject }) => ({ id, label, questions: profileId ? subject : questions })),
    card: { number: card.number, name: card.name, draw },
    refreshAfterMs: Math.max(1000, Date.parse(`${date}T21:00:00Z`) - new Date(now).getTime() + 1000),
  };
}
