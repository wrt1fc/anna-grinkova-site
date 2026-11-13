import assert from 'node:assert/strict';
import {POINT_NAMES} from '../server/astro-chart.js';
import {SIGN_PREPOSITIONAL} from '../server/anna-method.js';

// A correct calculation outside the serialized input is still unavailable to the model.
export function assertTeacherChartInput(answer,prompt,id){
 const names=Object.values(POINT_NAMES).join('|');
 const forms=Object.values(SIGN_PREPOSITIONAL).join('|');
 const claims=answer.matchAll(new RegExp(`(${names})\\s+(?:стоит\\s+)?(?:в|во)\\s+(${forms})(?![а-яё])`,'giu'));
 for(const [,planet,form]of claims){
  assert.ok(prompt.chart,`Personal teacher claim without chart: ${id}`);
  if(Array.isArray(prompt.chart.positions))assert.ok(prompt.chart.positions.some(p=>p.planet.toLowerCase()===planet.toLowerCase()&&SIGN_PREPOSITIONAL[p.sign]?.toLowerCase()===form.toLowerCase()),`Teacher object absent from records: ${id}: ${planet}`);
 }
}
