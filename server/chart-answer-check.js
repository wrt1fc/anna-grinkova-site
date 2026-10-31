import { SIGN_PREPOSITIONAL } from './anna-method.js';
import { POINT_NAMES } from './astro-chart.js';

const FORMS = { sun: 'Солнц[еауем]+', moon: 'Лун(?:а|ы|е|у|ой)', mercury: 'Меркури[йяюем]+', venus: 'Венер(?:а|ы|е|у|ой)',
  mars: 'Марс(?:а|у|ом|е)?', jupiter: 'Юпитер(?:а|у|ом|е)?', saturn: 'Сатурн(?:а|у|ом|е)?', uranus: 'Уран(?:а|у|ом|е)?',
  neptune: 'Нептун(?:а|у|ом|е)?', pluto: 'Плутон(?:а|у|ом|е)?', asc: '(?:Асцендент(?:а|у|ом|е)?|ASC|АСЦ)', mc: '(?:MC|МС)' };
const PLANET = `(?:${Object.values(FORMS).join('|')})`;
const keyFor = (text) => Object.keys(FORMS).find((key) => new RegExp(`^(?:${FORMS[key]})$`, 'iu').test(text));
const signFor = (text) => Object.entries(SIGN_PREPOSITIONAL).find(([base, form]) => base.toLowerCase() === text.toLowerCase() || form.toLowerCase() === text.toLowerCase())?.[0];
const SIGN = `(?:${[...new Set([...Object.keys(SIGN_PREPOSITIONAL), ...Object.values(SIGN_PREPOSITIONAL)])].sort((a,b)=>b.length-a.length).join('|')})`;
const ORDINALS = { первом:1, втором:2, третьем:3, четвертом:4, четвёртом:4, пятом:5, шестом:6, седьмом:7, восьмом:8, девятом:9, десятом:10, одиннадцатом:11, двенадцатом:12 };
const HOUSE = `(?:\\d{1,2}(?:-?(?:м|ом))?|${Object.keys(ORDINALS).join('|')})`;
const ASPECT = '(?:соедин[её]н[а-яё]*|соединени[а-яё]*|трин[а-яё]*|тригон[а-яё]*|квадрат[а-яё]*|секстил[а-яё]*|оппозици[а-яё]*)';
const aspectFor = (text) => /соедин/iu.test(text)?'conjunction':/квадрат/iu.test(text)?'square':/секстил/iu.test(text)?'sextile':/оппозици/iu.test(text)?'opposition':'trine';

// Conservative checks of explicit natal claims, not of every possible Russian paraphrase.
export function wrongCalculatedClaim(answer, chart) {
  const facts = chart?.calculated;
  if (!facts || chart.partner) return false; // A comparison needs subject-aware parsing; don't mix the two owners.
  const timed = (index) => {
    const start=Math.max(answer.lastIndexOf('.',index),answer.lastIndexOf('!',index),answer.lastIndexOf('?',index),answer.lastIndexOf('\n',index))+1;
    const end=answer.slice(index).search(/[.!?\n]/u);
    return /транзит|дирекц|прогресс/iu.test(answer.slice(start,end<0?undefined:index+end));
  };
  const point = (name) => { const key=keyFor(name); return facts.positions[key] ?? facts.angles?.[key]; };
  const claimSign = new RegExp(`(${PLANET})(?: и (${PLANET}))?(?: у тебя)?(?: стоит| находится)? (?:в|во) (${SIGN})(?!\\p{L})`, 'giu');
  for (const m of answer.matchAll(claimSign)) if (!timed(m.index)) for (const name of [m[1],m[2]].filter(Boolean)) if (point(name)?.sign !== signFor(m[3])) return true;
  const claimHouse = new RegExp(`(${PLANET})(?: и (${PLANET}))?(?: у тебя)?(?: стоит| находится)? (?:в|во) (?:${SIGN} (?:в|во) )?(${HOUSE}) доме`, 'giu');
  for (const m of answer.matchAll(claimHouse)) if (!timed(m.index)) for (const name of [m[1],m[2]].filter(Boolean)) if (point(name)?.house !== (ORDINALS[m[3].toLowerCase()] ?? parseInt(m[3],10))) return true;
  const checkAspect = (a,b,aspect) => facts.aspects.some(f=> f.aspect===aspectFor(aspect)
    && ((f.first===keyFor(a)&&f.second===keyFor(b))||(f.first===keyFor(b)&&f.second===keyFor(a))));
  const consumed=[];
  const compound = new RegExp(`(${ASPECT}) (${PLANET}) и (${PLANET}) к (${PLANET})`, 'giu');
  for (const m of answer.matchAll(compound)) { if(!timed(m.index)&&(!checkAspect(m[2],m[4],m[1])||!checkAspect(m[3],m[4],m[1])))return true;consumed.push([m.index,m.index+m[0].length]); }
  for (const re of [
    new RegExp(`(${ASPECT}) (${PLANET}) (?:и|к|с|—) (${PLANET})`, 'giu'),
    new RegExp(`(${PLANET}) и (${PLANET}) (?:у тебя )?(${ASPECT})`, 'giu'),
    new RegExp(`(${PLANET}) (?:у тебя )?(?:в )?(${ASPECT}) (?:к|с) (${PLANET})`, 'giu'),
  ]) {
    for(const m of answer.matchAll(re)) {
      if(timed(m.index)||consumed.some(([a,b])=>m.index>=a&&m.index<b))continue;
      const at= m[1].match(new RegExp(`^${ASPECT}$`,'iu'))?0: m[2].match(new RegExp(`^${ASPECT}$`,'iu'))?1:2;
      const values=m.slice(1);const aspect=values.splice(at,1)[0];if(!checkAspect(values[0],values[1],aspect))return true;
    }
  }
  return false;
}

const MEANINGS = { sun:'Солнце связывают с тем, как человек проявляет себя и выбирает важные цели', moon:'Луну связывают с эмоциональными потребностями и ощущением опоры',
  mercury:'Меркурий связывают с общением и способом учиться', venus:'Венеру связывают с симпатиями, ценностями и способом проявлять чувства',
  mars:'Марс связывают с инициативой и тем, как человек действует', jupiter:'Юпитер связывают с поиском смысла и расширением кругозора',
  saturn:'Сатурн связывают с ответственностью, границами и навыками, которые растут с практикой', uranus:'Уран связывают с самостоятельностью и готовностью пробовать новое',
  neptune:'Нептун связывают с воображением, восприимчивостью и поиском смысла', pluto:'Плутон связывают с глубокими переменами и отношением к контролю' };
export function groundedNatalAnswer(chart, message, length='medium') {
  const facts=chart.calculated;
  const keys=Object.keys(MEANINGS).filter(key=>new RegExp(FORMS[key],'iu').test(message));
  const selected=(keys.length?keys:['sun','moon']).slice(0,length==='short'?1:2);
  const positions=selected.map(key=>{const p=facts.positions[key];return `${POINT_NAMES[key]} в ${SIGN_PREPOSITIONAL[p.sign]}${p.house?`, в ${p.house}-м доме`:''}`;});
  const meaning=selected.map(key=>MEANINGS[key]).join('. ');
  return `В твоей карте ${positions.join('; ')}. ${meaning}.${length==='short'?'':' Это опоры для разбора твоего вопроса, а не готовый приговор: проявление этих качеств зависит и от твоего опыта.'}`;
}
