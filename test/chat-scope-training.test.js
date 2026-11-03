import {test} from 'node:test';
import assert from 'node:assert/strict';
import scope from '../config/chat-scope.json' with {type:'json'};
import {firstPassSystem} from '../server/local-chat.js';
import {learningAnswerProblems} from '../training/learning-quality.mjs';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

test('offtopic examples teach the redirect, not an encyclopedic answer or course invitation',()=>{
 assert.deepEqual(learningAnswerProblems('Привет! '+scope.reply,{scope:'offtopic'}),[]);
 assert.ok(learningAnswerProblems('Привет! Функции в JavaScript объявляют через function.',{scope:'offtopic'}).some(p=>p.startsWith('scope:')));
 assert.ok(learningAnswerProblems(scope.reply+' Вот пример кода: const x = 1;', {scope:'offtopic'}).some(p=>p.startsWith('scope:')));
});

test('astrology, service and crisis examples must not be replaced by a generic scope refusal',()=>{
 for(const kind of ['astrology','mixed','service','safety'])assert.ok(learningAnswerProblems(scope.reply,{scope:kind}).some(p=>p.startsWith('scope:')));
 for(const [kind,answer]of [['astrology','Управитель Стрельца — Юпитер.'],['service','Я Фортуна, цифровой помощник.'],['safety','Если сейчас тяжело, попроси поддержки у близкого человека и специалиста.']])assert.deepEqual(learningAnswerProblems(answer,{scope:kind}),[]);
});

test('scope policy is in the shared candidate system; production and the card mode keep their system',()=>{
 const args={message:'Напиши программу',history:[]};
 assert.ok(firstPassSystem({...args,learningSignals:true}).includes(scope.reply));
 assert.ok(!firstPassSystem({...args,learningSignals:false}).includes(scope.reply));
 assert.ok(!firstPassSystem({...args,mode:'tarot',learningSignals:true}).includes(scope.reply));
});

test('dataset builder rejects an old off-topic explanation instead of teaching it alongside the refusal',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'scope-builder-'));
 try{
  const input=join(root,'cards.jsonl'),out=join(root,'output');
  writeFileSync(input,JSON.stringify({id:'unrelated',status:'draft',split:'train',family:'coding',scope:'offtopic',learning:false,question:'Как написать программу?',answer:'Привет! Начни с переменной и функции, затем добавь обработчик событий.'})+'\n');
  assert.throws(()=>execFileSync(process.execPath,[resolve('training/build-learning-set.mjs'),input,out],{stdio:'pipe'}));
  assert.equal(existsSync(join(out,'train.jsonl')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
