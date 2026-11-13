import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revision31Card,quality31} from '../training/quality-v31.mjs';
import {spawnSync} from 'node:child_process';
const card=topic=>revision31Card({question:topic==='steps'?'Теперь предложи три небольших действия для накоплений.':'Объясни простыми словами.',topic,minAnswerChars:15,requiredMeanings:[['unused-old-phrase']]});

test('v31 accepts equivalent limits and practical checks without arbitrary editorial words',()=>{
 for(const text of ['Нет, аспект не доказывает рост, вес или внешность партнёра. Такие характеристики нельзя вывести из карты.','Аспект не позволяет предсказать рост партнёра. Венеру обсуждают в связи с симпатией.','Рост партнёра нельзя определить по одному аспекту.'])assert.deepEqual(quality31(text,card('unsupported-metaphor'),null),[],text);
 assert.deepEqual(quality31('В материалах нет объяснения этого типа. Можно обсудить, что тебе сейчас нужно.',card('unsupported-source'),null),[]);
 assert.deepEqual(quality31('Проверь выбор работы на реальном опыте: небольшой проект, подработка или стажировка.',card('workfit'),null),[]);
 const original={topic:'income',requiredMeanings:[['расчёт']],question:'Назови управителей.'};
 revision31Card(original);assert.deepEqual(original.requiredMeanings,[['расчёт']]);
});

test('v31 does not confuse a phrase match with a correct factual or practical answer',()=>{
 assert.ok(quality31('Аспект показывает рост и вес твоего партнёра.',card('unsupported-metaphor'),null).length);
 assert.ok(quality31('Нельзя игнорировать аспект: он показывает рост партнёра.',card('unsupported-metaphor'),null).length);
 assert.ok(quality31('Этот тип означает, что ты создан для публичной работы.',card('unsupported-source'),null).length);
 assert.ok(quality31('Аспект не доказывает рост партнёра. Он доказывает его вес и внешность.',card('unsupported-metaphor'),null).includes('unsupported physical assertion'));
 assert.ok(quality31('В материалах нет объяснения этого типа. Твой тип означает, что ты создан для публичной работы.',card('unsupported-source'),null).includes('invented type meaning'));
 const bad='1. Запиши покупки.\n2. Отложи посильную сумму.\n3. Найди одну работу с гибким графиком.';
 assert.ok(quality31(bad,card('steps'),null).includes('wrong practical intent'));
 const good='1. Посчитай обязательные платежи.\n2. Выбери посильную сумму.\n3. Переводи её на отдельный счёт.';
 assert.deepEqual(quality31(good,card('steps'),null),[]);
 assert.deepEqual(quality31('Привет! '+good,card('steps'),null),[]);
 assert.deepEqual(quality31('Посчитай обязательные платежи, выбери посильную сумму и переводи её на отдельный счёт.',card('steps'),null),['requested numbered format']);
});

test('v31 raw and serving evaluators load before argument validation',()=>{
 for(const path of ['training/eval-raw-v31.mjs','training/eval-serving.mjs']){
  const r=spawnSync(process.execPath,[path],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Expected model/u);assert.doesNotMatch(r.stderr,/ERR_MODULE_NOT_FOUND/u);
 }
});
