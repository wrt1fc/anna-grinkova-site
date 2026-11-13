// What a chat question is grounded in besides the day forecast: the calculated natal chart with Anna's money method,
// the partner's chart for compatibility questions, and matching fragments of her materials. Shared by the live chat
// and the training set builder, so the tuned model learns on exactly the prompt it is served with.
import { asksAboutChart, chartForPrompt, chartSectionsFor, natalChart, POINT_NAMES } from './astro-chart.js';
import { ELEMENT_NAMES, SIGN_PREPOSITIONAL, asksAboutMoney, elementOf, formulasForPrompt, houseFormulas, houseMentions, houseQueries, houseRulers, houseRulersForPrompt, methodQueries, moneyForPrompt, moneyProfile } from './anna-method.js';
import { groundingQuestion, isPartnerPreferenceQuestion, isRelationshipQuestion, personalSolarSignQuestion,applicationClarification } from './chat-topics.js';
import { relationshipContext } from './relationship-context.js';
import { isClearlyOffTopic } from './chat-intent.js';
import {isNatalSuggestion} from './chat-suggestions.js';
import { isGeneralAstrologyQuestion } from './chat-grounding-scope.js';
import {factAnswersEnabled,personalFactRequest} from './chat-fact-answers.js';
import {namedChartPoints} from './chart-answer-check.js';

// Natal chart, transits, directions and Anna's money method for chart and money questions only;
// birth date, place and email never reach the model.
const MAX_MATERIALS = 5;
// Free-text questions need a strong match: weaker ones pulled in unrelated slides. Chart queries quote Anna's headings and score 9+.
const QUESTION_MIN_SCORE = 6;
const COMPARED = ['sun', 'moon', 'venus', 'mars'];
const COMPATIBILITY_TOPIC = /совместим|подходим ли|подходим друг|подходит ли (он|она) мне|(мы|нам) с (ним|ней|[А-ЯЁ]\p{L}+)|(у нас|наши|наша|наш) (пар|отношени|союз)|уживаться/iu;
export function asksAboutCompatibility(message) { return COMPATIBILITY_TOPIC.test(message); }

const chartOf = (profile) => natalChart({ birthUtc: profile.birthUtc, latitude: profile.birthLatitude, longitude: profile.birthLongitude, timeKnown: profile.birthTime !== null });

// Planet by planet: the sign and element of each person and whether the elements match, so the reply compares
// both charts instead of describing one of them.
function partnerForPrompt(own, partner) {
  const line = (planet) => {
    const mine = own.planets[planet].sign, theirs = partner.chart.planets[planet].sign;
    const same = elementOf(mine) === elementOf(theirs);
    return `${POINT_NAMES[planet]}: у тебя в ${SIGN_PREPOSITIONAL[mine]} (${ELEMENT_NAMES[elementOf(mine)]}), у партнёра в ${SIGN_PREPOSITIONAL[theirs]} (${ELEMENT_NAMES[elementOf(theirs)]}) — ${same ? 'одна стихия' : 'стихии разные'}`;
  };
  return { label: partner.label ?? null, gender: partner.gender ?? null,
    planets: COMPARED.map((planet) => `${POINT_NAMES[planet]} в знаке ${partner.chart.planets[planet].sign}`),
    compare: COMPARED.map(line) };
}

export function chartContext(profile, message, now = new Date(), { partner = null, history = [] } = {}) {
  if (isClearlyOffTopic(message)) return { chart: null, queries: [] };
  const question = groundingQuestion(message, history);
  const directFact=factAnswersEnabled()&&personalFactRequest(question);
  if (!directFact&&isGeneralAstrologyQuestion(question)) return { chart: null, queries: [] };
  // groundingQuestion appends this suffix only for a dependent follow-up. Match the
  // complete original editorial question, never arbitrary words inside a new message.
  const suggestionQuestion = question !== message ? question.slice(0, question.lastIndexOf('\nУточнение: ')) : question;
  const money = asksAboutMoney(question);
  const scope=applicationClarification(question);
  const compatibility = (!scope||scope==='отношениях')&&asksAboutCompatibility(question);
  if (!asksAboutChart(question) && !money && !compatibility && !isNatalSuggestion(suggestionQuestion)&&!directFact) return { chart: null, queries: [] };
  if (!profile?.birthUtc) return { chart: { missing: 'Данные рождения не заполнены в личном кабинете, натальная карта не рассчитана.' }, queries: [] };
  const natal = chartOf(profile);
  const chart = chartForPrompt(natal, now, { include: chartSectionsFor(question) });
  if(factAnswersEnabled()&&profile.birthTime===null){
    const keys=namedChartPoints(question).filter(key=>natal.planets[key]);
    if(keys.length){
      const instant=new Date(profile.birthUtc).getTime();
      const edges=[-1,1].map(day=>chartOf({...profile,birthUtc:new Date(instant+day*86400000).toISOString()}));
      chart.uncertainPositions=keys.filter(key=>new Set([natal,...edges].map(c=>c.planets[key]?.sign)).size>1);
      if(chart.uncertainPositions.includes('sun'))chart.solarSignUncertain=true;
    }
  }
  // Unknown time uses a placeholder instant. Near an ingress, do not turn it
  // into an asserted own solar sign; a conservative one-day margin is explicit.
  if (personalSolarSignQuestion(question) && profile.birthTime === null) {
    const instant = new Date(profile.birthUtc).getTime();
    const signs = [-1, 0, 1].map(day => chartOf({ ...profile, birthUtc: new Date(instant + day * 86400000).toISOString() }).planets.sun.sign);
    chart.solarSignUncertain = new Set(signs).size > 1;
  }

  // Rulers of all twelve houses and the house-to-house formulas: ground truth for any sphere,
  // so the model quotes Anna's ruler table instead of guessing from general astrology.
  const rulers = houseRulers(natal);
  let queries = [];
  if (rulers) {
    chart.houseRulers = houseRulersForPrompt(rulers);
    chart.formulas = formulasForPrompt(houseFormulas(natal));
    chart.calculated.houseRulers = rulers;
    queries = houseQueries(rulers, houseMentions(question));
  }
  if (scope==='отношениях'||!scope&&isRelationshipQuestion(question)) chart.relationship = { ...relationshipContext(natal), requireOverview: !scope&&isPartnerPreferenceQuestion(question) };
  if (compatibility) {
    if (partner?.birthUtc) chart.partner = partnerForPrompt(natal, { ...partner, chart: chartOf(partner) });
    else chart.partnerMissing = 'Карты партнёра нет: для разбора совместимости добавь его или её в разделе «Близкие люди».';
  }
  if (!money) return { chart, queries };
  const profileMoney = moneyProfile(natal);
  chart.money = moneyForPrompt(profileMoney);
  return { chart, queries: [...queries, ...methodQueries(profileMoney)] };
}

// Anna's slides that match this chart first (2nd house sign, its ruler, hard aspects, strategy), then the visitor's own words.
// A chart query quotes one of Anna's headings ("Управитель 2 дома в 4 доме"); the slide that contains it verbatim wins
// over a general slide that merely shares the words.
function exactSlide(knowledge, query) {
  // Deep candidate list: house formulas differ only by two numbers, so BM25's top 5 can miss the exact one.
  const candidates = knowledge.search(query, { limit: 25 });
  const needle = query.toLowerCase();
  const exact = candidates.find((item) => item.text.toLowerCase().includes(needle));
  return exact ? [exact] : candidates.slice(0, 1);
}

export function findMaterials(knowledge, message, queries) {
  if (!knowledge) return [];
  const seen = new Set();
  const found = [];
  for (const item of [...queries.flatMap((query) => exactSlide(knowledge, query)), ...knowledge.search(message, { minScore: QUESTION_MIN_SCORE })]) {
    if (seen.has(item.text) || found.length >= MAX_MATERIALS) continue;
    seen.add(item.text);
    found.push({ text: item.text });
  }
  return found;
}
