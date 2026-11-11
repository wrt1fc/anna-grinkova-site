import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculum26} from '../training/curriculum-v26.mjs';
import {deriveReviewControls} from '../training/review-controls-v26.mjs';
import {learningAnswerProblems} from '../training/learning-quality.mjs';

test('grading accepts accurate concise answers without unasked exposition and still rejects false answers',()=>{
 const controls=new Map(curriculum26().eval.map(card=>[card.id.split('v26-eval-')[1],card]));
 const good={
  sun:'Привет! Солнечный знак не заменяет асцендент. Без времени и места рождения его нельзя точно определить.',
  modality:'Привет! Дева — мутабельная, Водолей — фиксированная. Это модальности знаков зодиака.',
  arc:'Привет! Солнечная дуга равна 27 градусам. Это разность по кругу. Одну и ту же дугу применяют к выбранным натальным точкам.',
  ruler:'Привет! Управителя выбирают по знаку куспида. Здесь Меркурий. Планета внутри дома не становится его хозяином.',
  relocation:'Привет! Сохраняют момент рождения и меняют место расчёта. Аспекты сохраняются, дома меняются. Даты получения ключей не заменяют момент рождения.',
  formula:'Привет! Для сильной формулы нужны три повтора. У 5#9 два повтора и у 5#11 два, поэтому ни одна из них не становится сильной.',
 };
 for(const [key,answer]of Object.entries(good))assert.deepEqual(learningAnswerProblems(answer,controls.get(key)),[],key);
 assert.deepEqual(learningAnswerProblems('Солнечная дуга равна 27 градусам. Это разность по кругу. Одинаковую дугу используют для определения положений выбранных натальных точек.',controls.get('arc')),[]);
 assert.ok(learningAnswerProblems('Солнечная дуга равна 27 градусам. Это разность по кругу. Эту дугу не используют для выбранных натальных точек.',controls.get('arc')).length);
 assert.ok(learningAnswerProblems('Управителя дома выбирают по знаку: Меркурий. Планета внутри дома становится его хозяином.',controls.get('ruler')).length);
 for(const answer of ['Солнечный знак не позволяет определить асцендент. Для этого нужны время и место рождения.','По солнечному знаку невозможно определить асцендент без времени рождения.'])assert.deepEqual(learningAnswerProblems(answer,controls.get('sun')),[],answer);
 for(const [key,answer]of Object.entries({
  sun:'По солнечному знаку можно определить асцендент без времени рождения.',
  modality:'Дева — фиксированный знак, Водолей — мутабельный.',
  arc:'Солнечная дуга равна 28 градусам. Разность прибавляют к натальным точкам.',
  relocation:good.relocation.replace('дома меняются','дома не меняются'),
  formula:good.formula+' Разные формулы складывают, поэтому сильная формула есть.',
 }))assert.ok(learningAnswerProblems(answer,controls.get(key)).length,key);
 for(const answer of ['Солнечный знак не заменяет время рождения: по нему можно точно определить асцендент.','Солнечный знак нельзя игнорировать: он позволяет определить асцендент без времени рождения.'])assert.ok(learningAnswerProblems(answer,controls.get('sun')).length,answer);
 assert.ok(learningAnswerProblems('У 5#9 два повтора, у 5#11 тоже два. Для сильной формулы нужны три повтора. Ни одна не сильная сама по себе, но разные формулы суммируют и получают сильную формулу.',controls.get('formula')).length);
});
test('control derivation preserves every question, reference answer, label and money control',()=>{
 const theory=curriculum26().eval.map(card=>({...card,rubricVersion:2,requiredMeanings:[['old requirement']]}));
 const money=Array.from({length:12},(_,i)=>({id:'money-'+i,question:'money-'+i,answer:'old answer',learning:false,split:'eval',chartFor:{birthUtc:'2000-01-01'},requiredMeanings:[['unchanged']]}));
 const original=[...theory,...money],before=structuredClone(original),next=deriveReviewControls(original);
 assert.deepEqual(original,before);assert.deepEqual(next.slice(12),money);
 for(let i=0;i<12;i++)for(const key of ['id','question','answer','learning','split','chartFor'])assert.deepEqual(next[i][key],original[i][key]);
 assert.throws(()=>deriveReviewControls(original.slice(1)),/complete/u);
 assert.throws(()=>deriveReviewControls(original.map((card,i)=>i?card:{...card,question:'changed'})),/identity changed/u);
});
