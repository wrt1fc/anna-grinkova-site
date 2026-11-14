// Shared by grounding and publication: a relative's planet is personal data,
// while one's own Moon and the choice of a partner is an own-chart question.
const RELATIVE='(?<!\\p{L})(?:сестры|брата|матери|мамы|отца|папы|сына|дочери|реб[её]нка|подруги|друга|коллеги|мужа|жены|партн[её]ра)(?!\\p{L})';
const OBJECT='(?:планет\\p{L}*|Марс\\p{L}*|Венер\\p{L}*|Лун\\p{L}*|Солнц\\p{L}*|Меркур\\p{L}*|Юпитер\\p{L}*|Сатурн\\p{L}*|Уран\\p{L}*|Нептун\\p{L}*|Плутон\\p{L}*|асцендент\\p{L}*|карт\\p{L}*|гороскоп\\p{L}*)';
const TARGET=new RegExp(`${OBJECT}\\s+(?:рождения\\s+)?(?:(?:моей|моего|нашей|нашего)\\s+)?${RELATIVE}|у\\s+(?:(?:моей|моего|нашей|нашего)\\s+)?${RELATIVE}\\s+${OBJECT}`,'iu');
export const foreignChartReference=question=>TARGET.test(question);

// An explicit, bounded identity for the calculation, never a birth record.
export function chartSubject(subject=null){
 if(!subject||subject.kind==='visitor')return {kind:'visitor'};
 if(subject.kind==='unknown'||!['partner','child','parent','sibling','other'].includes(subject.relation))return {kind:'unknown'};
 return {kind:'selected',relation:subject.relation,...(typeof subject.label==='string'?{label:subject.label.slice(0,80)}:{}),...(['male','female'].includes(subject.gender)?{gender:subject.gender}:{})};
}
