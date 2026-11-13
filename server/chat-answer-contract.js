import {namedChartPoints,calculatedPointMeaning} from './chart-answer-check.js';
import {wantsNoAstroTerms} from './chat-topics.js';
import {chatIntent} from './chat-intent.js';
import {methodicReference} from './methodic-reference.js';
import {foreignChartReference} from './chat-subject.js';
import {calculatedFactAnswer} from './chat-fact-answers.js';
import {POINT_NAMES} from './astro-chart.js';

const PLANETS=/солнц|лун[ауы]|меркур|венер|марс|юпитер|сатурн|уран|нептун|плутон|асцендент|куспид|секстил|квадрат|оппозиц|тригон|(?<!\p{L})трин(?!\p{L})|\bASC\b|\bMC\b|(?:\d+[-\p{L}]*|перв\p{L}*|втор\p{L}*|трет\p{L}*|четв[её]рт\p{L}*|пят\p{L}*|шест\p{L}*|седьм\p{L}*|восьм\p{L}*|девят\p{L}*|десят\p{L}*|одиннадцат\p{L}*|двенадцат\p{L}*)\s+дом|(?<!\p{L})(?:Овен|Овне|Овна|Телец|Тельце|Тельца|Близнец\p{L}*|Рак|Раке|Рака|Лев|Льве|Льва|Дева|Деве|Девы|Весы|Весах|Весов|Скорпион\p{L}*|Стрелец|Стрельц\p{L}*|Козерог\p{L}*|Водолей|Водоле\p{L}*|Рыбы|Рыбах)(?!\p{L})/iu;
const OWN=/(?<!\p{L})(?:мой|моя|моё|мое|мои|моих|моей|у\s+меня)(?!\p{L})/iu;

// No inference can transfer a position to a second person. A selected family
// profile is a different input contract; mixed owners still need clarification.
export function foreignChartClarification(question,forecast,chart){
 if(forecast?.subject&&!chart?.partner&&/кто\s+я\s+по\s+гороскопу|мой\s+знак|(?:мой|моя|моё|мое|мои)\s+(?:Марс|Венер|Лун|Солнц|Меркур|Юпитер|Сатурн|Уран|Нептун|Плутон|асцендент|натальн\p{L}*\s+карт)/iu.test(question))
  return 'Сейчас выбран профиль близкого человека, а вопрос звучит о тебе. Выбери свой профиль для разбора своей карты или уточни, что вопрос относится к выбранному человеку.';
 if(!foreignChartReference(question)
   || /если|в\s+примере|объясни\s+(?:моей\s+)?сестре/iu.test(question))return null;
 const relation=/сестр|брат/iu.test(question)?'sibling':/матер|мам|отца|пап/iu.test(question)?'parent':/сына|дочери|реб[её]нк/iu.test(question)?'child':/мужа|жены|партн[её]ра/iu.test(question)?'partner':'other';
 const mixed=/(?<!\p{L})(?:мой|моя|моё|мое|мои)\s+(?:Марс|Венер|Лун|Солнц|Меркур|Юпитер|Сатурн|Уран|Нептун|Плутон|асцендент)/iu.test(question);
 if(chart?.partner&&relation==='partner'&&/совместим|сравни|подходим/iu.test(question))return null;
 const expectedGender=/сестры|матери|мамы|дочери|подруги|жены/iu.test(question)?'female':/брата|отца|папы|сына|друга|мужа/iu.test(question)?'male':null;
 const selected=forecast?.subject;
 const selectedGender=selected?.gender??(/сестра|мама|мать|дочь|жена|подруга/iu.test(selected?.label??'')?'female':/брат|папа|отец|сын|муж|друг(?!а)/iu.test(selected?.label??'')?'male':null);
 if(selected?.relation===relation&&!mixed&&(!expectedGender||selectedGender===expectedGender))return null;
 return 'Для положений другого человека нужны его данные рождения и выбранный профиль. Сейчас нельзя переносить на него твою карту. Выбери нужного человека в разделе «Близкие люди»; если вопрос сразу о двух людях, уточни, какой показатель для кого разобрать.';
}

export function knownServiceReply(question){
 if(chatIntent(question)!=='service'&&!/настройк\p{L}*\s+просмотр\p{L}*\s+планет/iu.test(question))return null;
 if(/планет|марс|венер|лун|солнц|натальн/iu.test(question)&&/где|посмотр|отображ|включ|настройк/iu.test(question))
  return 'Открой «Твоя натальная карта» и нажми на планету или знак: появится пояснение положения. Если карта не открывается или нужный элемент не виден, напиши, что именно показано на экране. Отсутствие элемента на экране само по себе не означает, что его нет в расчёте.';
 return null;
}

export function selectedPositionAnswer(question,forecast,chart){
 if(!forecast?.subject||!foreignChartReference(question)||foreignChartClarification(question,forecast,chart)||!/^\s*где\s+/iu.test(question))return null;
 const keys=namedChartPoints(question);
 if(keys.length!==1)return null;
 const allowed=new Set('где находится стоит расположен расположена расположено планета планеты моей моего нашей нашего сестры брата матери мамы отца папы сына дочери ребёнка ребенка подруги друга коллеги мужа жены партнера партнёра в во её его натальной карте гороскопе пожалуйста'.split(' '));
 if(!question.match(/[\p{L}\p{N}]+/gu)?.every(w=>allowed.has(w.toLowerCase())||namedChartPoints(w).includes(keys[0])))return null;
 const answer=calculatedFactAnswer(chart,`Где мой ${POINT_NAMES[keys[0]]} в натальной карте?`);
 return answer?`В выбранной карте: ${answer}`:null;
}

export function unsupportedStrategyReply(question,chart,materials,history){
 if(!/стратеги/iu.test(question)||!/котик|котика|тигр|камень|камня|молни|гармони/iu.test(question))return null;
 if(OWN.test(question)&&chart?.money?.strategy?.includes('не определяется'))
  return 'По доступному расчёту твоя финансовая стратегия однозначно не определяется. Поэтому я не могу назвать её «котиком» или другим типом. Для личного вывода нужно уточнить исходные показатели методики.';
 const sources=[...materials.map(m=>m.text??''),...(methodicReference(question,history)?.entries??[]).map(e=>e.text)].join('\n');
 const stem=/котик|котика/iu.test(question)?/котик/iu:/тигр/iu.test(question)?/тигр/iu:/камень|камня/iu.test(question)?/кам[еня]/iu:/молни/iu.test(question)?/молни/iu:/гармони/iu;
 return stem.test(sources)?null:'В доступных материалах нет проверенного описания этой стратегии. Не буду придумывать её значение. Пришли формулировку из материала — объясню её простыми словами.';
}

export function answerContractProblems(answer,{message,visitorGender,forecast,history=[]}){
 const issues=[];
 if(wantsNoAstroTerms(message)&&PLANETS.test(answer))issues.push('Ответ должен обходиться без астрологических терминов, домов и названий планет.');
 // Only direct address, not adjectives describing a planet, quoted term or third person.
 if(visitorGender==null&&!forecast?.subject&&!/(?:я\s+(?:родилась|родился|женщина|мужчина)|я\s+(?:была|был)|мне\s+как\s+(?:женщине|мужчине))/iu.test([message,...history.filter(r=>r.role==='user').map(r=>r.content)].join('\n'))
   && /(?<!\p{L})ты\s+(?:\p{L}+\s+){0,2}(?:вежлив(?:ая|ый)|гармоничн(?:ая|ый)|тревожн(?:ая|ый)|чутк(?:ая|ий)|творческ(?:ая|ий)|прям(?:ая|ой)|активн(?:ая|ый)|добрая|добрый|чувствительн(?:ая|ый)|сильн(?:ая|ый)|мягк(?:ая|ий)|одна|один)(?!\p{L})/iu.test(answer))issues.push('Пол человека неизвестен: используй нейтральные формулировки без родовых обращений.');
 return issues;
}

export function relationshipTimingReply(question){
 return /когда|в\s+каком\s+возрасте|через\s+сколько|в\s+каком\s+году/iu.test(question)&&/встреч\p{L}*\s+(?:(?:сво\p{L}*|мо\p{L}*|будущ\p{L}*|с)\s+){0,2}(?:партн[её]р|любовь|мужа|жену)|выйду\s+замуж|женюсь/iu.test(question)
  ?'По натальной карте нельзя надёжно назвать дату встречи партнёра или возраст вступления в отношения. Можно обсудить, каких отношений тебе хочется и где в твоей жизни есть возможность знакомиться. Ты сейчас ищешь отношения или уже есть человек, с которым хочется сблизиться?':null;
}

export function plainLanguageFallback(chart,question,length='medium'){
 const key=namedChartPoints(question)[0]??'sun';
 const topics={sun:'важные цели',moon:'поддержка и ощущение спокойствия',mercury:'общение и обучение',venus:'симпатия и ценности',mars:'инициатива и действия',jupiter:'поиск смысла и новый опыт',saturn:'ответственность и границы',asc:'первое впечатление',mc:'профессиональные цели'};
 const meaning=key==='sun'?calculatedPointMeaning(chart,'sun'):null;
 const text=meaning??`Здесь тема для размышления — ${topics[key]??'то, как ты воспринимаешь перемены'}. Это не готовое описание твоего характера. Вспомни недавнюю ситуацию: что помогло, а что хотелось бы сделать иначе?`;
 return text+(length==='detailed'?' Например, вспомни недавний разговор или рабочую задачу: какую цель ты ставишь, что получилось и где возникла трудность? Сравни описание со своими поступками. Если оно не подходит, не нужно искать подтверждение любой ценой. Полезнее назвать один конкретный вопрос и разобрать обстоятельства: твои действия, доступные возможности и то, что можно попробовать иначе. Так разговор поможет обдумать ситуацию, а не назначит тебе характер или будущее.':'');
}
