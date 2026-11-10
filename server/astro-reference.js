// Small, reviewable reference facts. These are context, never canned model answers.
// General definitions: Astrodienst FAQ/types, relocation and quadruplicities.
// Rulers: the existing Anna-method table; these drafts are not an endorsement by Anna.
import {SIGN_RULERS,SIGN_PREPOSITIONAL} from './anna-method.js';
import {POINT_NAMES} from './astro-chart.js';
import {orbExample,orbCorrection} from './theory-numerics.js';
const facts={
 moonMotion:'Луна проходит один знак обычно примерно за два–три дня, а не обязательно каждый день. Конкретное положение и переход проверяют по эфемеридам на заданный момент. При неизвестном времени рождения знак нельзя выбирать наугад, если в эти сутки возможен переход.',
 modality:'Модальности: кардинальная — начало, фиксированная — сохранение, мутабельная — адаптация. По четыре знака в каждой. Кардинальные: Овен, Рак, Весы, Козерог. Фиксированные: Телец, Лев, Скорпион, Водолей. Мутабельные: Близнецы, Дева, Стрелец, Рыбы. Четыре стихии — другая классификация.',
 orb:'Орбис — допустимое отклонение фактического угла от точного аспекта. Точные углы: соединение0°, секстиль60°, квадрат90°, трин120°, оппозиция180°. Отклонение — абсолютная разность фактического и точного углов. Аспект в допуске, если отклонение не больше выбранного предела. Предел — максимум отклонения, не минимум и не ошибка часов рождения.',
 progression:'Вторичные прогрессии: возраст A лет соответствует моменту рождения плюс A суток. Для27 лет —27 суток после рождения, для58 —58 суток. Исходный момент — ноль; день рождения не добавляет сутки. Положения берут из эфемерид на этот момент, не на сегодня. Это день за год, не лунный цикл и не формула24000/возраст.',
 direction:'В методе дирекций солнечной дугой точки карты символически сдвигают на общий угол. Солнечная дуга — разность долготы вторично-прогрессивного и натального Солнца по кругу. При98° и75° дуга23°. Одна и та же дуга прибавляется к выбранным натальным точкам. Это не сумма долгот, не разница номеров домов и не собственная скорость каждой планеты. Угол измеряют в градусах; он не обязан равняться одному знаку. Около1° в год — приближение, не универсальная точная формула.',
 relocation:'Релокация сохраняет один физический момент рождения и меняет место расчёта. Запись местного времени может отличаться из-за часового пояса, но UTC-момент один. Геоцентрические положения планет и взаимные аспекты сохраняются; углы карты и дома меняются. Дата переезда/заселения не заменяет момент рождения. Это не сравнение двух людей.',
 ruler:'Хозяин дома — планета-управитель знака куспида именно этого дома. Диспозитор планеты — управитель знака, в котором стоит сама планета. Планета, просто находящаяся в доме, не обязательно его хозяин. Роли могут совпасть. В каждой паре первая планета — главный управитель, вторая — соуправитель; порядок нельзя менять. По принятой таблице: ',
 stellium:'Стеллиум — скопление нескольких планет в одном знаке или доме по выбранной методике. Это не обитель. Обитель означает положение планеты в управляемом ею знаке; у Луны это Рак. Термина «Луна в кармине» здесь нет. Планеты группы рассматривают по отдельности и вместе.',
 angles:'Солнечный знак определяется Солнцем, а не асцендентом или Луной. В системе Плацидуса асцендент — куспид1 дома. Планета рядом с ним может быть в12 доме, сам асцендент — начало1 дома. Соседи, ближайшее окружение и повседневное общение — тема3 дома;2 дом — личные ресурсы.',
 service:'Данные рождения сохраняются и просматриваются в личном кабинете Фортуны. Для изменения времени рождения открывают свои данные в кабинете; требования доказанной причины или экспертизы не установлено. Оплата доступна в приложении. Неизвестные кнопки, отделы, контакты и условия оплаты в справке не указаны.',
 health:'Астрология не выбирает препараты, лечение и финансовые риски. Сильная боль в груди может требовать немедленной медицинской помощи: разговор о карте или обычная запись к врачу не заменяют срочное обращение за помощью. Поддержка чувств допустима без гороскопа и без курса.'
};
const patterns={
 moonMotion:/Лун\p{L}*.{0,70}(?:(?:меня|смен|помен|переход|перей|проход|прой)\p{L}*.{0,20}знак|знак\p{L}*.{0,35}(?:меня|смен|помен|переход|перей|проход|прой)|кажды\p{L}*.{0,15}(?:час|день|сут)|два.{0,8}дня)|как часто Луна/iu,
 modality:/модальн|кардинальн|фиксированн|мутаб|три качеств|тр[её]х групп|знаки.{0,35}(?:начин|удерж|меняющ)|стихи/iu,
 orb:/орбис|допуск|отклонени.{0,25}(?:аспект|трин|угл)|аспект.{0,25}уг|(?:разброс|допустим\p{L}*).{0,45}(?:точн\p{L}*\s+)?угл|угл.{0,45}(?:разброс|допустим)/iu,
 progression:/вторичн.{0,12}прогресс|прогресси|послеродов|дн(?:ей|и).{0,10}и лет/iu,
 direction:/солнечн.{0,12}дуг|дирекци|двигают точки|символическ.{0,15}сдвиг/iu,
 relocation:/релокац|карт.{0,15}переезд|двух город|дв[аеух].{0,15}мест.{0,15}прожив|карт.{0,15}друг.{0,8}город|друг.{0,12}полушар|(?:карт|колес)\p{L}*.{0,65}друг\p{L}*.{0,20}(?:точк\p{L}*\s+на\s+земл|мест\p{L}*\s+на\s+земл|географическ)/iu,
 ruler:/управител|хозяин.{0,18}(?:дом|знак)|диспозит|куспид|(?:главн|втор[оы]|пар[ауые]).{0,45}(?:Ов[ен]|Тель|Близнец|Рак|Ль[вве]|Дев|Вес|Скорпион|Стрел|Козерог|Водоле|Рыб)|(?:Ов[ен]|Тель|Близнец|Рак|Ль[вве]|Дев|Вес|Скорпион|Стрел|Козерог|Водоле|Рыб).{0,45}(?:главн|пар[ауые]|соуправ|управля)/iu,
 stellium:/стеллиум|скоплени.{0,18}планет|групп.{0,12}планет|обител|кармин/iu,
 angles:/асцендент|солнечн.{0,10}знак|знак.{0,15}Солнц|начал.{0,15}(?:перв|1).{0,8}дом|сосед|под каким знаком/iu,
 service:/приложени|подписк|оплат|доступ|кабинет|профил|изменить время.{0,10}рождени/iu,
 health:/сильно болит (?:сердце|грудь)|сильн.{0,15}боль.{0,15}груд|выб(?:ор|ирать).{0,15}(?:лечени|препарат)|кредитн.{0,10}риск/iu,
};
// Inflected names are used for claim extraction; the facts themselves come from SIGN_RULERS.
const signStems={Овен:'Ов(?:ен|на|ном|не)',Телец:'Тел(?:ец|ьца|ьцом|ьце)',Близнецы:'Близнец\\p{L}*',Рак:'Рак\\p{L}*',Лев:'Л(?:ев|ьва|ьвом|ьве)',Дева:'Дев\\p{L}*',Весы:'Вес(?:ы|ов|ами|ах)',Скорпион:'Скорпион\\p{L}*',Стрелец:'Стрел(?:ец|ьца|ьцом|ьце)',Козерог:'Козерог\\p{L}*',Водолей:'Водоле\\p{L}*',Рыбы:'Рыб\\p{L}*'};
const planetStems={sun:'Солнц\\p{L}*',moon:'Лун\\p{L}*',mercury:'Меркури\\p{L}*',venus:'Венер\\p{L}*',mars:'Марс\\p{L}*',jupiter:'Юпитер\\p{L}*',saturn:'Сатурн\\p{L}*',uranus:'Уран\\p{L}*',neptune:'Нептун\\p{L}*',pluto:'Плутон\\p{L}*'};
const token=pattern=>`(?<!\\p{L})(?:${pattern})(?!\\p{L})`;
const signPattern=Object.values(signStems).map(token).join('|');
// "Quality" denotes modality when directly attached to a zodiac sign, not quality of life or feelings.
const signQualityPattern=new RegExp(`качеств\\p{L}*\\s+(?:знак\\p{L}*\\s+)?(?:${signPattern})|(?:${signPattern})\\s*[,—–:-]?\\s*(?:како\\p{L}*\\s+)?качеств\\p{L}*`,'iu');
// Recognise concepts as well as terminology: learners often do not know the term yet.
const directionConcept=/прогрессивн\p{L}*[^.!?]{0,65}натальн\p{L}*\s+Солнц|натальн\p{L}*[^.!?]{0,65}прогрессивн\p{L}*\s+Солнц|(?:колес|точк|планет)\p{L}*[^.!?]{0,65}(?:сдвиг|поворачив|поворот)\p{L}*[^.!?]{0,45}(?:общ|один|одинаков)\p{L}*\s+(?:угол|дуг)|символическ\p{L}*[^.!?]{0,30}(?:сдвиг|поворачив)/iu;
const modalityConcept=/(?:начал|начин)\p{L}*[^.!?]{0,55}(?:сохран|удерж)\p{L}*[^.!?]{0,55}(?:смен|измен|адапт)\p{L}*/iu;
const topicMatches=(topic,text)=>patterns[topic].test(text)||(topic==='direction'&&directionConcept.test(text))||(topic==='modality'&&(signQualityPattern.test(text)||(/знак/iu.test(text)&&modalityConcept.test(text))))||(topic==='orb'&&orbExample(text)!==null);
const planetPattern=Object.values(planetStems).map(token).join('|');
const findKey=(forms,text)=>Object.keys(forms).find(key=>new RegExp(`^(?:${forms[key]})$`,'iu').test(text));
const negativeClaim=text=>/(?:^|[\s,:—–-])(?:не|нет|неверно|ошибочно|ошибка|нельзя)(?:\s|[,.:—–-]|$)/iu.test(text);

// Bounded affirmative-claim checks, shared by offline evaluation and runtime callers.
// This is deliberately not a complete semantic judge: questions and negated claims are not assertions.
export function sourceGroundedTheoryProblems(answer,{question=''}={}){
 const problems=[];
 // These checks compare explicit claims with the reference facts above. They do
 // not require a question from an evaluation set and do not reject omissions.
 const directionContext=topicMatches('direction',question)||topicMatches('direction',answer);
 for(const clause of answer.split(/(?<=[.!?;])\s+|\n|,\s*(?:но|а|зато)\s+/u)){
  const asserts=pattern=>{
   const match=pattern.exec(clause);
   if(!match||/[«"“?]/u.test(clause))return false;
   const prefix=clause.slice(0,match.index);
   return !negativeClaim(match[0])&&!/(?:не(?:\s+(?:нужно|надо|следует|стоит|требуется|имеет\s+смысла))?|нет|неверно|неправда|ошибочно|нельзя)\s*[,—–:]?\s*$/iu.test(prefix)&&!/^\s*(?:неверно|неправда|ошибочно|ошибка)/iu.test(clause);
  };
  if(asserts(/(?:три|тр[её]х|3)\s+стихи/iu))problems.push('incorrect element count');
  if(directionContext){
   if(asserts(/(?:солнечн\p{L}*\s+дуг\p{L}*|дуг\p{L}*|угол)\s*(?:[—–:=]|это|равн\p{L}*|получа\p{L}*|вычисля\p{L}*)[^.!?;]{0,45}(?:сумм\p{L}*|слож\p{L}*)|(?:складыва\p{L}*|слож\p{L}*|суммиру\p{L}*)[^.!?;]{0,45}(?:долгот\p{L}*|Солнц\p{L}*)/iu))problems.push('solar arc is not a sum');
   if(asserts(/(?:кажд\p{L}*\s+(?:планет|точк)\p{L}*|планет\p{L}*)[^.!?;]{0,60}(?:собственн\p{L}*|сво\p{L}*|разн\p{L}*)\s+скорост\p{L}*|(?:собственн\p{L}*|разн\p{L}*)\s+скорост\p{L}*[^.!?;]{0,35}(?:кажд\p{L}*|планет)/iu))problems.push('solar arc uses a common rotation');
   // A one-sign rotation can be a valid 30-degree example, not a universal rule.
   if(asserts(/(?:всегда|обязательно)\s+(?:сдвиг|сдвин|передвин|поверн|перемещ)\p{L}*[^.!?;]{0,35}(?:на\s+)?один\s+знак|двойн\p{L}*\s+дуг\p{L}*/iu))problems.push('solar arc uses a common rotation');
  }
 }
 let previousSign;
 const role='(?:главн\\p{L}*|основн\\p{L}*|соуправител\\p{L}*|втор\\p{L}*\\s+управител\\p{L}*)';
 for(const sentence of answer.split(/(?<=[.!?;])\s+|\n+/u)){
  const signs=[...sentence.matchAll(new RegExp(signPattern,'giu'))];
  const contextSign=signs.length===1?findKey(signStems,signs[0][0]):undefined;
  for(const clause of sentence.split(/,?\s+(?:но|а|зато)\s+|,/iu)){
   // Match direct relations only; nearby unrelated mentions are not enough.
   const relations=[
    {pattern:`(${planetPattern})\\s+(?:явля\\p{L}*\\s+)?(${role})[^,;.!?]{0,25}?(${signPattern})`,order:'planet-role-sign'},
    {pattern:`(${signPattern})[^,;.!?]{0,25}?(${role})\\s*(?:управител\\p{L}*)?\\s*(?:[—–:=]|явля\\p{L}*|считается|это)?\\s*(${planetPattern})`,order:'sign-role-planet'},
    {pattern:`(${planetPattern})\\s+управля\\p{L}*\\s+(${signPattern})`,order:'planet-sign'},
    {pattern:`управител\\p{L}*\\s+(${signPattern})\\s*(?:[—–:=]|явля\\p{L}*|это)?\\s*(${planetPattern})`,order:'sign-planet'},
   ];
   const check=(sign,planet,roleText)=>{
    if(!sign||!planet)return;
    const allowed=SIGN_RULERS[sign];
    if(!allowed.includes(planet))problems.push('incorrect ruler of '+sign);
    else if(roleText){
     const secondary=/соуправител|втор/iu.test(roleText);
     if(allowed[secondary?1:0]!==planet)problems.push('incorrect ruler role of '+sign);
    }
   };
   for(const relation of relations){
    for(const match of clause.matchAll(new RegExp(relation.pattern,'giu'))){
     const prefix=clause.slice(0,match.index);
     if(negativeClaim(match[0])||negativeClaim(prefix)||/[«"“]/u.test(prefix)||/\?/u.test(clause))continue;
     if(relation.order==='planet-role-sign')check(findKey(signStems,match[3]),findKey(planetStems,match[1]),match[2]);
     if(relation.order==='sign-role-planet')check(findKey(signStems,match[1]),findKey(planetStems,match[3]),match[2]);
     if(relation.order==='planet-sign')check(findKey(signStems,match[2]),findKey(planetStems,match[1]));
     if(relation.order==='sign-planet')check(findKey(signStems,match[1]),findKey(planetStems,match[2]));
    }
   }
   // A sign in the same or immediately preceding sentence supplies context for a role list.
   if(!negativeClaim(clause)&&!/[?«"“]/u.test(clause)){
    const localSigns=[...clause.matchAll(new RegExp(signPattern,'giu'))];
    const sign=localSigns.length===1?findKey(signStems,localSigns[0][0]):localSigns.length===0?(contextSign??previousSign):undefined;
    if(sign)for(const m of clause.matchAll(new RegExp(`(${role})\\s*(?:управител\\p{L}*)?\\s*(?:[—–:=]|явля\\p{L}*|считается|это)?\\s*(${planetPattern})`,'giu')))check(sign,findKey(planetStems,m[2]),m[1]);
   }
   const sunFirst=/знак\p{L}*\s+Солнц\p{L}*[^,;.!?]{0,45}(?:указыва\p{L}*|определя\p{L}*|показыва\p{L}*|это|[—–=])[^,;.!?]{0,25}(?:начал\p{L}*|куспид)[^,;.!?]{0,15}(?:перв\p{L}*|1(?:-?го)?)\s+дом/iu;
   // Scope negation to the inference verb; «нельзя игнорировать» does not negate
   // a later false assertion that the solar sign determines the ascendant.
   const inference=/(?:солнечн\p{L}*\s+знак\p{L}*|знак\p{L}*\s+Солнц\p{L}*)[^.!?;]{0,100}?(?<!\p{L})(?:(позволя\p{L}*|можно|может)\s+(?:точно\s+)?(?:определить|рассчитать|узнать|получить)|(?:определяет|показывает))\s+(?:знак\s+)?асцендент\p{L}*/iu.exec(clause);
   if(inference&&!/[?«"“]/u.test(clause)){
    const predicate=inference[1]??/(?:определяет|показывает)/iu.exec(inference[0])?.[0];
    const prefix=inference[0].slice(0,inference[0].lastIndexOf(predicate));
    if(!/(?:не|нельзя|невозможно)\s*(?:точно\s*)?$/iu.test(prefix)&&!/^\s*(?:Неверно|Неправда|Ошибочно)/iu.test(clause))problems.push('Sun sign substituted for first-house cusp');
   }
   if(sunFirst.test(clause)&&!negativeClaim(clause)&&!/[?«"“]/u.test(clause))problems.push('Sun sign substituted for first-house cusp');
   // In a general Sun-sign/cusp question, placement cannot be inferred from the sign.
   // Do not reject an actual Sun-on-cusp description in an unrelated personal-chart answer.
   const asksSunCusp=/знак\p{L}*\s+Солнц|солнечн\p{L}*\s+знак/iu.test(question)&&/(?:начал|куспид|асцендент|перв\p{L}*\s+дом)/iu.test(question);
   const assertedSunCusp=/Солнц\p{L}*[^.!?;]{0,100}(?:стоит|находится|расположен\p{L}*)\s+(?:на|в)\s+куспид\p{L}*\s+(?:перв\p{L}*|1(?:-?го)?)\s+дом/iu;
   if(asksSunCusp&&assertedSunCusp.test(sentence)&&!negativeClaim(sentence)&&!/[?«"“]/u.test(sentence))problems.push('Sun sign substituted for first-house cusp');
  }
  previousSign=contextSign;
 }
 return [...new Set(problems)];
}

export function astroReference(message,history=[]){
 if(/\b(?:SQL|Python|JavaScript)\b|напиш\p{L}* код|рецепт|переведи/iu.test(message))return null;
 let topics=Object.keys(patterns).filter(k=>topicMatches(k,message));
 if(!topics.length&&/^(?:а |и )?(?:как это|что это|почему|хочу|мне|можно)/iu.test(message)){
  const prior=[...history].reverse().find(t=>t.role==='assistant')?.content??'';
  topics=Object.keys(patterns).filter(k=>topicMatches(k,prior));
 }
 topics=topics.slice(0,2);
 if(!topics.length)return null;
 const computed={};
 if(topics.includes('orb')){
  const example=orbExample(message);
  if(example)computed.orbExample=example;
 }
 if(topics.includes('ruler')){
  computed.mentionedPlanetRulerships=Object.fromEntries(Object.entries(POINT_NAMES).filter(([,name])=>new RegExp(name.slice(0,-1),'iu').test(message)).map(([key,name])=>[name,Object.entries(SIGN_RULERS).filter(([,ks])=>ks.includes(key)).map(([sign])=>sign)]).filter(([,signs])=>signs.length));
  for(const [sign,form]of Object.entries(SIGN_PREPOSITIONAL)){
   if(new RegExp(`куспид[^.!?]{0,35}(?:в|во) ${form}(?!\\p{L})`,'iu').test(message)){
    computed.houseRulers={cuspSign:sign,planets:SIGN_RULERS[sign].map(k=>POINT_NAMES[k]),basis:'управители знака на куспиде, не планеты внутри дома'};
   }
  }
 }
 if(topics.includes('modality')){
  const groups={кардинальная:['Овен','Рак','Весы','Козерог'],фиксированная:['Телец','Лев','Скорпион','Водолей'],мутабельная:['Близнецы','Дева','Стрелец','Рыбы']};
  computed.signModalities=Object.fromEntries(Object.entries(groups).flatMap(([kind,signs])=>signs.filter(s=>new RegExp(token(signStems[s]),'iu').test(message)).map(s=>[s,kind])));
 }
 if(topics.includes('progression')){
  const age=/(?:мне|возраст(?:а|е)?|для)\s+(\d{1,3})/iu.exec(message)?.[1];
  if(age&&Number(age)>0&&Number(age)<=100)computed.progression={ageYears:Number(age),daysAfterBirth:Number(age)};
 }
 if(topics.includes('direction')){
  const natal=/натальн\p{L}*\s+Солнц\p{L}*\s*(?:на\s+)?(\d+(?:[.,]\d+)?)/iu.exec(message)?.[1];
  const progressed=/прогрессивн\p{L}*\s*(?:Солнц\p{L}*\s*)?(?:на\s+)?(\d+(?:[.,]\d+)?)/iu.exec(message)?.[1];
  if(natal&&progressed){const n=Number(natal.replace(',','.')),p=Number(progressed.replace(',','.'));if(n>=0&&n<360&&p>=0&&p<360)computed.solarArc={natalDegrees:n,progressedDegrees:p,arcDegrees:Number(((p-n+360)%360).toFixed(6)),operation:'разность по кругу; одинаковая дуга для натальных точек'};}
 }
 return {version:19,topics,facts:topics.map(k=>facts[k]+(k==='ruler'&&!computed.houseRulers?Object.entries(SIGN_RULERS).map(([s,ks])=>s+' — '+ks.map(k=>POINT_NAMES[k]).join('/')).join('; '):'')+(k==='orb'&&computed.orbExample?' '+orbCorrection(computed.orbExample):'')),...(Object.keys(computed).length?{computed}:{})};
}
