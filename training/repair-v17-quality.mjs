import {identityProblems,instructionEchoProblems} from './answer-regressions.mjs';
import {SIGN_RULERS} from '../server/anna-method.js';
import {POINT_NAMES} from '../server/astro-chart.js';
const groups={
 modality:[['кардинальн'],['фиксирован|устойчив'],['мутабельн|подвижн']],
 progression:[['день|дня|дней|сут(?:к|ок)'],['год|лет'],['после рождения|послеродов|после момента рождения|после твоего рождения|(?:момент(?:а)?\\s+рождения|рождени[яе])\\s*(?:плюс|\\+)\\s*\\d+\\s*сут(?:ок|ки)']],
 relocation:[['планет'],['сохран|не меня|оста[ею]тся|остаются|прежн'],['дом|угл|асцендент']],
 ruler:[['куспид|начал.{0,12}дома'],['знак'],['управител|хозяин']],
 orb:[['отклонени|допуск|разниц'],['аспект|угл|угол']],
 direction:[['солнечн.{0,12}дуг|символическ.{0,20}сдвиг|сдвиг.{0,20}дуг'],['прогрессивн\\p{L}*.{0,15}Солнц|прогрессирующ.{0,15}Солнц|временн.{0,10}ключ']],
};
const genitive={Овен:'Овна',Телец:'Тельца',Близнецы:'Близнецов',Рак:'Рака',Лев:'Льва',Дева:'Девы',Весы:'Весов',Скорпион:'Скорпиона',Стрелец:'Стрельца',Козерог:'Козерога',Водолей:'Водолея',Рыбы:'Рыб'};
const normalize=text=>text.replace(/^\s*Привет[!.,]?\s*/iu,'').replace(/\s+/gu,' ').trim();
export function repair17AnswerProblems(answer,card){
 if(card.qualityVersion!==17)return [];
 const errors=instructionEchoProblems(answer).map(e=>'v17: '+e),topic=card.rubricTopic;
 if(topic==='identity')errors.push(...identityProblems(answer).map(e=>'v17: '+e));
 else if(topic&&topic!=='clarification'&&!groups[topic])throw Error('Unknown v17 rubric '+topic);
 for(const [i,options]of (groups[topic]??[]).entries())if(!options.some(p=>new RegExp(p,'iu').test(answer)))errors.push(`v17: ${topic} missing fact ${i+1}`);
 if(topic==='modality'&&/в каждой группе три знака|мутуацион|модальности — это четыре стихии/iu.test(answer))errors.push('v17: false modality claim');
 if(topic==='progression'&&/каждый год жизни соответствует примерно одному градусу|по одному градусу за один земной день|один день можно сопоставить с любой датой года/iu.test(answer))errors.push('v17: false progression claim');
 if(topic==='relocation'&&/релокация добавляет свои положения и аспекты|как изменились дома и аспекты|рассчитывается по месту рождения, а не по месту проживания/iu.test(answer))errors.push('v17: false relocation claim');
 if(topic==='ruler'&&/если Солнце не в своём знаке, можно взять управителя его знака|управителя дома находят по знаку асцендента/iu.test(answer))errors.push('v17: false ruler/dispositor substitution');
 for(const [sign,form]of Object.entries(genitive)){
  const match=new RegExp(`управител(?:ь|ем) ${form}(?: будет| является)?\\s*[—–:-]?\\s*(${Object.values(POINT_NAMES).join('|')})`,'iu').exec(answer);
  if(match&&!SIGN_RULERS[sign].some(key=>POINT_NAMES[key].toLowerCase()===match[1].toLowerCase()))errors.push('v17: incorrect ruler of '+sign);
 }
 if(topic==='orb'&&/как называется|что подразумевают под орбисом/iu.test(card.question)&&!/орбис/iu.test(answer))errors.push('v17: orb name missing');
 if(card.progressedAge!==undefined){
  if(!Number.isInteger(card.progressedAge)||card.progressedAge<1||card.progressedAge>100)throw Error('Invalid progression example');
  const expected=new RegExp(`(?<!\\d)${card.progressedAge}(?:-?(?:й|ый|го|х))?\\s*(?:послеродовой\\s+)?(?:день|дня|дней|сут(?:к|ок))`,'iu');
  if(!expected.test(answer))errors.push('v17: progression example missing expected day');
 }
 if(topic==='clarification'&&!/(?:како[йе]|о чём|что именно|уточни|напомни|какие).{0,80}\?|(?:расскажи|уточни|напомни|напиши),?\s+(?:како[йе]|название|что именно|о ч[её]м именно)/iu.test(answer))errors.push('v17: clarification question missing');
 if(card.expectSupport&&!/расскажи|я рядом|можно поговорить|можешь рассказать|давай поговорим|что сейчас|что тебе сейчас/iu.test(answer))errors.push('v17: support request was not engaged');
 if(/Хочешь разобраться глубже|Институт прогрессивной психологии|пройди курс|обучение у Анны/iu.test(answer))errors.push('v17: unsolicited course text');
 if(/Пока не получается дать точный ответ/iu.test(answer))errors.push('v17: fallback instead of answer');
 const previous=(card.history??[]).filter(r=>r.role==='assistant').at(-1)?.content;
 if(card.scope!=='offtopic'&&previous&&normalize(previous)===normalize(answer))errors.push('v17: repeated history');
 if(card.scope!=='offtopic'&&/Это не астрологическ|не относится к астрологи|не моя тематика/iu.test(answer))errors.push('v17: refusal of allowed topic');
 return errors;
}
