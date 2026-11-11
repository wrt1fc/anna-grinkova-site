import {test} from 'node:test';
import assert from 'node:assert/strict';
import {asksAboutMoney} from '../server/anna-method.js';
import {chatIntent,isClearlyOffTopic,requestedStepCount} from '../server/chat-intent.js';

test('malfunctions do not become money or work questions through substring matches',()=>{
 for(const message of ['Почему не работает отопление?', 'Почему не работает сканер?', 'Телевизор не включается', 'Сломался лифт', 'Как починить неизвестный прибор?', 'Работа двигателя автомобиля']){
  assert.equal(isClearlyOffTopic(message),true,message);
  assert.equal(asksAboutMoney(message),false,message);
 }
 for(const message of ['Почему не работает?', 'Почему я не работаю?', 'Не могу найти работу', 'Почему не работает мой план развития?', 'Как работает вход в Фортуну?', 'Почему не работает личный кабинет?', 'Кем мне работать с Python?', 'Хочу работать в интернете', 'Нетворкинг для карьеры и проблема с отоплением']) assert.equal(isClearlyOffTopic(message),false,message);
 assert.equal(isClearlyOffTopic('Почему не работает входной клапан?'),true);
});

test('practical intents have separate meanings, while income and work context remain eligible',()=>{
 const cases=[['Какую профессию выбрать?','workfit'],['Как расти в профессии?','growth'],['Какие навыки мне развивать?','growth'],['Как получить повышение?','promotion'],['Как увеличить доход?','income'],['Как перестать тратить?','budget'],['Тревожусь о доходе','support'],['Устала, как восстановиться после работы?','rest'],['Как оплатить подписку?','service']];
 for(const [message,intent] of cases) assert.equal(chatIntent(message),intent,message);
 for(const message of ['Какую профессию выбрать?', 'Как расти в профессии?', 'Как получить повышение?', 'Как увеличить доход?', 'Как копить?']) assert.equal(asksAboutMoney(message),true,message);
 assert.equal(requestedStepCount('Дай три конкретных шага'),3);
 assert.equal(requestedStepCount('Назови 2 практических действия'),2);
 assert.equal(requestedStepCount('Что означает 2 дом?'),null);
});

test('explicit emotional support stays allowed despite incidental unrelated nouns',()=>{
 for(const message of ['Мне страшно принимать препарат по рецепту врача, поддержи меня.', 'Меня тревожит рецепт врача. Можно поговорить?', 'Мне одиноко после переезда, интернет не работает, поддержи.']) assert.equal(isClearlyOffTopic(message),false,message);
 for(const message of ['Напиши рецепт супа', 'Объясни как починить интернет, поддержи соединение']) assert.equal(isClearlyOffTopic(message),true,message);
});

test('translation of personal chart into plain language remains astrology, foreign translation does not',()=>{
 assert.equal(isClearlyOffTopic('Хочу понять денежные возможности: переведи данные моей карты на простой язык.'),false);
 assert.equal(isClearlyOffTopic('Переведи данные на немецкий язык'),true);
});
