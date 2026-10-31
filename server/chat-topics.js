// Shared by routing, grounding and answer checks; everyday wording matters as much as astrology terms.
export const isRelationshipQuestion = (message) => /отношени|любов|любви|партн[её]р|замуж|брак|мужчин|женщин|женить|женат|спутник[а-яё]* жизни|вторую половин/iu.test(message);
