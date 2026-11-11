import style from '../config/chat-explanation.json' with {type:'json'};
import {POINT_NAMES} from './astro-chart.js';
import {chatIntent, incomeRulerExplanation, intentGuidance, requestedStepCount} from './chat-intent.js';
import {asksAboutMoney} from './anna-method.js';
import {assertedNatalText} from './chart-answer-check.js';

const PLANET_FORMS = {sun:'Солнц',moon:'Лун',mercury:'Меркур',venus:'Венер',mars:'Марс',jupiter:'Юпитер',saturn:'Сатурн',uranus:'Уран',neptune:'Нептун',pluto:'Плутон'};
const PLANET = `(?:${Object.values(PLANET_FORMS).join('|')})\\p{L}*`;
const HOUSE_WORDS = {первом:1,втором:2,третьем:3,четвертом:4,четвёртом:4,пятом:5,шестом:6,седьмом:7,восьмом:8,девятом:9,десятом:10,одиннадцатом:11,двенадцатом:12};

function rulerPlacements(answer) {
  const claims = [];
  for (const clause of assertedNatalText(answer).split(/[.!?;\n]/u)) {
    if (/транзит|дирекц|прогресс/iu.test(clause)) continue;
    const names = [...clause.matchAll(new RegExp(PLANET,'giu'))];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      // Never borrow a house from the next planet in the same sentence.
      const tail = clause.slice(name.index + name[0].length, names[i + 1]?.index);
      const houses = [...tail.matchAll(/(?:в|во)\s+(\d{1,2}(?:-?(?:м|ом))?|первом|втором|третьем|четв[её]ртом|пятом|шестом|седьмом|восьмом|девятом|десятом|одиннадцатом|двенадцатом)\s+доме/giu)];
      const planet = Object.keys(PLANET_FORMS).find(key => name[0].toLowerCase().startsWith(PLANET_FORMS[key].toLowerCase()));
      for (const house of houses) {
        if (/(?:^|\s)не\s*$/iu.test(tail.slice(0,house.index))) continue;
        claims.push({planet, house:HOUSE_WORDS[house[1].toLowerCase()] ?? parseInt(house[1],10)});
      }
    }
  }
  return claims;
}

function moneyRulers(chart, message) {
  if (!chart?.money || chart.partner || !asksAboutMoney(message)) return [];
  return chart.calculated?.houseRulers?.find(item => item.house === 2)?.rulers ?? [];
}

// Explaining an element-based strategy is a separate topic from locating income rulers.
const strategyExplanation = message => !/управител/iu.test(message) && (/стихи/iu.test(message)
  || /что\s+(?:это\s+)?(?:такое|значит|означает)[^.!?]{0,45}стратеги|объясни[^.!?]{0,35}(?:смысл|название)[^.!?]{0,30}стратеги|объясни[^.!?]{0,25}стратеги[^.!?]{0,25}[«“"]/iu.test(message));

// Subject house, rather than the house of a planet just named in a placement.
const lastTopicHouse = text => [...text.matchAll(/(?:у|для|про)\s+(\d{1,2})(?:-?(?:го|й|м|х))?\s+дом/giu)].at(-1)?.[1];

export function explanationGuidance(message, chart, mode) {
  if (mode === 'tarot') return '';
  const rulers = moneyRulers(chart, message);
  const strategy = strategyExplanation(message);
  const facts = strategy || !incomeRulerExplanation(message) ? '' : rulers.map(r => `${POINT_NAMES[r.planet]} стоит в ${r.house} доме`).join('; ');
  return '\n' + style.instructions.filter((_,i) => i !== 1 || incomeRulerExplanation(message)).join(' ') + intentGuidance(message) + (facts ? `\nПроверенные управители денежного дома для этого ответа: ${facts}.` : '')
    + (strategy ? '\nТекущий вопрос о названии стратегии или стихиях: объясни именно это по материалам. Требование перечислить управителей денежного дома к такому ответу не относится.' : '');
}

export function wrongMoneyRulerClaim(answer, chart, message) {
  const rulers = moneyRulers(chart, message);
  if (!rulers.length) return false;
  const asserted = assertedNatalText(answer);
  if (rulers.length === 1) {
    const extraRuler = /(?:(?:друг(?:ой|ие)|втор(?:ой|ые)|ещ[её]\s+один)\s+управител|(?:два|двое|несколько)\s+управител|один\s+из\s+управител)\p{L}*(?:\s+(\d{1,2})(?:-?го)?\s+дома)?/giu;
    for (const claim of asserted.matchAll(extraRuler)) {
      const context = lastTopicHouse(asserted.slice(0,claim.index));
      if (!claim[1] && context && Number(context) !== 2 && !/денежного\s+дома/iu.test(asserted.slice(claim.index,claim.index+90).split(/[.!?]/u)[0])) continue;
      if (!claim[1] || Number(claim[1]) === 2) return true;
    }
  }
  // Also catches repeating the sole ruler in a second, contradictory house.
  if (rulerPlacements(asserted).some(claim => rulers.some(r => r.planet === claim.planet) && !rulers.some(r => r.planet === claim.planet && r.house === claim.house))) return true;
  for (const m of asserted.matchAll(new RegExp(`управител\\p{L}*(?:\\s+денежного\\s+дома)?\\s*[—–:,-]?\\s*(${PLANET})`,'giu'))) {
    const before = asserted.slice(0,m.index);
    const explicitMoney = /управител\p{L}*\s+денежного\s+дома/iu.test(m[0]);
    const lastHouse = lastTopicHouse(before);
    if (!explicitMoney && lastHouse && Number(lastHouse) !== 2) continue;
    if (!rulers.some(r => new RegExp(`^${PLANET_FORMS[r.planet]}`,'iu').test(m[1]))) return true;
  }
  return false;
}

// Completeness of an explanation, separate from factual correctness and model quality metrics.
export function incompleteMoneyExplanation(answer, chart, message, length) {
  if (strategyExplanation(message) || !incomeRulerExplanation(message)) return false;
  const rulers = moneyRulers(chart, message);
  if (rulers.length < 2) return false;
  // Bind each name to its own house in the same clause. A stray mention of the Sun's
  // character elsewhere must not count as explaining its role in the money question.
  const placements = rulerPlacements(answer);
  const mentioned = rulers.filter(r => placements.some(p => p.planet === r.planet && p.house === r.house));
  if (length === 'short') return mentioned.length === 0 || (mentioned.length < rulers.length && !/один из|одна из|несколько управител/iu.test(answer));
  return mentioned.length < rulers.length;
}

export function calculatedMoneyExplanation(chart, message, length) {
  const rulers = moneyRulers(chart, message);
  const topics = [...new Set(rulers.map(r => style.moneyTopics[r.house]).filter(Boolean))];
  const facts = rulers.map((r,i) => `${rulers.length === 1 ? 'Управитель денежного дома' : i === 0 ? 'Один из управителей денежного дома' : 'Другой управитель'} — ${POINT_NAMES[r.planet]} — стоит в ${r.house} доме.`);
  const intro = topics.length ? `Возможные темы заработка по твоей карте: ${topics.join('; ')}.` : 'Разберём показатели денежного дома твоей карты.';
  return `${intro} ${facts.slice(0,length === 'short' ? 1 : undefined).join(' ')}`;
}

// A fallback for a practical life question must address the requested action, not
// substitute another chart topic. These are reversible reflection exercises;
// they do not infer personality, outcomes or a diagnosis from an unknown chart.
export function practicalIntentAnswer(chart, message, length) {
  const intent = chatIntent(message);
  const actions = {
    growth:['Выбери один навык, который нужен для следующего уровня в твоей работе.', 'Возьми небольшую задачу, где сможешь применить этот навык и увидеть результат.', 'Попроси обратную связь по результату и выбери, что улучшить в следующей попытке.', 'Запиши, что получилось и что пока вызывает трудности.', 'Через неделю проверь результат и скорректируй план.'],
    promotion:['Собери примеры задач, в которых твой вклад дал понятный результат.', 'Обсуди с руководителем критерии следующей должности и ожидания от неё.', 'Договорись об одной новой зоне ответственности и сроке обсуждения результата.', 'Запиши договорённости, чтобы свериться с ними позже.', 'Сравни полученный результат с согласованными критериями.'],
    budget:['Запиши недавние расходы и отметь, какие покупки были запланированы.', 'Перед необязательной покупкой сделай паузу и проверь, нужна ли она сейчас.', 'Выбери посильную сумму для накопления после обязательных расходов.', 'Отдельно отметь обстоятельства, после которых возникает желание купить что-то импульсивно.', 'Через неделю сравни записи и измени одно правило, которое оказалось неудобным.'],
    support:['Назови конкретно, что тревожит сейчас, и отдели известные факты от опасений.', 'Выбери одно посильное действие в той части ситуации, на которую можешь повлиять.', 'Поговори с человеком, которому доверяешь, и попроси о конкретной поддержке.', 'Отложи необязательное решение, если сейчас трудно сосредоточиться.', 'Проверь позже, стало ли легче и нужна ли дополнительная помощь.'],
    rest:['Выдели время после работы, когда не нужно отвечать на рабочие сообщения.', 'Убери одну необязательную задачу и выбери спокойное занятие, которое тебе подходит.', 'Проверь, какая нагрузка повторяется, и обсуди возможность её уменьшить.', 'Запиши, после каких занятий появляется больше сил.', 'Через несколько дней оцени нагрузку и оставь подходящий тебе ритм отдыха.'],
    workfit:['Запиши, какие рабочие задачи тебе интересны, а какие быстро утомляют.', 'Сравни два возможных занятия по повседневным задачам и условиям работы.', 'Попробуй небольшую задачу из выбранной сферы и оцени свои впечатления.', 'Уточни у человека из этой сферы, как устроен обычный рабочий день.', 'Сопоставь впечатления от практики со своими ожиданиями.'],
    income:['Выбери одно направление из рассчитанных денежных показателей и сопоставь его со своим опытом.', 'Проверь на небольшой задаче, какие навыки для него уже есть, а какие требуют практики.', 'Оцени затраты времени и доступные ресурсы перед следующим шагом.', 'Собери обратную связь от тех, кому может быть полезна твоя работа.', 'Сравни результат с затратами и реши, стоит ли продолжать.'],
  };
  if (intent === 'service') return 'В Фортуне есть личный кабинет, натальная карта, прогнозы и подписка. Напиши, на каком шаге возникает проблема и какой текст ошибки ты видишь. Не присылай пароль или код входа.';
  if (!actions[intent]) return null;
  const count = requestedStepCount(message) ?? (length === 'short' ? 1 : 3);
  let intro = {growth:'Для роста в выбранной работе полезно проверить один навык на практике.',promotion:'К повышению можно подготовиться через результаты работы и ясные договорённости.',budget:'Начни с того, чтобы увидеть привычки трат и выбрать посильное изменение.',support:'Тревога может мешать увидеть ближайший посильный шаг. Не нужно решать всё сразу.',rest:'Восстановлению стоит выделить место в расписании, а нагрузку пересмотреть.',workfit:'Выбор работы можно проверять через реальные задачи и условия.',income:'Возможное направление стоит проверить на практике без обещания заработка.'}[intent];
  if (intent === 'income') {
    const topics = [...new Set(moneyRulers(chart,message).map(r => style.moneyTopics[r.house]).filter(Boolean))];
    if (topics.length) intro = `В рассчитанных денежных показателях выделены ${topics.join('; ')}. Это возможные темы для проверки, а не обещание дохода.`;
  }
  if (length === 'short' && requestedStepCount(message)) {
    const compact = {
      growth:['Выбери один рабочий навык.', 'Проверь его на небольшой задаче.', 'Запроси обратную связь.', 'Запиши, что удалось.', 'Скорректируй план через неделю.'],
      promotion:['Собери примеры своих результатов.', 'Уточни критерии повышения.', 'Обсуди новую ответственность.', 'Запиши договорённости.', 'Сверь результаты с критериями.'],
      budget:['Запиши последние расходы.', 'Сделай паузу перед покупкой.', 'Выбери посильную сумму накопления.', 'Отметь поводы импульсивных покупок.', 'Пересмотри одно правило через неделю.'],
      support:['Назови, что сейчас тревожит.', 'Отдели факты от опасений.', 'Выбери посильное действие.', 'Попроси поддержки у близкого.', 'Проверь, нужна ли ещё помощь.'],
      rest:['Отключи рабочие уведомления на время отдыха.', 'Убери необязательную задачу.', 'Выбери спокойное занятие.', 'Обсуди уменьшение нагрузки.', 'Отметь, что помогло восстановиться.'],
      workfit:['Запиши интересные тебе задачи.', 'Сравни условия двух занятий.', 'Попробуй небольшую рабочую задачу.', 'Узнай об обычном дне в этой сфере.', 'Сравни опыт со своими ожиданиями.'],
      income:['Выбери направление по своему опыту.', 'Проверь нужный навык на практике.', 'Оцени затраты времени.', 'Собери обратную связь.', 'Сравни результат с затратами.'],
    };
    return compact[intent].slice(0,count).map((text,i) => `${i+1}. ${text}`).join('\n');
  }
  const steps = actions[intent].slice(0,count).map((text,i) => `${i+1}. ${text}`).join('\n');
  const detail = length === 'detailed' ? '\nЭто практический способ исследовать ситуацию: записывай наблюдения и опирайся на реальные результаты. Личная карта может дать тему для размышления, но не определяет решение за тебя. Если какой-то шаг сейчас слишком труден, уменьши его объём до посильного и затем проверь свои ощущения.' : '';
  return `${intro}\n${steps}${detail}`;
}

export function intentAnswerProblem(answer, message) {
  const intent=chatIntent(message), count=requestedStepCount(message);
  if (count && ['workfit','income','growth','promotion','budget','support','rest'].includes(intent) && (answer.replace(/^Привет!\s*/u,'').match(/(?:^|\n)\s*\d+[.)]\s+/gu) ?? []).length !== count) return true;
  // A list of income sources is not an answer about progress or spending.
  // Merely repeating «рост»/«навыки» beside that list does not address the task.
  const incomeSubstitution = /возможные\s+темы\s+заработка|(?:доход|деньги|заработок)[^.!?;]{0,25}(?:связан|приход|ид[её]т|идут|возмож)|управител\p{L}*\s+(?:денежного|2(?:-?го)?|второго)\s+дом/iu.test(answer);
  const relevant = {
    growth:/выбери|выбрать|проверь|проверить|попроси|обратн\p{L}*\s+связ|практик|тренир|осво|портфолио|запиши|измер|обсуди|согласуй|отработ|упражнен|упражнён/iu,
    promotion:/результат|достижени|критери|руководител|ответственност|обсуди|договор[её]нност/iu,
    budget:/расход|трат|накоп|отклад|покуп|бюджет|лимит|пауза|паузу|уч[её]т|посильн\p{L}*\s+сумм/iu,
    support:/поддерж|тревог|тревож|страх|боюсь|пережив|выслуш|поговор|психолог/iu,
    rest:/отдых|нагрузк|восстанов|сон|сна|уведомлен|пауз|устал/iu,
  };
  if (incomeSubstitution && relevant[intent] && !relevant[intent].test(answer)) return true;
  // Positive source-of-income language is a known substitution for these questions.
  // Do not reject a negated explanation such as "не нужен список профессий".
  if (['growth','promotion','budget','support','rest'].includes(intent)
      && /(?:возможные\s+темы\s+заработка|доход\s+(?:связан|приходит)|зарабатывать\s+можно|подойдут\s+профессии)/iu.test(answer)
      && !/навык|практик|критери|руководител|расход|трат|пауз|накоп|поддерж|тревог|отдых|нагрузк|восстанов/iu.test(answer)) return true;
  if (intent === 'service' && /С этой темой не помогу/iu.test(answer)) return true;
  return false;
}
