import { ASPECT_NAMES, POINT_NAMES } from './astro-chart.js';
import { SIGN_PREPOSITIONAL, SIGN_RULERS } from './anna-method.js';

// Editorial interpretations are symbolic tendencies, not a verdict about a person or a promised event.
const QUALITIES = {
  Овен: 'инициативность, прямота и готовность действовать', Телец: 'надёжность, устойчивость и забота в поступках',
  Близнецы: 'любознательность, общение и живой обмен идеями', Рак: 'эмоциональная близость, забота и уважение к личному пространству',
  Лев: 'тепло, щедрость и способность открыто проявлять чувства', Дева: 'внимательность к деталям и участие в повседневных делах',
  Весы: 'диалог, равноправие и готовность договариваться', Скорпион: 'глубина чувств, доверие и честность в непростых темах',
  Стрелец: 'широкий взгляд на жизнь, интерес к другим культурам и общие смыслы', Козерог: 'ответственность, зрелость и уважение к договорённостям',
  Водолей: 'самостоятельность, дружба и уважение к различиям', Рыбы: 'чуткость, воображение и эмоциональный отклик',
};
const HOUSE_THEMES = {
  1: 'личная инициатива и право быть собой', 2: 'ценности, надёжность и обращение с ресурсами', 3: 'общение, обучение и повседневные контакты',
  4: 'дом, близость и ощущение опоры', 5: 'творчество, радость и свободное выражение чувств', 6: 'повседневная жизнь и взаимная помощь',
  7: 'равноправие и умение быть в диалоге', 8: 'доверие, уязвимость и общие обязательства',
  9: 'образование, путешествия, другие культуры и общие взгляды на жизнь', 10: 'цели, ответственность и место в обществе',
  11: 'дружба, единомышленники и совместные планы', 12: 'внутренняя жизнь, тишина и уважение к потребности в уединении',
};
export function relationshipContext(natal) {
  const cusp = natal.cusps?.find((item) => item.house === 7);
  const rulers = cusp ? SIGN_RULERS[cusp.sign].map((key, index) => ({ key, name: POINT_NAMES[key],
    sign: natal.planets[key].sign, house: natal.planets[key].house ?? null, primary: index === 0,
    theme: HOUSE_THEMES[natal.planets[key].house] ?? null })) : [];
  const relevant = new Set(['venus', 'moon', 'mars', ...rulers.map((p) => p.key)]);
  return {
    seventhHouse: cusp ? { sign: cusp.sign, qualities: QUALITIES[cusp.sign], rulers } : null,
    needs: ['venus', 'moon', 'mars'].map((key) => ({ key, name: POINT_NAMES[key], sign: natal.planets[key].sign,
      house: natal.planets[key].house ?? null, qualities: QUALITIES[natal.planets[key].sign] })),
    aspects: natal.aspects.filter((a) => relevant.has(a.first) || relevant.has(a.second)).slice(0, 8)
      .map((a) => `${POINT_NAMES[a.first]} — ${POINT_NAMES[a.second]}: ${ASPECT_NAMES[a.aspect]} (орб ${a.orb}°)`),
    note: cusp ? 'Свяжи показатели между собой. Другая культура не обязательно означает иностранное гражданство; один показатель не определяет выбор партнёра.'
      : 'Точное время рождения не задано: 7-й дом, управитель дома и дома планет неизвестны. Опирайся только на рассчитанные знаки и аспекты.',
  };
}

// An auditable answer if generation twice ignores or contradicts the actual relationship facts.
export function groundedRelationshipAnswer(chart, length = 'medium') {
  const r = chart.relationship, seventh = r.seventhHouse;
  const venus = r.needs.find((p) => p.key === 'venus');
  let answer;
  if (seventh) {
    answer = `У тебя 7-й дом в ${SIGN_PREPOSITIONAL[seventh.sign]}. В отношениях могут быть особенно важны ${seventh.qualities}.`;
    const ruler = seventh.rulers[0];
    if (length !== 'short' && ruler) answer += ` Управитель 7-го дома — ${ruler.name}, в ${ruler.house}-м доме: здесь добавляется тема «${ruler.theme}».`;
  } else answer = `В твоей карте Венера в ${SIGN_PREPOSITIONAL[venus.sign]}. Это может указывать на то, что тебе близки ${venus.qualities}. Точного времени рождения нет, поэтому по 7-му дому вывод сделать нельзя.`;
  if (length !== 'short' && seventh) answer += ` Венера в ${SIGN_PREPOSITIONAL[venus.sign]} добавляет: ${venus.qualities}.`;
  if (length !== 'short') answer += '\n\nЭто ориентиры для размышления, а не обязательный портрет партнёра. Посмотри, совпадают ли эти качества с тем, что для тебя важно в реальных отношениях.';
  return answer;
}

export function relationshipAnswerProblems(answer, chart, length = 'medium') {
  const r = chart?.relationship;
  if (!r) return false;
  if (/(?<!\p{L})(?:Смотр|Смотрр|Смот|Смотришь),/iu.test(answer)) return true;
  if (/если\s+(?:она|он|(?:твоя |твой )?(?:Венера|Луна|Марс|Юпитер|Сатурн))\s+(?:у тебя\s+)?в /iu.test(answer)) return true;
  // Every named placement must agree with the calculated cusp and ruler, including written ordinal forms.
  const ordinals = { первом: 1, втором: 2, третьем: 3, четвёртом: 4, четвертом: 4, пятом: 5, шестом: 6, седьмом: 7, восьмом: 8, девятом: 9, десятом: 10, одиннадцатом: 11, двенадцатом: 12 };
  const houseNumber = (s) => ordinals[s.toLowerCase()] ?? Number.parseInt(s, 10);
  const signs = Object.values(SIGN_PREPOSITIONAL).join('|');
  if (!chart.partner && r.requireOverview !== false) {
    if (r.seventhHouse) {
      const cuspClaim = new RegExp(`(?:7(?:-?(?:й|го|ого))?|седьм(?:ой|ого)) дом(?:а)?(?: у тебя)?(?: стоит| находится)? в ${SIGN_PREPOSITIONAL[r.seventhHouse.sign]}`, 'iu');
      if (!cuspClaim.test(answer)) return true;
      if (length !== 'short') {
        const p = r.seventhHouse.rulers[0];
        const claim = new RegExp(`${p.name}[^.!?]{0,80}?в (\\d+(?:-м|м)?|${Object.keys(ordinals).join('|')}) доме`, 'iu').exec(answer);
        if (!claim || houseNumber(claim[1]) !== p.house) return true;
      }
    } else if (!/врем[яеени]* рожд|точн[а-яё]* врем/iu.test(answer)) return true;
  }
  for (const claim of answer.matchAll(new RegExp(`(?:7[-\\s]*й|седьмой) дом (?:у тебя )?(?:находится |стоит )?в (${signs})`, 'giu'))) {
    if (!r.seventhHouse || claim[1].toLowerCase() !== SIGN_PREPOSITIONAL[r.seventhHouse.sign].toLowerCase()) return true;
  }
  for (const p of r.needs.concat(r.seventhHouse?.rulers ?? [])) {
    for (const claim of answer.matchAll(new RegExp(`${p.name}(?: у тебя)?(?: стоит| находится)? в (\\d+(?:-м|м)?|${Object.keys(ordinals).join('|')}) доме`, 'giu'))) {
      if (houseNumber(claim[1]) !== p.house) return true;
    }
  }
  for (const claim of answer.matchAll(/управитель (?:7[-\s]*(?:го|ого)?|седьмого) дома(?:[^.!?]{0,45}?) в (\d+(?:-м|м)?|первом|втором|третьем|четв[её]ртом|пятом|шестом|седьмом|восьмом|девятом|десятом|одиннадцатом|двенадцатом) доме/giu)) {
    if (!r.seventhHouse || houseNumber(claim[1]) !== r.seventhHouse.rulers[0].house) return true;
  }
  return false;
}
