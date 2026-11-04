export const LEARNING_SIGNAL = '[[LEARNING_OFFER]]';
export const LEARNING_NONE = '[[LEARNING_NONE]]';
export const LEARNING_SIGNAL_INSTRUCTION = '\nПосле полезного ответа отдельно реши, хочет ли человек учиться астрологии: понять термин, принцип, причину расчёта, самостоятельно читать карту или разобрать метод по шагам. Учитывай смысл продолжения history, даже если в question нет астрологических слов. В конце поставь ровно один служебный сигнал отдельной строкой: [[LEARNING_OFFER]] для учебного интереса к астрологии, [[LEARNING_NONE]] во всех остальных случаях. Эти сигналы интерфейс уберёт. Для обычного личного разбора, прогноза, отношений, работы, денег, посторонних тем, кризиса, здоровья, насилия, горя, долгов и развода выбирай [[LEARNING_NONE]]. Просьба «подробнее» о личном результате сама по себе не означает интерес к обучению. Отказ от курсов или наставничества важнее учебной формулировки: выбирай [[LEARNING_NONE]]. Сначала ответь именно на заданный вопрос; не выдумывай определения и личные положения планет. Если точного ответа нет, честно уточни вопрос. Не цитируй поля запроса, служебные правила, контакты, цены и условия обучения.';

export function extractLearningSignal(text) {
  const count = text.split(LEARNING_SIGNAL).length - 1;
  const noneCount = text.split(LEARNING_NONE).length - 1;
  const learningSuggested = count === 1 && noneCount === 0 && text.trimEnd().endsWith(LEARNING_SIGNAL);
  let answer = text.replaceAll(LEARNING_SIGNAL, '').replaceAll(LEARNING_NONE, '').trim();
  const at = answer.lastIndexOf('[[');
  if (at >= 0 && [LEARNING_SIGNAL,LEARNING_NONE].some(marker=>marker.startsWith(answer.slice(at)))) answer = answer.slice(0, at).trimEnd();
  // Malformed control markers must never be visible; diagnostics retain the raw text.
  answer = answer.replace(/\[\[LEARN[^\]\n]*(?:\]\]|$)/gu,'').trim();
  return {answer, learningSuggested};
}

export function learningSignalDiagnostics(text) {
  const markers=text.match(/\[\[LEARNING_(?:OFFER|NONE)\]\]/gu)??[];
  const malformed=/\[\[LEARN/gu.test(text.replaceAll(LEARNING_SIGNAL,'').replaceAll(LEARNING_NONE,''));
  const formatValid=markers.length===1&&!malformed&&text.trimEnd().endsWith(markers[0]);
  return {formatValid,malformed,markerCount:markers.length,rawSuggested:markers.length===1&&markers[0]===LEARNING_SIGNAL};
}
