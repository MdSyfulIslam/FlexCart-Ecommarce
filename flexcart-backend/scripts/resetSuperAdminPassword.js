/**
 * Reset Super Admin password
 * Run: node scripts/resetSuperAdminPassword.js
 */

const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool, testConnection } = require('../config/db');

const NEW_PASSWORD = 'SuperAdmin@2024';

async function main() {
  await testConnection();

  // Check if super admin exists
  const [rows] = await pool.query(
    "SELECT id, username, email, status, is_approved FROM users WHERE role = 'super_admin' LIMIT 1"
  );

  if (rows.length === 0) {
    console.log('\n❌ No Super Admin account found in the database.');
    console.log('   Run: node scripts/createSuperAdmin.js\n');
    process.exit(1);
  }

  const admin = rows[0];
  console.log('\nFound Super Admin:');
  console.log(`  ID         : ${admin.id}`);
  console.log(`  Username   : ${admin.username}`);
  console.log(`  Email      : ${admin.email}`);
  console.log(`  Status     : ${admin.status}`);
  console.log(`  is_approved: ${admin.is_approved}`);

  // Generate fresh hash
  const hash = await bcrypt.hash(NEW_PASSWORD, 12);

  // Update password + ensure active + approved
  await pool.query(
    `UPDATE users SET password_hash = ?, status = 'active', is_approved = 1
     WHERE id = ?`,
    [hash, admin.id]
  );

  console.log('\n✅ Password reset and account verified!');
  console.log('──────────────────────────────────────────');
  console.log(`  Email    : ${admin.email}`);
  console.log(`  Password : ${NEW_PASSWORD}`);
  console.log(`  Login at : http://localhost:3000/admin/login`);
  console.log('──────────────────────────────────────────\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
