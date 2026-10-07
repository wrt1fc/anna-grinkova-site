import crisis from '../config/crisis.json' with { type: 'json' };

// Messages about suicide or self-harm never reach the model: the visitor gets a fixed reply with real help lines.
const CRISIS_PATTERNS = [
  /не\s+хочу\s+(больше\s+)?жить/iu,
  /хочу\s+умереть/iu,
  /(покончить|кончать)\s+с\s+собой/iu,
  /(суицид|самоубийств)/iu,
  /(убить|убью)\s+себя/iu,
  /наложить\s+на\s+себя\s+руки/iu,
  /(резать|порезать|вскрыть)\s+(себе\s+)?(вены|руки)/iu,
  /(нет|не\s+вижу)\s+смысла\s+жить/iu,
  /лучше\s+бы\s+меня\s+не\s+было/iu,
  /(выпить|наглотаться)\s+таблет\p{L}*,?\s+чтобы/iu,
];

export const CRISIS_ANSWER = crisis.answer;
export function isCrisisMessage(message) { return CRISIS_PATTERNS.some((pattern) => pattern.test(message)); }
