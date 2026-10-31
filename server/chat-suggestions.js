import { natalChart, POINT_NAMES } from './astro-chart.js';
import { SIGN_PREPOSITIONAL, SIGN_RULERS } from './anna-method.js';
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
  'Какие сильные стороны видны в моей натальной карте?',
  'Что моя натальная карта говорит о привычках в отношениях?',
  'Как по натальной карте понять, что меня поддерживает?',
  'Какие темы моей натальной карты стоит изучить в первую очередь?',
  'Как моя натальная карта помогает разобраться с выбором работы?',
  'Что в моей натальной карте связано с общением?',
  'Как по моей натальной карте понять свой подход к деньгам?',
  'Что моя натальная карта может подсказать о личных границах?',
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

// A fixed account offset and a day counter avoid random repeats on consecutive days.
// This is an editorial question to start a conversation, not an event prediction.
export function chatSuggestions({ userId, profile = null, profileId = null, now = new Date(), draw = 0 }) {
  const date = moscowDate(now);
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const natal = profile?.birthUtc ? natalChart({ birthUtc: profile.birthUtc,
    latitude: profile.birthLatitude, longitude: profile.birthLongitude, timeKnown: !!profile.birthTime }) : null;
  const topics = profileId ? SUBJECT_TOPICS : TOPICS;
  const possessive = profileId ? 'его' : 'моей';
  const bank = PLANETS.flatMap((planet) => topics[planet].map((question, index) => {
    const sign = natal?.planets[planet]?.sign;
    return { id: `${planet}-${index}`, text: sign
      ? `В ${possessive} натальной карте ${POINT_NAMES[planet]} в ${SIGN_PREPOSITIONAL[sign]}. ${question}`
      : `${question} Что об этом может подсказать ${profileId ? 'его' : 'моя'} натальная карта?` };
  })).concat(GENERAL.map((text, index) => ({ id: `general-${index}`, text: profileId
    ? text.replace(/моей/g, 'его').replace(/моя/g, 'его').replace(/меня/g, 'этого человека') : text })));
  const offset = (userId % bank.length) * 17 + ((profileId ?? 0) % bank.length) * 11;
  const daily = bank[(dayNumber + offset) % bank.length];
  const card = tarotForDate(date, profile?.birthUtc && profileId ? 1_000_000_000 + profileId : userId, draw);
  const natalQuestions = profileId
    ? ['Что главное в натальной карте этого человека?', 'Как его Венера проявляется в отношениях?', 'Какие сильные стороны видны в его карте?']
    : ['Что главное в моей натальной карте?', 'Как моя Венера проявляется в отношениях?', 'Какие сильные стороны видны в моей карте?'];
  const seventh = natal?.cusps?.find((item) => item.house === 7);
  if (seventh) {
    const rulerKey = SIGN_RULERS[seventh.sign][0], ruler = natal.planets[rulerKey];
    natalQuestions[1] = `В ${profileId ? 'его' : 'моей'} карте 7-й дом в ${SIGN_PREPOSITIONAL[seventh.sign]}, управитель — ${POINT_NAMES[rulerKey]} в ${ruler.house}-м доме. Как это проявляется в выборе партнёра?`;
  }
  const cardQuestions = [`Что для ${profileId ? 'этого человека' : 'меня'} может значить сегодняшняя карта «${card.name}»?`,
    `На что ${profileId ? 'ему ' : ''}обратить внимание сегодня с картой «${card.name}»?`,
    `Какой небольшой шаг ${profileId ? 'он может' : 'можно'} сделать сегодня, опираясь на образ карты «${card.name}»?`];
  return {
    date,
    dailyQuestion: { ...daily, personalization: natal ? 'natal' : 'account' },
    groups: [
      { id: 'natal', label: 'Натальная карта', questions: natalQuestions },
      { id: 'day', label: 'Карта дня', questions: cardQuestions },
    ],
    card: { number: card.number, name: card.name, draw },
    refreshAfterMs: Math.max(1000, Date.parse(`${date}T21:00:00Z`) - new Date(now).getTime() + 1000),
  };
}
