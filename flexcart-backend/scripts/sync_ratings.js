const { pool } = require('../config/db');

(async () => {
  try {
    // 1) Sync product rating aggregates from product_reviews
    await pool.query(`
      UPDATE products p
      SET
        p.rating = COALESCE((
          SELECT AVG(pr.rating)
          FROM product_reviews pr
          WHERE pr.product_id = p.id
        ), 0),
        p.total_ratings = COALESCE((
          SELECT COUNT(*)
          FROM product_reviews pr
          WHERE pr.product_id = p.id
        ), 0)
      WHERE p.status = 'active'
    `);

    // 2) Sync company rating aggregates from company_ratings (company reviews)
    await pool.query(`
      UPDATE companies c
      SET
        c.rating = COALESCE((
          SELECT AVG(cr.rating)
          FROM company_ratings cr
          WHERE cr.company_id = c.id
        ), 0),
        c.total_ratings = COALESCE((
          SELECT COUNT(*)
          FROM company_ratings cr
          WHERE cr.company_id = c.id
        ), 0)
      WHERE c.status = 'active'
    `);

    const [companies] = await pool.query(
      'SELECT id, company_name, rating, total_ratings, total_sales, follower_count FROM companies WHERE status = ?',
      ['active']
    );
    console.log('Synced product & company ratings. Company ratings are based on company_ratings.');
    console.table(companies);
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
