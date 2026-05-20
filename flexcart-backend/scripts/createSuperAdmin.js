/**
 * FlexCart Super Admin Setup Script
 * Run once: node scripts/createSuperAdmin.js
 *
 * Creates the Super Admin account if it doesn't exist yet.
 */

const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool, testConnection } = require('../config/db');

const SUPER_ADMIN = {
  username:  'SuperAdmin',
  email:     'superadmin@flexcart.com',
  password:  'SuperAdmin@2024',   // ← Change this after first login
};

async function main() {
  await testConnection();

  const [existing] = await pool.query(
    "SELECT id FROM users WHERE role = 'super_admin' OR email = ? LIMIT 1",
    [SUPER_ADMIN.email]
  );

  if (existing.length > 0) {
    console.log('⚠️  Super Admin already exists. No changes made.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(SUPER_ADMIN.password, 12);

  const [result] = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, is_verified, is_approved, status)
     VALUES (?, ?, ?, 'super_admin', 1, 1, 'active')`,
    [SUPER_ADMIN.username, SUPER_ADMIN.email, hash]
  );

  console.log('\n✅ Super Admin created successfully!');
  console.log('─────────────────────────────────────');
  console.log(`  Email    : ${SUPER_ADMIN.email}`);
  console.log(`  Password : ${SUPER_ADMIN.password}`);
  console.log(`  User ID  : ${result.insertId}`);
  console.log('─────────────────────────────────────');
  console.log('  Login at : http://localhost:3000/admin/login');
  console.log('  ⚠️  Change password after first login!\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
