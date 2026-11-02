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
  };
}
