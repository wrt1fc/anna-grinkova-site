// Bounded checks for observed mistakes, not a semantic truth oracle.
// Only explicit assertions are rejected. Unknown claims remain unknown.
import {sourceGroundedTheoryProblems} from './astro-reference.js';
import {SIGN_RULERS} from './anna-method.js';
import {POINT_NAMES} from './astro-chart.js';
import {orbExample,orbCorrection,incorrectOrbClaim} from './theory-numerics.js';
const groups={кардинальная:['Овен','Рак','Весы','Козерог'],фиксированная:['Телец','Лев','Скорпион','Водолей'],мутабельная:['Близнецы','Дева','Стрелец','Рыбы']};
const modalityCorrection='Модальности: Овен, Рак, Весы и Козерог — кардинальные; Телец, Лев, Скорпион и Водолей — фиксированные; Близнецы, Дева, Стрелец и Рыбы — мутабельные. Это отдельная классификация от четырёх стихий.';
export function astroFactProblems(answer,{question='',chart=null}={}){
 const issues=sourceGroundedTheoryProblems(answer,{question}).map(problem=>{
  if(problem==='Sun sign substituted for first-house cusp')return {code:'sun_sign_is_not_cusp',correction:'Знак Солнца не определяет начало первого дома и не означает, что Солнце стоит на его куспиде. В Плацидусе начало первого дома — асцендент; его рассчитывают по моменту и месту рождения.'};
  // Resolve only exact source-derived ruler diagnostics; never infer a planet from model text.
  const sign=Object.keys(SIGN_RULERS).find(sign=>problem===`incorrect ruler of ${sign}`||problem===`incorrect ruler role of ${sign}`);
  if(!sign)throw new Error('Unknown source-grounded theory diagnostic: '+problem);
  const describe=sign=>{const names=SIGN_RULERS[sign].map(key=>POINT_NAMES[key]);return `${sign}: главный управитель — ${names[0]}${names.length>1?`, соуправитель — ${names[1]}`:''}`;};
  return {code:'incorrect_ruler_'+sign,correction:'По таблице методики Анны '+[sign,...Object.keys(SIGN_RULERS).filter(other=>other!==sign)].map(describe).join('; ')+'. Порядок главного управителя и соуправителя менять нельзя.'};
 });
 const add=(code,correction)=>{if(!issues.some(x=>x.code===code))issues.push({code,correction});};
 const orb=orbExample(question);
 if(incorrectOrbClaim(answer,orb))add('incorrect_orb_arithmetic',orbCorrection(orb));
 const clauses=answer.replace(/\s+/gu,' ').split(/[.!?;\n]/u);
 for(const clause of clauses){
  // Don't reject a direct denial, counterexample or clarification of the false claim.
  const positive=clause.replace(/(?:не\s+(?:является\s+)?|не\s+относится\s+к\s+)(?:фиксированн|кардинальн|мутабельн)\p{L}*/giu,'');
  for(const [kind,signs]of Object.entries(groups))for(const sign of signs){
   for(const other of Object.keys(groups).filter(x=>x!==kind)){
    const wrong=new RegExp(`${sign}\\s*(?:—|-|–|является|относится к)?\\s*${other.slice(0,8)}\\p{L}*|${other.slice(0,8)}\\p{L}*\\s*(?:—|-|–)?\\s*${sign}`,'iu');
    if(wrong.test(positive)&&!/^\s*(?:нет|неверно|ошибка)/iu.test(clause))add('wrong_modality',modalityCorrection);
   }
  }
  if(/в каждой стихии.{0,18}по четыре|всех четыр[её]х стихиях.{0,18}по четыре/iu.test(clause)&&!/не по четыре/iu.test(clause))add('element_count','В каждой из трёх модальностей четыре знака, а в каждой из четырёх стихий три знака. Всего знаков двенадцать.');
  if(/Лун\p{L}*.{0,16}в обители Близнец|обитель Луны\s*[—–-]?\s*Близнец/iu.test(clause)&&!/^\s*(?:нет|неверно|ошибка)/iu.test(clause)&&!/Лун\p{L}*.{0,10}не в обители/iu.test(clause))add('moon_domicile','Обитель Луны — Рак. Положение Луны в Близнецах является другим положением и не называется её обителью.');
  if(/Южный узел\s*[—–-]\s*точка роста|Северный\s*[—–-]\s*привычный способ/iu.test(clause))add('reversed_nodes','В принятой трактовке Южный лунный узел связан с привычными качествами, Северный — с направлением развития. Это не предсказание наказания.');
  if(/узл/iu.test(question)&&/(?:узлы.{0,40}Десцендент|Десцендент.{0,18}(?:показывает|—|-) (?:тему )?роста|Деса\s*[—–-]\s*где)/iu.test(clause)&&!/узлы.{0,20}(?:не |отлич|разные).{0,35}(?:асцендент|десцендент)/iu.test(clause))add('nodes_are_not_angles','Северный и Южный лунные узлы — точки пересечения лунной орбиты с эклиптикой. Асцендент и десцендент — другие точки карты; подменять ими лунные узлы нельзя.');
  if(/в доме (?:только )?один знак,? а не два|каждый дом.{0,20}только один знак/iu.test(clause))add('house_is_not_sign','Дома Плацидуса не равны знакам. Один дом может захватывать части нескольких знаков; знак на его куспиде определяется отдельно.');
  if(/врем\p{L}*.{0,15}рождени|рождени.{0,15}врем/iu.test(question)&&/нужна проверенная причина|требуется подтвержд[её]нная причина|необходимо.{0,15}свидетельство/iu.test(clause))add('invented_profile_requirement','Время рождения можно изменить в сохранённых данных личного кабинета. Требование подтверждённой причины или свидетельства для изменения данных не установлено.');
  if(/Лун\p{L}*.{0,20}(?:меняет знак|переходит.{0,8}знак).{0,15}(?:каждый день|каждые сутки|каждые 24 часа)/iu.test(clause)&&!/не\s+(?:каждый|каждые)/iu.test(clause))add('moon_daily_sign','Луна обычно проходит один знак примерно за два–три дня, а не обязательно за сутки. Точный переход проверяют по эфемеридам на заданное время.');
 }
 if(/(?:вход|допуск)/iu.test(question)&&/^(?:Привет[!.,]?\s*)?Да,? входит[.!]/iu.test(answer)&&/не входит|выходит за предел/iu.test(answer))add('contradictory_orb','Ответ о вхождении в допуск должен быть однозначным: абсолютное отклонение от точного угла сравнивают с пределом. Отклонение больше предела не входит в допуск.');
 const sun=chart?.calculated?.positions?.sun?.sign,asc=chart?.calculated?.angles?.asc?.sign;
 if(sun&&asc&&/Солнце и асцендент.{0,35}противоположных знаках/iu.test(answer)&&!/Солнце и асцендент.{0,15}не.{0,15}противоположных/iu.test(answer)){
  const order=['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
  if((order.indexOf(sun)-order.indexOf(asc)+12)%12!==6)add('sun_asc_not_opposite',`В рассчитанной карте Солнце — ${sun}, асцендент — ${asc}. Эти знаки не являются противоположными; это разные показатели личности без заявленного противостояния знаков.`);
 }
 if(/не придумывай их|без цитирования правил/iu.test(answer))add('instruction_echo',/оплат|подписк|доступ/iu.test(question)?'Оплата подписки доступна в приложении. Уточни, что нужно узнать об оплате или доступе.':'Напиши название показателя или уточни вопрос, чтобы можно было ответить по существу.');
 if(/слово|термин/iu.test(question)&&/пока не|не привел|не привёл|не привела|не назва/iu.test(question)&&/это не слово из карты, а название приложения|это название приложения/iu.test(answer))add('invented_missing_term','Напиши само слово или название показателя, которое нужно объяснить. Без него значение нельзя определить надёжно.');
 return issues;
}
