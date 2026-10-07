import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

// Retrieval over Anna's approved materials: approved Q&A cards and Markdown texts she allowed.
// Drafts and raw transcripts are never indexed; they may contain other people's stories.
const STOPWORDS = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это мои мне моё')
  .split(' '));
const SUFFIXES = /(иями|ями|ами|иях|ях|ах|ого|его|ому|ему|ыми|ими|ость|ости|ение|ения|ений|ться|тся|ешь|ете|ишь|ите|ует|уют|ают|яют|ала|ила|ыла|ась|ось|ая|яя|ое|ее|ые|ие|ый|ий|ой|ом|ем|ам|ям|ую|юю|ию|ия|ья|ов|ев|ей|ы|и|а|я|о|е|у|ю|ь)$/u;

export function tokenize(text) {
  return String(text).toLowerCase().replaceAll('ё', 'е').match(/\p{L}+/gu)?.filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map((word) => (word.length > 5 ? word.replace(SUFFIXES, '') : word)) ?? [];
}

function chunksFromMarkdown(text, source, maxChars = 700) {
  const chunks = [];
  let current = '';
  for (const paragraph of text.split(/\n\s*\n/).map((part) => part.replace(/^#+\s*/gm, '').trim()).filter(Boolean)) {
    if (current && current.length + paragraph.length > maxChars) { chunks.push({ text: current, source }); current = ''; }
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  if (current) chunks.push({ text: current, source });
  return chunks;
}

function chunksFromCards(text, source) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('//')).flatMap((line) => {
    try {
      const card = JSON.parse(line);
      return card.status === 'approved' && typeof card.answer === 'string'
        ? [{ text: `${card.question}\n${card.answer}`, source: `${source}#${card.id}` }] : [];
    } catch { return []; }
  });
}

export function createKnowledge(documents, { k1 = 1.4, b = 0.75 } = {}) {
  const docs = documents.map((doc) => ({ ...doc, terms: tokenize(doc.text) })).filter((doc) => doc.terms.length);
  const avgLength = docs.reduce((sum, doc) => sum + doc.terms.length, 0) / (docs.length || 1);
  const documentFrequency = new Map();
  for (const doc of docs) for (const term of new Set(doc.terms)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const idf = (term) => Math.log(1 + (docs.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));
  return {
    size: docs.length,
    // Returns the best matches above a floor, so an unrelated question gets no materials at all.
    search(query, { limit = 3, minScore = 1.5 } = {}) {
      const terms = [...new Set(tokenize(query))];
      if (!terms.length || !docs.length) return [];
      return docs.map((doc) => {
        const counts = new Map();
        for (const term of doc.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
        const score = terms.reduce((sum, term) => {
          const tf = counts.get(term) ?? 0;
          return sum + (tf ? idf(term) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc.terms.length / avgLength)) : 0);
        }, 0);
        return { doc, score };
      }).filter((hit) => hit.score >= minScore).sort((a, c) => c.score - a.score).slice(0, limit)
        .map(({ doc, score }) => ({ text: doc.text, source: doc.source, score: Number(score.toFixed(2)) }));
    },
  };
}

export function loadKnowledge(directory) {
  const documents = [];
  for (const name of readdirSync(directory)) {
    const text = readFileSync(join(directory, name), 'utf8');
    if (extname(name) === '.md') documents.push(...chunksFromMarkdown(text, name));
    if (extname(name) === '.jsonl') documents.push(...chunksFromCards(text, name));
  }
  return createKnowledge(documents);
}
