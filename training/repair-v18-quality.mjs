// Bounded checks for observed false PASS. Not a complete semantic/factual judge.
import {SIGN_RULERS} from '../server/anna-method.js';
import {POINT_NAMES} from '../server/astro-chart.js';
import {repair17AnswerProblems} from './repair-v17-quality.mjs';
const signForms={Овен:'Овном',Телец:'Тельцом',Близнецы:'Близнецами',Рак:'Раком',Лев:'Львом',Дева:'Девой',Весы:'Весами',Скорпион:'Скорпионом',Стрелец:'Стрельцом',Козерог:'Козерогом',Водолей:'Водолеем',Рыбы:'Рыбами'};
const planetNames=Object.values(POINT_NAMES).join('|');
export function basicFactProblems(answer) {
 const problems=[],text=answer.replace(/\s+/gu,' ');
 for(const clause of text.split(/[.!?;\n]/u)){
  if(/Лун[аы] в кармине/iu.test(clause)&&!/термин.{0,15}Лун[аы] в кармине.{0,20}(?:нет|не существует)|не.{0,45}придумыв.{0,20}термин/iu.test(clause))problems.push('unknown dignity: кармин');
  if(/Луна в Сатурне/iu.test(clause))problems.push('planet used as a sign');
  if(/(?:модальности.{0,40}(?:называются|группы знаков:)\s*|три качества(?: определяют знак)?\s*[:—-]\s*)(?:огнен|земн|воздуш|водн|огонь|земля|воздух|вода)/iu.test(clause))problems.push('modalities confused with elements');
  if(/скопление планет[^.!?]{0,50}называют обителью|обитель — скопление/iu.test(clause))problems.push('stellium confused with domicile');
  if(/(?:фиксированн\p{L}* Дева|Дева.{0,15}фиксированн|мутабельн\p{L}* Водолей|Водолей.{0,15}мутабельн)/iu.test(clause)&&!/^\s*(?:нет|неверно|ошибка)/iu.test(clause))problems.push('wrong sign modality');
  const cuspClaim=/куспид[^.!?]{0,35}(?:в|во) Скорпионе[^.!?]{0,45}управитель\s*[—–-]\s*Юпитер/iu;
  if(cuspClaim.test(clause)&&!/^\s*(?:нет|неверно|ошибка)/iu.test(clause))problems.push('incorrect ruler of Скорпион');
  if(/сосед\p{L}*\s*[—–-]?\s*(?:это\s+)?(?:во?\s+)?2(?:-й|\s+дом)/iu.test(clause))problems.push('neighbours assigned to second house');
  for(const m of clause.matchAll(new RegExp(`(${planetNames})\\s+управляет\\s+([^.!?;]{1,100})`,'giu'))){
   if(/не\s*$/iu.test(clause.slice(0,m.index)))continue;
   for(const [sign,form]of Object.entries(signForms))if(new RegExp(form,'iu').test(m[2])&&!SIGN_RULERS[sign].some(k=>POINT_NAMES[k].toLowerCase()===m[1].toLowerCase()))problems.push('incorrect ruler of '+sign);
  }
  // Exact aspect angles, including the particular v17 180° trine mistake.
  if(!/^\s*(?:нет|неверно|ошибка)/iu.test(clause)){
   if(/(?:при|для|точн\p{L}*)\s+трин\p{L}*.{0,18}180\s*(?:°|градус)/iu.test(clause))problems.push('trine assigned 180 degrees');
   if(/точн\p{L}* квадрат\p{L}*\s*[—–-]?\s*(?:это|от)?\s*11[2-9]\s*(?:до|[—–-])/iu.test(clause))problems.push('square assigned wrong angle');
  }
 }
 return [...new Set(problems)];
}
export function repair18AnswerProblems(answer,card) {
 if(card.qualityVersion!==18)return [];
 const errors=repair17AnswerProblems(answer,{...card,qualityVersion:17});
 const keep=errors.filter(e=>{
  // Accept actual support paraphrases, not only the old imperative form.
  if(e==='v17: support request was not engaged'&&/могу (?:прислушаться|выслушать|поддержать)|можно обсудить|я могу быть здесь|хочешь рассказать/iu.test(answer))return false;
  // A treatment question needs a direct boundary, not an invitation to talk.
  if(e==='v17: support request was not engaged'&&/лечени|доз/iu.test(card.question)&&/нельзя.{0,40}(?:лечени|доз)|задача врача/iu.test(answer))return false;
  // Naming the three groups isn't required to explain their already-given meanings.
  if(/^v17: modality missing fact/.test(e)&&/запуск|начало/iu.test(answer)&&/удерж|сохран/iu.test(answer)&&/приспособ|адапт|смен/iu.test(answer)&&!/назов|перечисл|сколько|чем отличаются модальности/iu.test(card.question)&&!basicFactProblems(answer).includes('modalities confused with elements'))return false;
  if(e==='v17: direction missing fact 2'&&/прогрессивн\p{L}*(?: и натальн\p{L}*)? Солнц/iu.test(answer))return false;
  if(e==='v17: progression example missing expected day'&&card.progressedAge&&new RegExp(`(?<!\\d)${card.progressedAge}\\s+сут(?:ок|ки)`,'iu').test(answer))return false;
  return true;
 });
 keep.push(...basicFactProblems(answer).map(p=>'v18: '+p));
 if(card.rubricTopic==='orb'){
  if(/(?:при|для) трин\p{L}*.{0,22}180|точн\p{L}* квадрат.{0,18}112|допуск.{0,25}(?:час|времени).{0,70}15\s*градус|он одинаков для всех аспектов/iu.test(answer))keep.push('v18: false orb calculation');
 }
 if(card.rubricTopic==='ruler'&&/диспозитор\s*[—–-]\s*(?:любая )?планета,? стоящая в (?:этом )?знаке|один человек не может быть и тем, и другим/iu.test(answer))keep.push('v18: false dispositor definition');
 if(card.rubricTopic==='direction'&&/угол равен сумме|год соответствует примерно тридцати|текущие долготы планет/iu.test(answer))keep.push('v18: false solar arc calculation');
 if(card.rubricTopic==='relocation'&&/для релокации нужен момент переезда|время рождения изменить с утра на вечер|положения планет от времени не зависят/iu.test(answer))keep.push('v18: false relocation calculation');
 if(card.rubricTopic==='relocation'&&/день заселения|дат[ау] переезда/iu.test(card.question)&&/^\s*(?:Привет[!.,]?\s*)?Можно[,.]/iu.test(answer))keep.push('v18: relocation uses move date');
 if(card.rubricTopic==='progression'&&/день рождения считают первым|а не по возрасту в годах|со скоростью одна на двенадцать дней/iu.test(answer))keep.push('v18: false progression calculation');
 if(card.orbExample){
  const {actual,exact,limit}=card.orbExample,difference=Math.abs(actual-exact);
  const explicit=new RegExp(`(?:отклонени\\p{L}*|разниц\\p{L}*|орбис)[^.!?]{0,140}?(?:составля\\p{L}*|равн\\p{L}*|=)\\s*${difference}\\s*(?:°|градус)`,'iu').test(answer)||new RegExp(`(?:отклонени\\p{L}*|разниц\\p{L}*|орбис)\\s*[:—-]?\\s*${difference}\\s*(?:°|градус)`,'iu').test(answer);
  const excluded=limit!==undefined&&difference>limit&&new RegExp(`${exact-limit}\\s*[–—-]\\s*${exact+limit}`,'u').test(answer)&&/не входит|вне допуска|выходит за/iu.test(answer);
  if(!explicit&&!excluded)keep.push('v18: orb example missing correct difference');
  if(limit!==undefined&&difference>limit&&!/вне допуска|не (?:входит|попадает|укладывается)|превышает (?:допуск|предел)/iu.test(answer))keep.push('v18: orb example missing exclusion');
 }
 if(card.solarArcExample){
  const {natal,progressed}=card.solarArcExample,arc=(progressed-natal+360)%360;
  if(!new RegExp(`(?:дуга|разниц\\p{L}*|=)[^.!?]{0,35}(?<!\\d)${arc}\\s*(?:°|градус)`,'iu').test(answer))keep.push('v18: solar arc example missing correct difference');
 }
 return [...new Set(keep)];
}
