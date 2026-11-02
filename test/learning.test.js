import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isLearningQuestion, learningInvitation} from '../server/learning.js';

test('educational explanations offer learning, personal readings and sensitive topics do not',()=>{
 for(const q of ['Что такое управитель?','А что значит куспид?','Объясни тригон простыми словами','Чем отличается асцендент от десцендента?','Как рассчитать управителя дома?','Как читать натальную карту?','Хочу изучать астропсихологию','Где учиться астрологии?'])assert.equal(isLearningQuestion(q),true,q);
 for(const q of ['Какой мужчина мне нужен?','Что значит мой асцендент?','Почему у меня такие отношения?','Что означает моя натальная карта?','Как проявляется управитель моего седьмого дома?','Расскажи про мою Венеру','Что означает моя карта дня?','Привет','Объясни, почему мы ссоримся','Хочу изучать программирование','Что такое паническая атака?','Астрология поможет при болезни?','Как понять долги по натальной карте?'])assert.equal(isLearningQuestion(q),false,q);
 assert.equal(isLearningQuestion('А как это рассчитать?',[{role:'assistant',content:'Управитель дома определяется по знаку на куспиде.'}]),true);
 assert.equal(isLearningQuestion('А как это рассчитать?',[{role:'assistant',content:'Твои расходы можно записать в таблицу.'}]),false);
 assert.equal(learningInvitation('Что такое управитель?').url,undefined);
 assert.equal(learningInvitation('Мой прогноз на сегодня'),null);
});
