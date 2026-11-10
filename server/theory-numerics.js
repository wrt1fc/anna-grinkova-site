// Small arithmetic ground truth for explicitly stated educational angle exercises.
// No natal positions or unmentioned default orb are inferred.
export function orbExample(question) {
  const read = pattern => {const text=pattern.exec(question)?.[1];return text===undefined?null:Number(text.replace(',','.'));};
  const exactMatch=/точн\p{L}*(?:\s+(?:угол|трин|секстиль|квадрат|оппозици\p{L}*|соединени\p{L}*))?\s*(?:равен\s*|[:=]\s*)?(\d+(?:[.,]\d+)?)/iu.exec(question);
  const exact=exactMatch?Number(exactMatch[1].replace(',','.')):null;
  const actualMatch=[...question.matchAll(/(?:фактическ\p{L}*\s+)?угол\s*(?:равен\s*|[:=]\s*)?(\d+(?:[.,]\d+)?)/giu)]
    .find(match=>!exactMatch||match.index<exactMatch.index||match.index>=exactMatch.index+exactMatch[0].length);
  const actual=actualMatch?Number(actualMatch[1].replace(',','.')):null;
  const limit=read(/(?:предел|допуск|орбис)\s*(?:равен\s*|[:=]\s*)?(\d+(?:[.,]\d+)?)/iu);
  if([actual,exact,limit].some(value=>value===null||!Number.isFinite(value))||actual>360||exact>180||limit>180)return null;
  const deviation=Number(Math.abs(actual-exact).toFixed(6));
  return {actual,exact,limit,deviation,within:deviation<=limit};
}

export function orbCorrection(example){
  return `Отклонение от точного угла составляет ${example.deviation}°: разность ${example.actual}° и ${example.exact}° по модулю. Допуск — ${example.limit}°. Поэтому аспект ${example.within?'входит':'не входит'} в этот допуск; равенство пределу допускается.`;
}

export function incorrectOrbClaim(answer,example){
  if(!example)return false;
  const text=answer.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,' ')
    .split(/(?<=[.!?;])\s+|\n+/u)
    .filter(sentence=>!/^\s*(?:(?:Неверно|Неправильно|Ошибочно),?\s+что|Если\s+бы)/iu.test(sentence))
    .join(' ');
  for(const claim of text.matchAll(/(?:отклонени\p{L}*|разниц\p{L}*)\s*(?:составля\p{L}*|равн\p{L}*|[—–:=])?\s*(\d+(?:[.,]\d+)?)\s*(?:градус\p{L}*|°)/giu)){
    if(Number(claim[1].replace(',','.'))!==example.deviation)return true;
  }
  const outside=/не\s+(?:входит|попадает|укладывается|считается|учитывается|включается)|выходит за предел|вне\s+допуска/iu.test(text);
  const positive=text.replace(/не\s+(?:входит|попадает|укладывается|считается|учитывается|включается)/giu,' ');
  const inside=/(?:аспект|угол|отклонение|он|оно)\s+(?:поэтому\s+)?(?:(?:входит|попадает|укладывается)\s+(?:в|во)\s+(?:этот\s+|выбранный\s+)?допуск|учитывается|включается)/iu.test(positive);
  return example.within?outside:inside;
}
