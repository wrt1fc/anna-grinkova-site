const TOTAL = 3;

export function createWelcomeStore(q) {
  return {
    async welcomeBonus(userId) {
      const row = await q.one('SELECT welcome_questions_used FROM users WHERE id=$1', [userId]);
      return { code: 'FORTUNA3', applied: !!row, totalQuestions: TOTAL,
        remainingQuestions: row ? Math.max(0, TOTAL - row.welcome_questions_used) : 0, natalChartIncluded: !!row };
    },
    async consumeWelcomeQuestion(userId) {
      return (await q.run(`UPDATE users SET welcome_questions_used=welcome_questions_used+1
        WHERE id=$1 AND email_verified_at IS NOT NULL AND welcome_questions_used<$2`, [userId, TOTAL])) === 1;
    },
    async refundWelcomeQuestion(userId) {
      await q.run('UPDATE users SET welcome_questions_used=welcome_questions_used-1 WHERE id=$1 AND welcome_questions_used>0', [userId]);
    },
    async promoQuestion(userId) {
      const row = await q.one('SELECT fortuna_question_used FROM users WHERE id=$1', [userId]);
      return { redeemed: row?.fortuna_question_used != null, remainingQuestions: row?.fortuna_question_used === false ? 1 : 0 };
    },
    async redeemPromoQuestion(userId) {
      return (await q.run(`UPDATE users SET fortuna_question_used=FALSE
        WHERE id=$1 AND email_verified_at IS NOT NULL AND fortuna_question_used IS NULL`, [userId])) === 1;
    },
    async consumePromoQuestion(userId) {
      return (await q.run(`UPDATE users SET fortuna_question_used=TRUE
        WHERE id=$1 AND email_verified_at IS NOT NULL AND fortuna_question_used=FALSE`, [userId])) === 1;
    },
    async refundPromoQuestion(userId) {
      await q.run('UPDATE users SET fortuna_question_used=FALSE WHERE id=$1 AND fortuna_question_used=TRUE', [userId]);
    },
  };
}
