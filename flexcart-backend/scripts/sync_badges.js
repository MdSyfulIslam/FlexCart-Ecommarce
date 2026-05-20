const { pool } = require('../config/db');

const BADGE_THRESHOLDS = [
  { min: 5000, badge: 'diamond' },
  { min: 3000, badge: 'crown' },
  { min: 1500, badge: 'gold' },
  { min: 500,  badge: 'silver' },
  { min: 0,    badge: 'bronze' },
];

(async () => {
  try {
    const [companies] = await pool.query(
      'SELECT id, company_name, total_sales, rating, follower_count FROM companies WHERE status = ?',
      ['active']
    );

    for (const c of companies) {
      const score = (c.total_sales * 10) + (parseFloat(c.rating) * 200) + (c.follower_count * 5);
      const { badge } = BADGE_THRESHOLDS.find(t => score >= t.min);
      await pool.query('UPDATE companies SET badge = ? WHERE id = ?', [badge, c.id]);
      console.log(`${c.company_name}: score=${score.toFixed(0)} → badge=${badge}`);
    }

    console.log('\nDone.');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
