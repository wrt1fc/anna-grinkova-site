export const LEARNING_SIGNAL = '[[LEARNING_OFFER]]';
export const LEARNING_SIGNAL_INSTRUCTION = '\nПосле полезного ответа отдельно реши, хочет ли человек учиться астрологии: понять термин, принцип, причину расчёта, самостоятельно читать карту или разобрать метод по шагам. Учитывай смысл продолжения history, даже если в question нет астрологических слов. Если это учебный интерес, добавь в самом конце отдельной строкой [[LEARNING_OFFER]]. Это служебный сигнал для интерфейса, не часть объяснения. Не добавляй его для обычного личного разбора, прогноза, отношений, работы, денег, посторонних тем, кризиса, здоровья, насилия, горя, долгов и развода. Просьба «подробнее» о личном результате сама по себе не означает интерес к обучению. При отказе от обучения сигнал тоже не нужен. Сначала ответь по сути; не выдумывай контакты, цены и условия обучения.';

export function extractLearningSignal(text) {
  const count = text.split(LEARNING_SIGNAL).length - 1;
  const learningSuggested = count === 1 && text.trimEnd().endsWith(LEARNING_SIGNAL);
  let answer = text.replaceAll(LEARNING_SIGNAL, '').trim();
  const at = answer.lastIndexOf('[[');
  if (at >= 0 && LEARNING_SIGNAL.startsWith(answer.slice(at))) answer = answer.slice(0, at).trimEnd();
  return {answer, learningSuggested};
}
