const TERM = /управител\p{L}*|куспид\p{L}*|асцендент\p{L}*|десцендент\p{L}*|аспект\p{L}*|тригон\p{L}*|квадратур\p{L}*|секстил\p{L}*|оппозиц\p{L}*|ретроград\p{L}*|синастри\p{L}*|натальн\p{L}*\s+карт\p{L}*|астропсихолог\p{L}*|астрологи\p{L}*|плацидус\p{L}*/iu;
const DEFINITION = /что\s+(?:это\s+)?(?:такое|значит|означает)|кто\s+тако[йя]|объясни|расскажи.*(?:понят|термин)|как\s+(?:найти|определить|рассчитать|считать|строить|построить|читать|разбирать|разобрать)|чем\s+отлича/iu;
const STUDY = /хочу\s+(?:изучать|научиться|учиться|разобраться\s+глубже)|где\s+(?:учат|учиться|изучать)|(?:обучени|курс|наставничеств)\p{L}*/iu;
const PERSONAL = /(?:мо[йяёиею]|у\s+меня|для\s+меня|мне|партн[её]р|мужчин|женщин|реб[её]н).*(?:карт|дом|венер|лун|солнц|сатурн|управител|асцендент)|(?:мой|моя|моё|мои)\s/iu;
const SENSITIVE = /болезн|диагноз|здоров|насили|суицид|самоуб|умер|горе|паник|долг|кредит|развод/iu;

export function isLearningQuestion(message, history = []) {
  if (SENSITIVE.test(message)) return false;
  if (TERM.test(message) && STUDY.test(message)) return true;
  if (TERM.test(message) && DEFINITION.test(message) && !PERSONAL.test(message)) return true;
  if (/^(?:а\s+)?(?:как\s+(?:это\s+)?(?:рассчитать|определить|найти)|как\s+ты\s+это\s+(?:считаешь|рассчитываешь|определяешь)|объясни\s+(?:термин|понятие))[?!.\s]*$/iu.test(message)) {
    const previous = [...history].reverse().find(item => item.role === 'assistant');
    return !!previous && TERM.test(previous.content) && !SENSITIVE.test(previous.content);
  }
  return false;
}

export function learningInvitation(message, history = [], modelSuggested = null) {
  const learningCue = /изуч|обуч|науч|самостоят|самому|самой|сам[ау]?\s+|понять\s+(?:метод|принцип|логику|расч[её]т)|по\s+шагам/iu;
  const recent = history.slice(-4).map(item => item.content).join('\n');
  if (/не\s+(?:хочу|нужно|интерес\p{L}*|предлагай).*(?:учит|обуч|курс|наставнич)|без\s+(?:курс|обучени|реклам|наставнич)/iu.test(message)) return null;
  const modelAllowed = modelSuggested === true && !SENSITIVE.test(message) && !SENSITIVE.test(recent)
    && (!(PERSONAL.test(message) || /мужчин|женщин|партн[её]р|отношени|любов|работ|деньг|карьер/iu.test(message)) || learningCue.test(message));
  if (typeof modelSuggested === 'boolean' ? !modelAllowed : !isLearningQuestion(message, history)) return null;
  return { title: 'Хочешь разобраться глубже?',
    text: 'Такие темы подробно разбирают на обучении по профессиональной астропсихологии в Институте прогрессивной психологии Анны Гриньковой. Если захочешь изучать карту самостоятельно, можно продолжить с наставником.' };
}
