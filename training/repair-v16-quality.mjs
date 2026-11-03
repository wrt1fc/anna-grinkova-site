// Small, explicit regression rubrics. These checks do not prove general factual accuracy.
const normalize = text => text.replace(/^\s*Привет[!.,]?\s*/iu, '').replace(/\s+/gu, ' ').trim();
const groups = {
 modality: [['кардинальн'], ['фиксирован'], ['мутабельн']],
 progression: [['день|дня|сутк'], ['год|лет'], ['символическ'], ['после рождения|послеродов|после момента рождения']],
 relocation: [['момент рождения|время рождения'], ['друг|нов'], ['дом|угл|асцендент'], ['планет'], ['сохраня|не меня|остаются|остаются прежними']],
 ruler: [['куспид'], ['знак'], ['управител']],
 orb: [['отклонени|допуск'], ['точн'], ['аспект|угл']],
 direction: [['символическ'], ['дуг|сдвиг|ключ'], ['прогресс|транзит']],
 identity: [['Фортуна'], ['цифровой помощник|программ'], ['не человек|не Анна']],
};
const forbidden = {
 modality: ['модальности — это четыре стихии', 'полумодальн|немодальн'],
 progression: ['по одному градусу за один земной день', 'сильные планеты двигаются быстрее', 'по синдиксу'],
 relocation: ['с учётом текущего города и времени', 'изменились положения планет и аспекты'],
 ruler: ['управитель — планета, стоящая в своём знаке|управителя дома находят по знаку асцендента'],
};
export function repairAnswerProblems(answer, card) {
 if (card.qualityVersion !== 16) return [];
 const errors = [], topic = card.rubricTopic;
 if (topic && !groups[topic]) throw Error('Unknown v16 rubric: '+topic);
 for (const [i, alternatives] of (groups[topic] ?? []).entries()) {
  if (!alternatives.some(pattern => new RegExp(pattern, 'iu').test(answer))) errors.push(`v16: ${topic} missing anchor ${i+1}`);
 }
 for (const pattern of forbidden[topic] ?? []) if (new RegExp(pattern,'iu').test(answer)) errors.push('v16: known false '+topic+' claim');
 if (/Сначала помоги по сути|Факты проекта бери|данные дня из forecast|из поля chart|Не смешивай источники/iu.test(answer)) errors.push('v16: instruction echo');
 if (/Пока не получается дать точный ответ/iu.test(answer)) errors.push('v16: fallback instead of answer');
 const previous = (card.history ?? []).filter(row => row.role === 'assistant').at(-1)?.content;
 if (card.scope !== 'offtopic' && previous && normalize(previous) === normalize(answer)) errors.push('v16: repeated history instead of explanation');
 if (card.scope !== 'offtopic' && /Это не астрологическ|не относится к астрологи|не моя тематика/iu.test(answer)) errors.push('v16: refusal of an allowed topic');
 if (card.noCourseText && /курс|Институт прогрессивной психологии|обучение у Анны/iu.test(answer)) errors.push('v16: unsolicited course text');
 return errors;
}

export function repairTopic(card) {
 if (card.rubricTopic) return card.rubricTopic;
 if (['offtopic','safety'].includes(card.scope)) return null;
 if (['modality','progression','relocation','direction','orb','ruler'].includes(card.family)) return card.family;
 const text = card.question+' '+(card.history ?? []).map(row => row.content).join(' ');
 if (/ты (?:Анна|настоящий человек|нейросеть)|человеком или с программой|общаюсь с человеком|кто ты|как тебя зовут|представься Анной/iu.test(text)) return 'identity';
 if (/найти управителя дома|найти управител|как самой найти управителя/iu.test(text)) return 'ruler';
 return null;
}
