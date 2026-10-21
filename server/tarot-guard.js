// A card reading must be about the card the person was shown. A small local model sometimes writes about another card,
// so every answer is checked, asked for once more, and replaced by a calculated reading of the drawn card if it fails.
import { CARD_NAMES } from './daily-forecast.js';

const fold = (text) => text.toLowerCase().replaceAll('ё', 'е');
// The stem tolerates case endings: «Повешенный» may come back as «Повешенного».
const stemOf = (name) => fold(name).slice(0, Math.max(3, fold(name).length - 2));
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// Why the answer does not fit the drawn card, or null when it does: the card is named and no other card of the deck is
// quoted in guillemets (ordinary words that are also card names, like "сила", are fine without quotes).
export function wrongCard(answer, card) {
  if (!fold(answer).includes(stemOf(card.name))) return 'drawn card not named';
  const drawn = fold(card.name);
  for (const match of answer.matchAll(/«([^»]{2,30})»/g)) {
    const quoted = fold(match[1]).trim();
    if (quoted !== drawn && CARD_NAMES.some((name) => fold(name) === quoted)) return `another card: ${match[1]}`;
  }
  return null;
}

// Made only of the card's own text, with the same careful wording as a model reading.
export function fallbackReading(card) {
  return [
    `Карта «${card.name}» в связи с вашим вопросом напоминает: ${card.focus}. Скорее всего, стоит посмотреть на вопрос именно под этим углом.`,
    `Возможная линия — ${lowerFirst(card.action)}`,
    `Вопрос к себе: ${card.question}`,
  ].join('\n\n');
}
