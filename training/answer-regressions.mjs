// Observable failures from reviewed replies; this is not a general semantic judge.
export function instructionEchoProblems(answer) {
 return /Это первый ответ в разговоре|Начни с [«"']?Привет|Не представляйся Анной или человеком|на прямой вопрос честно объясн|Сначала помоги по сути|Факты проекта бери|Не смешивай источники|данные дня из forecast/iu.test(answer)
  ? ['instruction echo'] : [];
}
export function identityProblems(answer) {
 const program=/цифров(?:ой|ым) помощник|программ|автоматическ.{0,25}ответ|не (?:живой )?человек/iu.test(answer);
 const claimsHuman=/(?<!\p{L})я\s+(?:Анна(?: Гринькова)?|(?:настоящий |живой )?человек)(?!\p{L})/iu.test(answer);
 return /Фортун/iu.test(answer)&&program&&!claimsHuman ? [] : ['identity: no honest direct introduction'];
}
