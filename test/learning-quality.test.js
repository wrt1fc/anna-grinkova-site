import {test} from 'node:test';
import assert from 'node:assert/strict';
import {learningAnswerProblems} from '../training/learning-quality.mjs';

test('a fluent but wrong definition is not counted as a correct educational answer',()=>{
 const c={requiredMeanings:[['кардинальн'],['фиксированн'],['мутабельн']],forbiddenClaims:['четыре модальности']};
 assert.equal(learningAnswerProblems('Есть кардинальные, фиксированные и мутабельные знаки.',c).length,0);
 assert.ok(learningAnswerProblems('Есть четыре модальности: огонь, земля, воздух, вода.',c).length>0);
 assert.ok(learningAnswerProblems('Если нужны факты, беру их из facts, а прогноз из forecast.',{}).length>0);
});
