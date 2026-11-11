// Small arithmetic ground truth for explicitly stated educational angle exercises.
// No natal positions or unmentioned default orb are inferred.
const aspectAngles=[[/соединени\p{L}*/giu,0],[/секстил\p{L}*/giu,60],[/квадрат\p{L}*/giu,90],[/трин\p{L}*/giu,120],[/оппозиц\p{L}*/giu,180]];
export function orbExample(question) {
  const read = pattern => {const text=pattern.exec(question)?.[1];return text===undefined?null:Number(text.replace(',','.'));};
  const exactMatch=/точн\p{L}*(?:\s+(?:угол|трин|секстиль|квадрат|оппозици\p{L}*|соединени\p{L}*))?\s*(?:равен\s*|[:=]\s*)?(\d+(?:[.,]\d+)?)/iu.exec(question);
  const namedAngles=aspectAngles.filter(([pattern])=>{pattern.lastIndex=0;return pattern.test(question);}).map(([,angle])=>angle);
  const exact=exactMatch?Number(exactMatch[1].replace(',','.')):namedAngles.length===1?namedAngles[0]:null;
  const actualMatch=[...question.matchAll(/(?:фактическ\p{L}*\s+)?угол\s*(?:равен\s*|[:=]\s*)?(\d+(?:[.,]\d+)?)/giu)]
    .find(match=>!exactMatch||match.index<exactMatch.index||match.index>=exactMatch.index+exactMatch[0].length);
  const actual=actualMatch?Number(actualMatch[1].replace(',','.')):null;
  const limit=read(/(?:предел|допуск|орбис)(?:\s+(?:соединени\p{L}*|секстил\p{L}*|квадрат\p{L}*|трин\p{L}*|оппозиц\p{L}*))?\s*(?:равен\s*|[:=]\s*)?(\d+(?:[.,]\d+)?)/iu);
  if([actual,exact,limit].some(value=>value===null||!Number.isFinite(value))||actual>360||exact>180||limit>180)return null;
  const deviation=Number(Math.abs(actual-exact).toFixed(6));
  return {actual,exact,limit,deviation,within:deviation<=limit};
}

export function orbCorrection(example){
  return `Отклонение от точного угла составляет ${example.deviation}°: разность ${example.actual}° и ${example.exact}° по модулю. Допуск — ${example.limit}°. Поэтому аспект ${example.within?'входит':'не входит'} в этот допуск; равенство пределу допускается.`;
}

export function incorrectOrbClaim(answer,example){
  if(!example)return false;
  let text=answer.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,' ')
    .split(/(?<=[.!?;])\s+|\n+/u)
    .filter(sentence=>!/^\s*(?:(?:Неверно|Неправильно|Ошибочно),?\s+что|Если\s+бы)/iu.test(sentence))
    .join(' ');
  // A worked illustration can have its own geometry. Bind it only when both
  // that geometry and an explicit return to the visitor's exercise are present.
  // Earlier target claims remain checked; merely saying «например» skips nothing.
  const sentences=text.split(/(?<=[.!?;])\s+/u);
  for(let start=0;start<sentences.length;start++){
    if(!/^(?:Например,?\s*)?Для\s+(?:соединени\p{L}*|секстил\p{L}*|квадрат\p{L}*|трин\p{L}*|оппозиц\p{L}*)(?!\p{L})/iu.test(sentences[start]))continue;
    const end=sentences.findIndex((sentence,index)=>index>start&&/^(?:Здесь(?!\p{L})|В\s+(?:нашем|вашем|тво[её]м|данном|этом|исходном)\s+(?:случае|примере|задании)(?!\p{L})|В\s+(?:твоей|вашей|нашей|данной|этой|исходной)\s+задаче(?!\p{L})|У\s+(?:тебя|вас)(?!\p{L})|Верн[её]мся(?!\p{L}))/iu.test(sentence));
    if(end<0)continue;
    const illustration=sentences.slice(start,end).join(' ');
    // A personal/target reference inside a mixed sentence is also a boundary
    // signal. Without a clean sentence boundary, retain the whole block rather
    // than risk discarding an assertion about the visitor's own exercise.
    if(/(?:тво[её]\p{L}*|ваш\p{L}*|наш\p{L}*|исходн\p{L}*)\s+(?:задач\p{L}*|задани\p{L}*|случа\p{L}*|пример\p{L}*)|у\s+(?:тебя|вас)(?!\p{L})/iu.test(illustration))continue;
    const own=orbExample(illustration.replace(/(?:при\s+)?расстояни[ие]\s*(?=\d)/giu,'фактический угол '));
    const named=aspectAngles.filter(([pattern])=>{pattern.lastIndex=0;return pattern.test(illustration);}).map(([,angle])=>angle);
    if(!own||named.length!==1||named[0]!==own.exact||own.exact===example.exact||own.actual===example.actual)continue;
    // Check the illustration against its own stated inputs rather than treating
    // its arithmetic as an assertion about the question's different angle.
    if(incorrectOrbClaim(illustration,own))return true;
    sentences.splice(start,end-start);
    start--;
  }
  text=sentences.join(' ');
  for(const claim of text.matchAll(/(?:отклонени\p{L}*|разниц\p{L}*)\s*(?:составля\p{L}*|равн\p{L}*|[—–:=])?\s*(\d+(?:[.,]\d+)?)\s*(?:градус\p{L}*|°)/giu)){
    if(Number(claim[1].replace(',','.'))!==example.deviation)return true;
  }
  // Only an explicit range for the actual angle is checked, never an arbitrary
  // pair of numbers or a range explicitly described as an error.
  for(const claim of text.matchAll(/(?:допуск|допустим\p{L}*\s+(?:угол|диапазон)|диапазон\s+угл\p{L}*)\s*(?:(?:составля\p{L}*|равен)\s*|[—–:=]\s*)?(?:от\s*)?(\d+(?:[.,]\d+)?)\s*(?:°|градус\p{L}*)?\s*(?:[—–-]|до)\s*(\d+(?:[.,]\d+)?)\s*(?:°|градус\p{L}*)/giu)){
    const prefix=text.slice(Math.max(0,claim.index-35),claim.index);
    if(/(?:не|неверн\p{L}*|ошибочн\p{L}*)\s*$/iu.test(prefix))continue;
    const lower=Number(claim[1].replace(',','.')),upper=Number(claim[2].replace(',','.'));
    const raw=lower===example.exact-example.limit&&upper===example.exact+example.limit;
    // A minimal separation angle is bounded by 0..180; boundary aspects can
    // legitimately describe that clipped interval instead of signed rotation.
    const clipped=lower===Math.max(0,example.exact-example.limit)&&upper===Math.min(180,example.exact+example.limit);
    if(!raw&&!clipped)return true;
  }
  const outside=/не\s+(?:входит|попадает|укладывается|считается|учитывается|включается)|выходит за (?:этот\s+)?предел|вне\s+допуска/iu.test(text);
  const positive=text.replace(/не\s+(?:входит|попадает|укладывается|считается|учитывается|включается)/giu,' ');
  const inside=/(?:аспект|угол|отклонение|он|оно)\s+(?:поэтому\s+)?(?:(?:входит|попадает|укладывается)\s+(?:в|во)\s+(?:этот\s+|выбранный\s+)?допуск|учитывается|включается)|(?:^|[.!;]\s*)Да\s*[,—–:]\s*(?:входит|попадает|укладывается)(?=\s|[.!;,]|$)/iu.test(positive);
  return example.within?outside:inside;
}
