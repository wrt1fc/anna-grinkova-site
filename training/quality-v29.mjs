// Disclosed error checks; a pass is not a factual or stylistic accuracy score.
export function quality29(answer,card){
 const errors=[];
 if(answer.length<(card.minAnswerChars??30)||answer.length>(card.maxAnswerChars??900))errors.push('requested answer size');
 if(/(?:тринадцат\p{L}*|13[- ]?\p{L}*)\s+групп/iu.test(answer))errors.push('invented zodiac group');
 if(/29[^.!?\n]{0,70}(?<!не )начал\p{L}*\s+знак/iu.test(answer))errors.push('29 degrees called start of sign');
 if(!card.visitorGender&&/(?<!\p{L})(?:дорогая|дорогой|милая|милый)(?!\p{L})|(?<!\p{L})ты\s+(?:сама|сам|решительная|необычная|романтичная|нежная)(?!\p{L})/iu.test(answer))errors.push('unsupported gender wording');
 const explicit=/Институт|(?:курс|обучени)[^.!?]{0,40}Анн|Анн[^.!?]{0,40}(?:курс|обучени)/iu.test(card.question);
 if(!explicit&&answer.split(/[.!?\n]/u).some(sentence=>/Институт\p{L}*\s+прогрессивн|Анн\p{L}*\s+Гриньков/iu.test(sentence)&&/обучени|курс|углубл/iu.test(sentence)&&!/не\s+(?:нуж|надо|обязател|предлага|совету|рекоменд|требуется|является\s+(?:условием|обязательн|необходим))/iu.test(sentence)))errors.push('unsolicited named course');
 if(['growth','skills'].includes(card.topic)&&!/(?:выбер|выбрать|проверь|проверить|попрос|запиш|попроб|разбей|разбить|потренир|соглас|обратн\p{L}*\s+связ|объяснить|спланир|переговор|презентац)/iu.test(answer))errors.push('no actionable career help');
 return errors;
}
