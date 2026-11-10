import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financialDecisionReply} from '../server/financial-safety.js';
import {createLocalChat} from '../server/local-chat.js';
test('financial product decisions do not use natal positions or a generic off-topic refusal',async()=>{
 for(const message of ['Можно по карте выбрать кредит для вложения денег?','Подбери ипотеку по гороскопу.','Какой кредит лучше взять по натальной карте?','Я не собираюсь брать кредит, но хочу выбрать инвестиции по натальной карте.','Я не хочу выбирать кредит. Какие инвестиции мне подходят по натальной карте?']){
  const reply=financialDecisionReply(message);assert.ok(reply,message);
  assert.match(reply.answer,/реальные условия и оценка рисков/u);assert.equal(reply.model,null);
 }
 const chat=createLocalChat({model:'fixture',fetchImpl:()=>{throw Error('must not generate a product recommendation');}});
 const result=await chat.answer({message:'Можно по карте выбрать кредит для вложения денег?',history:[],forecast:{},chart:{money:{},calculated:{houseRulers:[{house:2,rulers:[{planet:'moon',house:9},{planet:'sun',house:11}]}]}}});
 assert.equal(result.financialSafety,true);assert.equal(result.learningSuggested,false);
 assert.doesNotMatch(result.answer,/С этой темой не помогу|управител/u);
});
test('financial feelings, definitions and ordinary earning questions still reach their ordinary path',()=>{
 for(const question of ['Как мне зарабатывать по карте?','По натальной карте объясни, почему я боюсь брать кредит.','Я не хочу брать кредит. Объясни по карте, почему мне тревожно из-за денег.','Что означает кредит в астрологическом учебном примере?','Объясни фразу «выбрать кредит по карте».','Как выбрать кредитную карту банка?'])assert.equal(financialDecisionReply(question),null,question);
});
