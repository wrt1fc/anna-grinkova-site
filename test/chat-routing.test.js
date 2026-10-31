import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartContext } from '../server/chat-grounding.js';
import { groundingQuestion } from '../server/chat-topics.js';

const positive = [
  'Что означает мой Сатурн?', 'Расскажи о моей Венере', 'Как проявляется моя Луна?', 'В чём мои сильные стороны?',
  'Какие у меня таланты?', 'Какой у меня характер?', 'Что мне мешает реализоваться?', 'Чем мне лучше заниматься?',
  'Почему я всё откладываю?', 'Как мне повысить самооценку?', 'Как мне отстоять личные границы?', 'Почему я тревожусь?',
  'Почему я ревную?', 'Почему мне сложно доверять?', 'Когда я встречу любовь?', 'Почему мы ссоримся?',
  'Как мне пережить расставание?', 'Почему я боюсь близости?', 'Какой мужчина мне нужен?', 'Какая женщина мне подходит?',
  'Какой партнёр мне подходит?', 'Как найти своего партнёра?', 'Что происходит в моей личной жизни?',
  'Почему я влюбляюсь в недоступных людей?', 'А что с работой?', 'Какая работа мне подходит?', 'В чём моё призвание?',
  'Почему мне трудно копить?', 'Как мне увеличить доход?', 'В чём мой денежный потенциал?', 'Какая у меня натальная карта?',
  'Что значит мой асцендент?', 'Какие у меня дирекции в этом году?', 'Что означает мой седьмой дом?',
];
const negative = ['Привет!', 'Спасибо!', 'Сколько стоит подписка?', 'Как сменить пароль?', 'Как установить приложение?',
  'Что означает моя карта дня?', 'Какой прогноз на сегодня?', 'А какой прогноз на неделю?', 'Сколько будет два плюс два?',
  'Почему люди ссорятся в отношениях?', 'Почему мужчины молчат?', 'Что такое Венера?', 'Как утеплить мой дом?'];

test('everyday natal, relationship, career and money questions keep their calculated context', () => {
  for (const question of positive) assert.ok(chartContext(null,question).chart,question);
  for (const question of negative) assert.equal(chartContext(null,question).chart,null,question);
});

test('dependent follow-ups inherit the last user topic; complete questions reset it', () => {
  const history=[{role:'user',content:'Что означает мой Сатурн?'},{role:'assistant',content:'Сатурн...'}];
  for(const text of ['А подробнее?','Почему так?','Что это значит?','И что с этим делать?','Можно пример?','Объясни проще']){
    assert.ok(chartContext(null,text,new Date(),{history}).chart,text);
    assert.match(groundingQuestion(text,history),/мой Сатурн/);
  }
  assert.equal(chartContext(null,'Сколько стоит подписка?',new Date(),{history}).chart,null);
  assert.equal(chartContext(null,'Какой прогноз на сегодня?',new Date(),{history}).chart,null);
  assert.equal(chartContext(null,'А подробнее?',new Date(),{history:[{role:'user',content:'Что означает моя карта дня?'}]}).chart,null);
});

test('a jealousy question is not turned into another ideal-partner overview',()=>{
  const profile={birthUtc:'1990-05-15T09:30:00Z',birthTime:'12:30',birthLatitude:55.75,birthLongitude:37.62};
  assert.equal(chartContext(profile,'Почему я ревную?').chart.relationship.requireOverview,false);
  assert.equal(chartContext(profile,'Какой мужчина мне нужен?').chart.relationship.requireOverview,true);
});
