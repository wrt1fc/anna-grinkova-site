import { SIGN_PREPOSITIONAL } from './anna-method.js';
import { POINT_NAMES } from './astro-chart.js';
import {wantsNoAstroTerms} from './chat-topics.js';

const FORMS = { sun: 'Солнц[еауем]+', moon: 'Лун(?:а|ы|е|у|ой)', mercury: 'Меркури[йяюем]+', venus: 'Венер(?:а|ы|е|у|ой)',
  mars: 'Марс(?:а|у|ом|е)?', jupiter: 'Юпитер(?:а|у|ом|е)?', saturn: 'Сатурн(?:а|у|ом|е)?', uranus: 'Уран(?:а|у|ом|е)?',
  neptune: 'Нептун(?:а|у|ом|е)?', pluto: 'Плутон(?:а|у|ом|е)?', node: 'Северн\\p{L}*\\s+узл\\p{L}*', lilith: 'Лилит\\p{L}*',
  asc: '(?:Асцендент(?:а|у|ом|е)?|ASC|АСЦ)', mc: '(?:MC|МС)' };
const PLANET = `(?:${Object.values(FORMS).join('|')})`;
export function namedChartPoints(text) {
  return Object.keys(FORMS).filter(key=>new RegExp(`(?<!\\p{L})(?:${FORMS[key]})(?!\\p{L})`,'iu').test(text));
}
const keyFor = (text) => Object.keys(FORMS).find((key) => new RegExp(`^(?:${FORMS[key]})$`, 'iu').test(text));
const signFor = (text) => Object.entries(SIGN_PREPOSITIONAL).find(([base, form]) => base.toLowerCase() === text.toLowerCase() || form.toLowerCase() === text.toLowerCase())?.[0];
const SIGN = `(?:${[...new Set([...Object.keys(SIGN_PREPOSITIONAL), ...Object.values(SIGN_PREPOSITIONAL)])].sort((a,b)=>b.length-a.length).join('|')})`;
const SOLAR_GENITIVE = {Овен:'Овна',Телец:'Тельца',Близнецы:'Близнецов',Рак:'Рака',Лев:'Льва',Дева:'Девы',Весы:'Весов',Скорпион:'Скорпиона',Стрелец:'Стрельца',Козерог:'Козерога',Водолей:'Водолея',Рыбы:'Рыб'};
const SOLAR_SIGN = `(?:${[...Object.keys(SOLAR_GENITIVE), ...Object.values(SOLAR_GENITIVE)].sort((a,b)=>b.length-a.length).join('|')})`;

function wrongOwnerSolarSign(answer, expected) {
  if (!expected) return false;
  answer = answer.replace(/‘[^’]*’|'[^'\n]*'/gu, ' ');
  const claims = new RegExp(`(?<!\\p{L})(?:(?:ты|вы)\\s+родил(?:ась|ся|ись)\\s+под\\s+знаком|(?:твой|ваш|у тебя|у вас)\\s+(?:солнечный\\s+знак|знак\\s+зодиака)\\s*[—–:-]?|(?:ты|вы)\\s*[—–:-]?)\\s*(${SOLAR_SIGN})(?!\\p{L})`, 'giu');
  for (const match of answer.matchAll(claims)) {
    const start = Math.max(...['.','!','?',';','\n'].map(separator => answer.lastIndexOf(separator,match.index - 1))) + 1;
    const before = answer.slice(start,match.index);
    const after = answer.slice(match.index + match[0].length);
    if (/^\s+по\s+(?:асцендент\p{L}*|Лун\p{L}*)/iu.test(after)) continue;
    // A conditional, a question or a rejected/reported claim is not a fact about
    // this chart's owner. Subjectless and third-person phrases never match.
    if (/(?<!\p{L})(?:если|когда бы|допустим|предположим|возможно|неверно|неправда|не факт|не означает|не значит|сказал\p{L}*|говорил\p{L}*)(?!\p{L})/iu.test(before)
      || /(?:нельзя|нет оснований|не следует|не стоит)\s+(?:уверенно\s+)?(?:утверждать|считать|говорить|думать)[^.!?;\n]{0,40}$/iu.test(before)
      || /(?<!\p{L})не\s*$/iu.test(before)
      || /^[^.!?;\n]*\?/u.test(after)
      || /^[^.!?;\n]*?(?<!\p{L})если(?!\p{L})/iu.test(after)) continue;
    if (![expected,SOLAR_GENITIVE[expected]].filter(Boolean).some(sign => sign.toLowerCase() === match[1].toLowerCase())) return true;
  }
  return false;
}
const ORDINALS = { первом:1, втором:2, третьем:3, четвертом:4, четвёртом:4, пятом:5, шестом:6, седьмом:7, восьмом:8, девятом:9, десятом:10, одиннадцатом:11, двенадцатом:12 };
const HOUSE_GENITIVES = {первого:1,второго:2,третьего:3,четвертого:4,четвёртого:4,пятого:5,шестого:6,седьмого:7,восьмого:8,девятого:9,десятого:10,одиннадцатого:11,двенадцатого:12};
// Singular masculine forms cover house subjects and transitions as well as
// genitive ruler labels: «седьмой дом», «к седьмому дому», «седьмым домом».
const HOUSE_OTHER_CASES = [
  ['первый','первому','первым'], ['второй','второму','вторым'], ['третий','третьему','третьим'],
  ['четвертый','четвертому','четвертым','четвёртый','четвёртому','четвёртым'],
  ['пятый','пятому','пятым'], ['шестой','шестому','шестым'], ['седьмой','седьмому','седьмым'],
  ['восьмой','восьмому','восьмым'], ['девятый','девятому','девятым'], ['десятый','десятому','десятым'],
  ['одиннадцатый','одиннадцатому','одиннадцатым'], ['двенадцатый','двенадцатому','двенадцатым'],
];
const HOUSE_FORMS = {...ORDINALS,...HOUSE_GENITIVES,...Object.fromEntries(HOUSE_OTHER_CASES.flatMap((forms,i)=>forms.map(form=>[form,i+1])))};
const RULER_HOUSE = `(?:\\d{1,2}(?:-?(?:го|й|м|ом|х))?|${Object.keys(HOUSE_FORMS).join('|')})`;
const houseNumber = text => HOUSE_FORMS[text.toLowerCase()] ?? parseInt(text,10);
const HOUSE = `(?:\\d{1,2}(?:-?(?:м|ом))?|${Object.keys(ORDINALS).join('|')})`;
const ASPECT = '(?:соедин[её]н[а-яё]*|соединени[а-яё]*|трин[а-яё]*|тригон[а-яё]*|квадрат[а-яё]*|секстил[а-яё]*|оппозици[а-яё]*)';
const aspectFor = (text) => /соедин/iu.test(text)?'conjunction':/квадрат/iu.test(text)?'square':/секстил/iu.test(text)?'sextile':/оппозици/iu.test(text)?'opposition':'trine';

// Only asserted facts count. Preserve separators while removing quoted examples and
// direct negated assertions, so unrelated negation cannot hide an incorrect fact.
export function assertedNatalText(answer) {
  return String(answer)
    .replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu, ' ')
    .replace(new RegExp(`(${PLANET})\\s+(?:(?:у тебя|у вас)\\s+)?не\\s+(?:(?:стоит|находится|расположен\\p{L}*)\\s+)?(?:в|во)\\s+(?:${SIGN}\\s*)?(?:${HOUSE}\\s+доме)?`, 'giu'), ' ')
    .replace(/(?:другой|второй)\s+управитель\s+не\s+(?:нужен|указан|рассчитан)/giu, ' ');
}

// Conservative checks of explicit natal claims, not of every possible Russian paraphrase.
export function wrongCalculatedClaim(answer, chart) {
  const facts = chart?.calculated;
  if (!facts || chart.partner) return false; // A comparison needs subject-aware parsing; don't mix the two owners.
  answer = assertedNatalText(answer);
  if (wrongOwnerSolarSign(answer, facts.positions?.sun?.sign)) return true;
  const timed = (index) => {
    const start=Math.max(answer.lastIndexOf('.',index),answer.lastIndexOf('!',index),answer.lastIndexOf('?',index),answer.lastIndexOf('\n',index))+1;
    const end=answer.slice(index).search(/[.!?\n]/u);
    return /транзит|дирекц|прогресс/iu.test(answer.slice(start,end<0?undefined:index+end));
  };
  const point = (name) => { const key=keyFor(name); return facts.positions[key] ?? facts.angles?.[key]; };
  const planetList = `${PLANET}(?:\\s*(?:,|и)\\s*${PLANET}){1,11}`;
  const signList = `${SIGN}(?:\\s*(?:,|и)\\s*${SIGN}){0,11}`;
  const unassertedGroup = m => {
    const before=answer.slice(0,m.index).split(/[.!?;\n]/u).at(-1);
    const after=answer.slice(m.index+m[0].length);
    return /(?<!\p{L})(?:неверно|неправда|если|допустим|предположим)(?!\p{L})/iu.test(before)
      || /^\s+не\s+(?:стоят|находятся|собраны)(?!\p{L})/iu.test(after);
  };
  const grouped = new RegExp(`(${planetList})\\s+(?:(?:стоят|находятся|собраны)\\s+)?(?:в|во)\\s+(${signList})(?:\\s+(?:в|во)\\s+(${HOUSE})\\s+доме)?`, 'giu');
  const groupedSpans=[];
  for (const m of answer.matchAll(grouped)) {
    if (timed(m.index) || unassertedGroup(m)) continue;
    groupedSpans.push([m.index,m.index+m[0].length]);
    const signs = [...m[2].matchAll(new RegExp(SIGN,'giu'))].map(value=>signFor(value[0]));
    for (const name of m[1].matchAll(new RegExp(PLANET,'giu'))) {
      const p=point(name[0]);
      if (!signs.includes(p?.sign) || (m[3] && p?.house!==houseNumber(m[3]))) return true;
    }
  }
  const houseGroup = new RegExp(`(?:в|во)\\s+(${HOUSE})\\s+доме\\s*(?:[—–:-]\\s*)?(?:(?:стоят|находятся|собраны)\\s+)?(${planetList})`, 'giu');
  for (const m of answer.matchAll(houseGroup)) if (!timed(m.index) && !unassertedGroup(m)) {
    for (const name of m[2].matchAll(new RegExp(PLANET,'giu'))) if (point(name[0])?.house!==houseNumber(m[1])) return true;
  }
  const claimSign = new RegExp(`(${PLANET})(?: и (${PLANET}))?(?: у тебя)?(?: стоит| стоят| находится| находятся)? (?:в|во) (${SIGN})(?!\\p{L})`, 'giu');
  for (const m of answer.matchAll(claimSign)) if (!timed(m.index) && !groupedSpans.some(([start,end])=>m.index>=start&&m.index<end)) for (const name of [m[1],m[2]].filter(Boolean)) if (point(name)?.sign !== signFor(m[3])) return true;
  const claimHouse = new RegExp(`(${PLANET})(?: и (${PLANET}))?(?: у тебя)?\\s*(?:[,—–-]\\s*)?(?:(?:стоит|стоят|находится|находятся)\\s+)?(?:в|во) (?:${SIGN} (?:в|во) )?(${HOUSE}) доме`, 'giu');
  for (const m of answer.matchAll(claimHouse)) if (!timed(m.index)) for (const name of [m[1],m[2]].filter(Boolean)) if (point(name)?.house !== (ORDINALS[m[3].toLowerCase()] ?? parseInt(m[3],10))) return true;
  // Keep the named subject across a short description, but never cross another
  // named point: «Марс в ... соединён с ним и стоит во 2 доме».
  const sameSubject = `(?:(?!(?<!\\p{L})${PLANET}(?!\\p{L})|,\\s*(?:а|но|однако)(?!\\p{L})|(?<!\\p{L})управител)[^.!?;\\n]){0,100}?`;
  const delayedHouse = new RegExp(`(?<!\\p{L})(${PLANET})\\s+(?:в|во)\\s+${SIGN}(?!\\p{L})${sameSubject}(?:,\\s*|\\s+и\\s+)(?:стоит|находится|расположен[ао]?)\\s+(?:в|во)\\s+(${HOUSE})\\s+доме`,'giu');
  for(const m of answer.matchAll(delayedHouse))if(!timed(m.index)&&!unassertedGroup(m)&&point(m[1])?.house!==houseNumber(m[2]))return true;
  const locatedRulers = new RegExp(`(?:в|во)\\s+(${HOUSE})\\s+доме\\s+(?:(?:стоят|находятся)\\s+)?управители\\s+(?:дома\\s+${RULER_HOUSE}|${RULER_HOUSE}\\s+дома)\\s*[—–:-]?\\s*(${planetList})`,'giu');
  for(const m of answer.matchAll(locatedRulers)){
    const before=answer.slice(0,m.index).split(/[.!?;\n]/u).at(-1);
    if(timed(m.index)||unassertedGroup(m)||/(?<!\p{L})не\s*$/iu.test(before))continue;
    for(const name of m[2].matchAll(new RegExp(PLANET,'giu')))if(point(name[0])?.house!==houseNumber(m[1]))return true;
  }
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
  // Ruler claims are checked against the calculated table for all twelve houses, not only the 2nd and 7th.
  const rulerFacts = facts.houseRulers;
  if (Array.isArray(rulerFacts)) {
    // This parser is intentionally bounded to named ruler assertions. House
    // positions in the intervening explanation are not new ruler declarations.
    const rulerAnswer = answer.replace(/‘[^’]*’|'[^'\n]*'/gu, quoted => quoted.replace(/[^\r\n]/g,' ')).replace(/[^.!?;\n]+/gu, sentence => {
      // Framing «если говорить о личности» does not make the preceding ruler
      // assertion hypothetical; a real «если бы куспид...» still does.
      const assertion = sentence.replace(/(?<!\p{L})если\s+(?:говорить|смотреть|сказать\s+проще)(?!\p{L})/giu,' ');
      return /(?<!\p{L})(?:если|допустим|предположим|неверно|неправда|не факт)(?!\p{L})|(?:не|нельзя)\s+(?:считать|утверждать|говорить)|(?<!\p{L})не\s+управител/iu.test(assertion) ? sentence.replace(/[^\r\n]/g,' ') : sentence;
    });
    // A collective placement asserts the house of every ruler. Do not apply
    // this to named lists where each planet has its own separate placement.
    const collective = new RegExp(`управители\\s+(${RULER_HOUSE})\\s+дома\\s+(?:у тебя\\s+)?(?:стоят|находятся|расположены)\\s+(?:в|во)\\s+(${HOUSE})\\s+доме`,'giu');
    for (const m of rulerAnswer.matchAll(collective)) {
      if (timed(m.index)) continue;
      const entry=rulerFacts.find(item=>item.house===houseNumber(m[1]));
      if(entry&&entry.rulers.some(ruler=>ruler.house!==houseNumber(m[2]))) return true;
    }
    const rulerName = new RegExp(`управител\\p{L}*\\s+(${RULER_HOUSE})\\s*дома\\s*(?:—|–|-|:|,)?\\s*(?:это\\s+)?(${PLANET})(?:\\s*(?:,|и)\\s*(${PLANET}))?`, 'giu');
    for (const m of rulerAnswer.matchAll(rulerName)) {
      const entry = rulerFacts.find((item) => item.house === houseNumber(m[1]));
      if (entry && [m[2],m[3]].filter(Boolean).some(name => !entry.rulers.some(ruler => ruler.planet === keyFor(name)))) return true;
    }
    const moneyRulerName = new RegExp(`управител\\p{L}*\\s+денежного\\s+дома\\s*(?:—|–|-|:|,)?\\s*(${PLANET})`, 'giu');
    for (const m of rulerAnswer.matchAll(moneyRulerName)) {
      const entry = rulerFacts.find(item => item.house === 2);
      if (entry && !entry.rulers.some(ruler => ruler.planet === keyFor(m[1]))) return true;
    }
    const rulerPlace = new RegExp(`управител\\p{L}*\\s+(${RULER_HOUSE})\\s*дома[^.!?\\n]{0,80}?(?:^|\\s|[,;—–-])в\\s+(${RULER_HOUSE})\\s+доме`,'giu');
    for (const m of rulerAnswer.matchAll(rulerPlace)) {
      const entry = rulerFacts.find((item) => item.house === houseNumber(m[1]));
      if (entry && !entry.rulers.some((ruler) => ruler.house === houseNumber(m[2]))) return true;
    }
    // Claims without a house number («В 11 доме у тебя Лев. Его управители Солнце и Плутон.») are attributed
    // to the house last mentioned in the answer before the claim; without any house mention they cannot be checked.
    // A cusp followed by its own named ruler establishes the same discourse topic
    // as «управитель второго дома». The ruler's placement is not a topic switch.
    const cuspDeclarations=[...rulerAnswer.matchAll(new RegExp(`(?:куспид\\p{L}*|начало)\\s+(${RULER_HOUSE})\\s+дома([^.!?;\\n]{0,90}?)(?<!\\p{L})(?:его|её|ее)\\s+управител\\p{L}*\\s*(?:[—–,:-]\\s*)?(${PLANET})`,'giu'))]
      .filter(m=>!new RegExp(PLANET,'iu').test(m[2])&&!new RegExp(`${RULER_HOUSE}\\s+дом`,'iu').test(m[2]));
    const implicit = new RegExp(`(?:(второй|третий|четвёртый|четвертый|другой|ещ[её] один)\\s+)?управител\\p{L}*(?:\\s+(?:его|её|этого дома|этой темы|дома))?\\s*(?:—|–|-|:|,)?\\s*(?:это\\s+)?(${PLANET})(?:\\s*(?:,|и)\\s*(${PLANET}))?`, 'giu');
    for (const m of rulerAnswer.matchAll(implicit)) {
      if (new RegExp(`^управител\\p{L}*\\s+\\d`, 'iu').test(m[0])) continue; // explicit claims are checked above
      const before = rulerAnswer.slice(Math.max(0, m.index - 2000), m.index);
      // «Управитель Нептуна — Юпитер» describes a planet's dispositor,
      // not another ruler of the previously discussed house.
      if (new RegExp(`^управител\\p{L}*\\s+${PLANET}\\s*[,—–:-]\\s*${PLANET}`,'iu').test(rulerAnswer.slice(m.index))) continue;
      const declared = [...before.matchAll(new RegExp(`управител\\p{L}*\\s+(${RULER_HOUSE}|денежного)\\s+дома`,'giu'))].at(-1);
      const cusp=cuspDeclarations.filter(c=>c.index+c[0].length<=m.index).at(-1);
      const cuspOffset=cusp?cusp.index-Math.max(0,m.index-2000):-1;
      const declaration=cusp&&cuspOffset>=0&&(!declared||cuspOffset>declared.index)?{index:cuspOffset,text:cusp[0],house:houseNumber(cusp[1]),cusp:true}
        :declared?{index:declared.index,text:declared[0],house:declared[1].toLowerCase()==='денежного'?2:houseNumber(declared[1])}:null;
      const mentioned = [...before.matchAll(new RegExp(`(${RULER_HOUSE})\\s+дом`,'giu'))];
      if (!mentioned.length) continue;
      let house = houseNumber(mentioned.at(-1)[1]);
      if (m[1] && declaration) {
        const afterDeclaration = before.slice(declaration.index + declaration.text.length);
        const newTopic = [...afterDeclaration.matchAll(new RegExp(`(?:(?:теперь|далее)(?:\\s+(?:о|про|у))?|перейд[её]м к|что касается|куспид\\p{L}*|начало|у|для|[.!?;\\n])\\s*(${RULER_HOUSE})\\s+дом`,'giu'))].at(-1);
        const dispositor=declaration.cusp?[...afterDeclaration.matchAll(new RegExp(`(?:управител\\p{L}*\\s+${PLANET}\\s*[,—–:-]\\s*${PLANET}|диспозитор\\p{L}*)`,'giu'))].at(-1):null;
        if(dispositor&&(!newTopic||dispositor.index>newTopic.index))continue;
        house = newTopic ? houseNumber(newTopic[1]) : declaration.house;
      } else if (!m[1] && !/управители|управител\p{L}*\s+дома/iu.test(m[0])) {
        // Singular «его управитель» after a planet is ambiguous; only
        // accept this implicit form immediately after an explicit house topic.
        const afterHouse = before.slice(mentioned.at(-1).index + mentioned.at(-1)[0].length);
        const beforeHouse = before.slice(Math.max(0,mentioned.at(-1).index - 90),mentioned.at(-1).index).split(/[.!?;\n]/u).at(-1);
        if (new RegExp(PLANET,'iu').test(afterHouse) || new RegExp(PLANET,'iu').test(beforeHouse)) continue;
      }
      const entry = rulerFacts.find((item) => item.house === house);
      if (!entry) continue;
      for (const name of [m[2], m[3]].filter(Boolean)) {
        if (!entry.rulers.some((ruler) => ruler.planet === keyFor(name))) return true;
      }
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
  const facts=chart?.calculated;
  if (!facts?.positions) return 'Заполни дату, время (если известно) и место рождения в личном кабинете — тогда можно будет разобрать твою карту.';
  if (/сильн\p{L}*\s+сторон|талант|способност/iu.test(message)) return groundedStrengths(facts);
  if (/тревог|тревож|выгор|устал|восстанов|отдых/iu.test(message)) return groundedSupport(facts);
  const keys=Object.keys(MEANINGS).filter(key=>new RegExp(FORMS[key],'iu').test(message));
  const selected=[...new Set([...(keys.length?keys:['sun','moon']), ...(length==='detailed'?['sun','moon','mercury','venus']:[])])]
    .filter(key=>facts.positions[key]).slice(0,length==='short'?1:length==='detailed'?4:2);
  if (length === 'detailed') {
    return selected.map(key => {
      const p = facts.positions[key];
      return `${POINT_NAMES[key]} в ${SIGN_PREPOSITIONAL[p.sign]}${p.house ? `, в ${p.house}-м доме` : ''}. ${MEANINGS[key]}.`;
    }).join('\n\n') + '\n\nЭти показатели описывают разные стороны карты: цели, привычные реакции и способы взаимодействовать с людьми нужно сопоставлять, а не заменять одним солнечным знаком. Это ориентиры для размышления; по ним нельзя гарантировать конкретное событие или решение другого человека.';
  }
  const positions=selected.map(key=>{const p=facts.positions[key];return `${POINT_NAMES[key]} в ${SIGN_PREPOSITIONAL[p.sign]}${p.house?`, в ${p.house}-м доме`:''}`;});
  const meaning=selected.map(key=>MEANINGS[key]).join('. ');
  return `В твоей карте ${positions.join('; ')}. ${meaning}.${length==='short'?'':' Это опоры для разбора твоего вопроса, а не готовый приговор: проявление этих качеств зависит и от твоего опыта.'}`;
}

export function personalSolarSignAnswer(chart) {
  const sign = chart?.calculated?.positions?.sun?.sign;
  if (!sign) return 'Чтобы назвать твой солнечный знак, заполни дату и место рождения в личном кабинете. Время укажи, если оно известно: на границе знаков оно может понадобиться.';
  if (chart.solarSignUncertain) return 'Дата рождения близка к переходу Солнца в другой знак, а время рождения не указано. По сохранённым данным нельзя уверенно назвать один солнечный знак. Уточни время рождения в личном кабинете.';
  return `Твой знак зодиака — ${sign}. В рассчитанной карте Солнце в ${SIGN_PREPOSITIONAL[sign]}.`;
}

export function plainNatalAnswer(chart,question,length='medium') {
 const facts=chart?.calculated;
 if(!facts?.positions?.sun||chart.solarSignUncertain)return personalSolarSignAnswer(chart);
 const point=key=>facts.positions[key]??facts.angles?.[key];
 const key=namedChartPoints(question).find(k=>point(k))??'sun';
 const p=point(key);
 const meaning=calculatedPointMeaning(chart,key);
 const detail=length==='detailed'?' Например, выбери недавнюю обычную ситуацию и вспомни, какими были твои действия, что помогло и каким получился результат. Не нужно искать подтверждение каждому описанию: часть может не совпасть с твоим опытом. Можно оставить только то, что помогает сформулировать вопрос о себе, и проверить выводы на реальных поступках. Знак сам по себе не определяет профессию, поведение другого человека или будущее событие.':'';
 return wantsNoAstroTerms(question)?`${meaning}${detail}`:`${POINT_NAMES[key]} в ${SIGN_PREPOSITIONAL[p.sign]}. ${meaning}${detail}`;
}

export function calculatedPointMeaning(chart,key){
 const p=chart?.calculated?.positions?.[key]??chart?.calculated?.angles?.[key];
 if(!p)return null;
 const basic=MEANINGS[key]??({asc:'Асцендент — начало первого дома; в трактовке его связывают с первым впечатлением и способом вступать в контакт',mc:'MC — середина неба, один из углов карты; его используют при обсуждении профессиональных целей'}[key]??'Это отдельный показатель карты, который рассматривают вместе с другими данными');
 return key==='sun'&&STRENGTHS[p.sign]
  ? `В астрологических трактовках это тема: ${STRENGTHS[p.sign]}. Это не готовая оценка твоих способностей — сравни с собственным опытом.`
  : `${basic}. Это тема для разговора, а не точное описание твоего характера.`;
}

// Practical hypotheses tied to the calculated element, never diagnoses or guarantees.
const STRENGTHS = {
  Овен: 'начинать дело и проверять идеи действием', Лев: 'представлять свои идеи и брать ответственность за результат', Стрелец: 'видеть перспективу и связывать работу с понятной целью',
  Телец: 'последовательно доводить дело до осязаемого результата', Дева: 'замечать детали и улучшать рабочий процесс', Козерог: 'планировать долгую работу и выстраивать последовательные шаги',
  Близнецы: 'собирать сведения и объяснять их другим', Весы: 'сопоставлять разные позиции и искать договорённость', Водолей: 'находить новые подходы и обмениваться идеями',
  Рак: 'замечать потребности людей и создавать поддерживающую среду', Скорпион: 'внимательно исследовать сложный вопрос', Рыбы: 'использовать воображение и замечать оттенки переживаний',
};
function groundedStrengths(facts) {
  const sun = facts.positions.sun;
  if (!sun || !STRENGTHS[sun.sign]) return 'Назови занятие, в котором ты чувствуешь себя уверенно: разберём, какие навыки помогают получать результат.';
  return `Солнце в ${SIGN_PREPOSITIONAL[sun.sign]} даёт тему для проверки: способность ${STRENGTHS[sun.sign]}. Это астрологическая гипотеза, а не оценка твоих реальных навыков. Вспомни два случая, когда у тебя это получилось: какие действия помогли, какой получился результат и что можно повторить в ближайшей задаче? Так сильная сторона станет конкретным действием.`;
}
function groundedSupport(facts) {
  const moon = facts.positions.moon;
  return `${moon ? `Луна в ${SIGN_PREPOSITIONAL[moon.sign]} — один из показателей для разговора об эмоциональной опоре. ` : ''}Причину тревоги или усталости по карте установить нельзя. На сегодня попробуй убрать одну необязательную задачу, выделить спокойное время для отдыха и записать, что именно сейчас тревожит. Выбери из списка одну вещь, на которую можешь повлиять, и самый небольшой следующий шаг. Если сил мало, начни с отдыха и поддержки близкого человека.`;
}
