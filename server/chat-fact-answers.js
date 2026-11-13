import {POINT_NAMES} from './astro-chart.js';
import {SIGN_PREPOSITIONAL,houseMentions} from './anna-method.js';
import {namedChartPoints,personalSolarSignAnswer} from './chart-answer-check.js';
import {hasPersonalReference} from './chat-topics.js';
import {chatIntent} from './chat-intent.js';

export const factAnswersEnabled=()=>process.env.ANNA_FACT_ANSWERS==='1';
const OTHER_SCOPE=/(?<!\p{L})(?:партн[её]р\p{L}*|мужа|жены|сына|дочери|реб[её]нк\p{L}*|сестр\p{L}*|брат\p{L}*|матер\p{L}*|мам\p{L}*|отц\p{L}*|пап\p{L}*|бабушк\p{L}*|дедушк\p{L}*|друг\p{L}*|подруг\p{L}*|коллег\p{L}*|совместим\p{L}*|синастр\p{L}*|транзит\p{L}*|дирекци\p{L}*|прогресси\p{L}*|сегодня|завтра|недел\p{L}*|таро)(?!\p{L})/iu;
const INTERPRETATION=/что\s+(?:такое|значит|означает)|почему|как\s+(?:определяют|прояв|влия|зараб|работ)|влияет|толкован|расшифр|объясни|поясни|совет|шаг|не\s+(?:называй|перечисляй|указывай)/iu;
const RULER=/управител|управля\p{L}*/iu;
const COMPOUND_HOUSES=/(?:\d{1,2}(?:-\p{L}+)?|(?:перв|втор|треть|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат)\p{L}*)\s*(?:и|,)\s*(?:\d{1,2}|перв|втор|треть|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат)/iu;
export function physicalInferenceQuestion(question){
 if(/управител|управля|назови|перечисли|укажи|где|\s+и\s+(?:что|как|почему)|[?!.]\s*\p{L}/iu.test(question))return false;
 return /Венер|Юпитер|аспект/iu.test(question)&&/партн[её]р|мужчин|женщин|супруг/iu.test(question)
  && /(?<!\p{L})(?:рост(?:а|ом|е|у)?|вес(?:а|ом|е|у)?|выше|крупнее|внешност\p{L}*)(?!\p{L})/iu.test(question)
  && !/рост\p{L}*\s+(?:в\s+)?(?:професси|карьер|доход)|(?:профессиональн|карьерн)\p{L}*\s+рост/iu.test(question)
  && /если|правда|можно|означа|значит|определ|будет|судить/iu.test(question);
}
export const physicalInferenceAnswer='По связи планет нельзя определить рост, вес или внешность партнёра. Такой вывод не следует из этих показателей. Если речь о сложностях в отношениях, полезнее обсудить саму ситуацию.';

const POINT_WORDS=new Set('где стоит находится расположен расположена расположено в во каком доме знаке мой моя моё мое моей мою моего мои моих по на из натальной натальную натальном карте карты карту гороскопе гороскопа у меня назови укажи положение положения планеты планета дом знак только пожалуйста точно что значит означает объясни поясни скажи мне моём моем своими простыми словами проще попроще это'.split(' '));
const RULER_WORDS=new Set([...POINT_WORDS,...'какие какая какой кто какими перечисли управляет управляют управитель управители управителей управителями денежного денежным денежный финансового финансовым финансовый доме дома домом домов моей моим моими своей свою своих и они их сами стоят находятся расположены собственные собственными положениями его её ее где го й м ом'.split(' ')]);
export function ownPointQuestion(question,kind){
 if(OTHER_SCOPE.test(question)||chatIntent(question)==='service'||/(?<!\p{L})если(?!\p{L})/iu.test(question)||!hasPersonalReference(question))return null;
 const latest=question.split('\nУточнение: ').at(-1),keys=namedChartPoints(question);
 if(keys.length!==1)return null;
 if(kind==='meaning'?!/что\s+(?:значит|означает)|объясни|поясни|скажи/iu.test(latest):!/где|(?:в|во)\s+каком\s+(?:доме|знаке)|(?:назови|укажи)[^.!?]{0,40}(?:положени|знак|дом)/iu.test(latest))return null;
 if(!question.split('\nУточнение: ').every(part=>part.match(/[\p{L}\p{N}]+/gu)?.every(word=>POINT_WORDS.has(word.toLowerCase())||namedChartPoints(word).includes(keys[0]))))return null;
 return keys[0];
}

export function personalFactRequest(question){
 const latest=question.split('\nУточнение: ').at(-1);
 if(OTHER_SCOPE.test(question)||chatIntent(question)==='service'||/(?<!\p{L})если(?!\p{L})/iu.test(question)||INTERPRETATION.test(latest))return null;
 if(!hasPersonalReference(question)&&!/(?:в|по|из)\s+(?:этой|этом|рассчитанн\p{L}*)\s+(?:карт|расч[её]т)/iu.test(question))return null;
 const point=ownPointQuestion(question,'position');
 if(point)return {kind:'positions',points:[point],signOnly:/в\s+каком\s+знаке|только\s+знак/iu.test(latest),houseOnly:/(?:в|во)\s+каком\s+доме|только\s+дом/iu.test(latest)};
 if(!RULER.test(question)||!/назови|укажи|перечисли|где|какие|кто|какая|какой|какими/iu.test(latest))return null;
 if(COMPOUND_HOUSES.test(question)||/(?:одного|первого|второго)\s+управител/iu.test(latest))return null;
 if(!latest.match(/[\p{L}\p{N}]+/gu)?.every(word=>RULER_WORDS.has(word.toLowerCase())||/^\d{1,2}$/u.test(word)||/^(?:перв|втор|треть|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат)\p{L}*$/iu.test(word)))return null;
 const houses=houseMentions(question);
 if(!houses.length&&/денежн|финансов|заработ|доход/iu.test(question))houses.push(2);
 const numbers=[...question.matchAll(/(?<!\d)\d{1,2}(?!\d)/gu)].map(m=>Number(m[0]));
 if(numbers.some(n=>!houses.includes(n))||/(?:перв\p{L}*|втор\p{L}*|треть\p{L}*|четв[её]рт\p{L}*|пят\p{L}*|шест\p{L}*|седьм\p{L}*|восьм\p{L}*|девят\p{L}*|десят\p{L}*)\s*(?:и|,)\s*(?:\d|перв|втор|треть|четв|пят|шест|седьм|восьм|девят|десят)/iu.test(question))return null;
 if(/\s+и\s+(?:что|как|почему|когда|зачем|помоги|расскажи)/iu.test(latest))return null;
 return new Set(houses).size===1?{kind:'rulers',houses:[...new Set(houses)]}:null;
}

export function eligibleNatalFacts(chart,question){
 return !!chart?.calculated&&!chart.partner&&!chart.partnerMissing&&!chart.transits&&!chart.directions&&!OTHER_SCOPE.test(question)&&chatIntent(question)!=='service';
}
export function positionText(facts,key,{signOnly=false,houseOnly=false}={}){
 const p=facts.positions?.[key]??facts.angles?.[key],name=POINT_NAMES[key];
 if(!p)return `${name}: точное положение не определено без времени рождения.`;
 const house=p.house??(facts.angles?(key==='asc'?1:key==='mc'?10:null):null);
 if(houseOnly)return house?`${name} в ${house}-м доме.`:`${name}: дом не определён без точного времени рождения.`;
 const sign=p.sign?` в ${SIGN_PREPOSITIONAL[p.sign]}`:'';
 return `${name}${sign}${!signOnly&&house?`, в ${house}-м доме`:''}.`;
}
export function calculatedFactAnswer(chart,question){
 const request=personalFactRequest(question);
 if(!request)return null;
 if(!chart?.calculated){
  if(!chart||chart.missing)return 'Чтобы назвать личные положения, добавь данные рождения в кабинете: дату, место и время, если оно известно.';
  return null;
 }
 if(!eligibleNatalFacts(chart,question))return null;
 const facts=chart.calculated;
 if(request.kind==='positions'){
  if(chart.solarSignUncertain&&request.points.includes('sun'))return personalSolarSignAnswer(chart);
  const text=request.points.map(key=>chart.uncertainPositions?.includes(key)?`${POINT_NAMES[key]}: знак может меняться в течение этого дня, без времени рождения точное положение не называю.`:positionText(facts,key,request)).join(' ');
  return !facts.angles&&!request.signOnly&&!request.houseOnly?text+' Без точного времени рождения дом не определяю.':text;
 }
 if(!facts.angles)return 'Без точного времени рождения дома и их управителей определить нельзя. Уточни время рождения в кабинете, если оно известно.';
 const rows=request.houses.map(h=>facts.houseRulers?.find(row=>row.house===h));
 if(rows.some(row=>!row?.rulers?.length))return 'В доступном расчёте нет таблицы управителей этого дома. Нужно обновить расчёт карты; придумывать управителей не буду.';
 return rows.flatMap(row=>row.rulers.map((r,i)=>{
  const label=row.house===2?'денежного дома':`${row.house}-го дома`;
  const role=row.rulers.length===1?`Управитель ${label}`:i===0?`Один из управителей ${label}`:`Другой управитель ${label}`;
  return `${role} — ${positionText(facts,r.planet)}`;
 })).join(' ');
}

// Bounded data projection for a monetary question, never the other eleven houses.
export function monetaryRecords(chart,question){
 if(!eligibleNatalFacts(chart,question)||!RULER.test(question))return null;
 const houses=houseMentions(question);
 if(COMPOUND_HOUSES.test(question)||[...question.matchAll(/(?<!\d)\d{1,2}(?!\d)/gu)].some(m=>Number(m[0])!==2)
  ||houses.some(h=>h!==2)||!/денежн|финансов|заработ|доход|(?:2|втор\p{L}*)\s*дом/iu.test(question)
  ||/формул|стратеги|стихи|аспект|сравни|связь|полн\p{L}*\s+разбор/iu.test(question))return null;
 const row=chart.calculated.houseRulers?.find(r=>r.house===2);
 if(!row)return null;
 if(namedChartPoints(question).some(key=>!row.rulers.some(r=>r.planet===key)))return null;
 const records=row.rulers.map(r=>({planet:POINT_NAMES[r.planet],sign:chart.calculated.positions[r.planet].sign,house:r.house??null}));
 return {houseSystem:chart.houseSystem,positions:records,houseRulers:[{house:2,cuspSign:row.sign,rulers:records}],aspects:[],factRule:'Это только управители денежного дома. Планета, стоящая в этом доме, не обязательно им управляет. Не добавляй другие планеты.'};
}
