import {test} from 'node:test';
import assert from 'node:assert/strict';
import {firstPassSystem,chatPrompt} from '../server/local-chat.js';

test('v29 experimental prompt removes conflicting advice rules and unsolicited course facts only on opt-in',()=>{
 const old={...process.env};
 try{
  process.env.ANNA_REFERENCE_KNOWLEDGE='19';delete process.env.ANNA_METHODICS_FILE;
  const message='Как перейти к более сложным задачам?';
  process.env.ANNA_TRAINING_PROMPT_VERSION='18';
  const system18=firstPassSystem({message,learningSignals:true});
  const facts18=JSON.parse(chatPrompt({message,history:[],forecast:null})).facts;
  assert.ok(facts18.some(f=>f.startsWith('Углублённое изучение')));
  process.env.ANNA_TRAINING_PROMPT_VERSION='29';
  const system29=firstPassSystem({message,learningSignals:true});
  assert.doesNotMatch(system29,/без нравоучений, упражнений и вопросов к себе/u);
  assert.match(system29,/практические действия в любом размере/u);
  const prompt=JSON.parse(chatPrompt({message,history:[],forecast:null}));
  assert.equal(prompt.facts.length,facts18.length-1);
  const direct=JSON.parse(chatPrompt({message:'Что известно об обучении у Анны?',history:[],forecast:null}));
  assert.deepEqual(direct.facts,facts18);
  process.env.ANNA_TRAINING_PROMPT_VERSION='18';
  assert.equal(firstPassSystem({message,learningSignals:true}),system18);
 }finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});
