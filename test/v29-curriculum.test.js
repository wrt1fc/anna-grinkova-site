import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculum29} from '../training/curriculum-v29.mjs';
import {quality29} from '../training/quality-v29.mjs';

test('v29 separates training, validation and held-out birth profiles and retains exact topic targets',()=>{
 const rows=curriculum29();
 assert.equal(rows.filter(r=>r.split==='train').length,160);
 assert.equal(rows.filter(r=>r.split==='eval').length,24);
 assert.equal(rows.filter(r=>r.split==='holdout').length,48);
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 const births=split=>new Set(rows.filter(r=>r.split===split&&r.chartFor).map(r=>r.chartFor.birthUtc));
 for(const b of births('holdout'))assert.ok(!births('train').has(b)&&!births('eval').has(b));
 for(const row of rows)assert.deepEqual(quality29(row.answer,row),[],row.id);
});

test('v29 disclosed failures reject false groups, ad substitutions and irrelevant long zodiac replies',()=>{
 assert.ok(quality29('Солнце в Деве. Это знак земной тринадцатой группы.',{question:'Назови знак.',topic:'personal'}).length);
 assert.ok(quality29('Солнце в 29 градусах Козерога, это начало знака.',{question:'Назови знак.',topic:'personal'}).length);
 assert.ok(quality29('Для углубления можно изучить астропсихологию у Анны Гриньковой.',{question:'Что освоить на работе?',topic:'skills'}).length);
 assert.deepEqual(quality29('Выбери одну рабочую задачу и попроси коллегу оценить результат.',{question:'Как развиваться?',topic:'growth'}),[]);
 for(const answer of ['29 градусов — это не начало знака, а его конец.','Сам асцендент — начало первого дома. Личность нельзя установить по одному показателю.','Обучение в Институте прогрессивной психологии не требуется. Выбери рабочую задачу и попроси обратную связь.'])assert.deepEqual(quality29(answer,{question:'Поясни мысль.',topic:'theory'}),[]);
 assert.ok(quality29('Обучение у Анны Гриньковой не требуется. Для углубления пройди курс Анны Гриньковой.',{question:'Как расти?',topic:'growth'}).includes('unsolicited named course'));
});
