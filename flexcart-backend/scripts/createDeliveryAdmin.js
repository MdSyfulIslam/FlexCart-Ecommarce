/**
 * Creates a delivery_admin test account.
 * Usage: node scripts/createDeliveryAdmin.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'flexcart_db',
  });

  const email    = 'deliveryadmin@flexcart.com';
  const password = 'DeliveryAdmin@2024';
  const hash     = await bcrypt.hash(password, 12);

  const [existing] = await pool.query('SELECT id, role FROM users WHERE email = ?', [email]);

  if (existing.length > 0) {
    // Update to ensure role is correct and account is active
    await pool.query(
      `UPDATE users SET role='delivery_admin', password_hash=?, status='active', is_approved=1 WHERE email=?`,
      [hash, email]
    );
    console.log(`✅ Updated existing user → email: ${email} | password: ${password} | role: delivery_admin`);
  } else {
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role, status, is_approved)
       VALUES ('Delivery Admin', ?, ?, 'delivery_admin', 'active', 1)`,
      [email, hash]
    );
    console.log(`✅ Created new user     → email: ${email} | password: ${password} | role: delivery_admin`);
  }

  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
