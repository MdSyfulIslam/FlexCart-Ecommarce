/**
 * FlexCart All-in-One Admin Setup Script
 * ==========================================
 * Run this ONCE to fix the database and create the Super Admin account.
 *
 *   cd flexcart-backend
 *   node scripts/setup.js
 *
 * Safe to re-run — it is fully idempotent.
 */

const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

// ─────────────────────────────────────────────
// Connection config (mirrors db.js logic)
// ─────────────────────────────────────────────
const configuredHost = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
const resolvedHost   = configuredHost === 'localhost' ? '127.0.0.1' : configuredHost;
const resolvedPort   = Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306);
const resolvedDbName = process.env.DB_NAME || process.env.MYSQLDATABASE || 'flexcart_db';
const resolvedUser   = process.env.DB_USER || process.env.MYSQLUSER || 'root';
const resolvedPassword = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '';

// Super Admin credentials
const SUPER_ADMIN = {
  username: 'SuperAdmin',
  email:    'superadmin@flexcart.com',
  password: 'SuperAdmin@2024',
};

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────
function ok(msg)   { console.log('  ✅', msg); }
function skip(msg) { console.log('  ⏭ ', msg); }
function warn(msg) { console.log('  ⚠️ ', msg); }
function fail(msg) { console.log('  ❌', msg); }

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [resolvedDbName, table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [resolvedDbName, table]
  );
  return rows.length > 0;
}

async function addColumn(conn, table, column, definition) {
  if (await columnExists(conn, table, column)) {
    skip(`Column ${table}.${column} already exists`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  ok(`Added column ${table}.${column}`);
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  FlexCart Admin Database Setup');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Host     : ${resolvedHost}:${resolvedPort}`);
  console.log(`  Database : ${resolvedDbName}`);
  console.log(`  User     : ${resolvedUser}`);
  console.log('══════════════════════════════════════════════════\n');

  let conn;
  try {
    conn = await mysql.createConnection({
      host:     resolvedHost,
      port:     resolvedPort,
      user:     resolvedUser,
      password: resolvedPassword,
      database: resolvedDbName,
      multipleStatements: false,
    });
    ok('Connected to MySQL');
  } catch (err) {
    fail(`Cannot connect to MySQL: ${err.message}`);
    console.log('\n  Check your .env file (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)');
    process.exit(1);
  }

  // ── 1. Ensure users table has required columns ──────────────────
  console.log('\n[1] Checking users table columns...');
  await addColumn(conn, 'users', 'role',              "ENUM('customer','seller','staff_admin','delivery_admin','super_admin','delivery_boy') NOT NULL DEFAULT 'customer'");
  await addColumn(conn, 'users', 'is_approved',       'TINYINT(1) DEFAULT 1');
  await addColumn(conn, 'users', 'assigned_branch_id','INT DEFAULT NULL');
  await addColumn(conn, 'users', 'salary',            'DECIMAL(12,2) DEFAULT 0.00');

  // Make sure existing rows with NULL is_approved get set to 1 (approved by default)
  await conn.query(`UPDATE users SET is_approved = 1 WHERE is_approved IS NULL`);
  ok('Existing NULL is_approved rows set to 1');

  // ── 2. Create admin_audit_log ────────────────────────────────────
  console.log('\n[2] Checking admin_audit_log table...');
  if (await tableExists(conn, 'admin_audit_log')) {
    skip('admin_audit_log already exists');
  } else {
    await conn.query(`
      CREATE TABLE admin_audit_log (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        admin_user_id INT NOT NULL,
        admin_role    VARCHAR(50) NOT NULL,
        action        VARCHAR(100) NOT NULL,
        target_type   VARCHAR(50)  DEFAULT NULL,
        target_id     INT          DEFAULT NULL,
        details       JSON         DEFAULT NULL,
        ip_address    VARCHAR(45)  DEFAULT NULL,
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin   (admin_user_id),
        INDEX idx_action  (action),
        INDEX idx_created (created_at),
        FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ok('Created admin_audit_log');
  }

  // ── 3. Create vehicles table ─────────────────────────────────────
  console.log('\n[3] Checking vehicles table...');
  if (await tableExists(conn, 'vehicles')) {
    skip('vehicles already exists');
  } else {
    await conn.query(`
      CREATE TABLE vehicles (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        plate_number     VARCHAR(60) NOT NULL UNIQUE,
        vehicle_type     VARCHAR(60) DEFAULT 'bike',
        branch_id        INT DEFAULT NULL,
        assigned_user_id INT DEFAULT NULL,
        is_active        TINYINT(1) DEFAULT 1,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_branch (branch_id),
        INDEX idx_plate  (plate_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ok('Created vehicles');
  }

  // ── 4. Create admin_notifications table ─────────────────────────
  console.log('\n[4] Checking admin_notifications table...');
  if (await tableExists(conn, 'admin_notifications')) {
    skip('admin_notifications already exists');
  } else {
    await conn.query(`
      CREATE TABLE admin_notifications (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        user_id        INT NOT NULL,
        type           VARCHAR(50) NOT NULL DEFAULT 'system',
        title          VARCHAR(255) NOT NULL,
        message        TEXT NOT NULL,
        reference_id   INT DEFAULT NULL,
        reference_type VARCHAR(50) DEFAULT NULL,
        is_read        TINYINT(1) DEFAULT 0,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_read (user_id, is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ok('Created admin_notifications');
  }

  // ── 5. Create platform_settings table ───────────────────────────
  console.log('\n[5] Checking platform_settings table...');
  if (await tableExists(conn, 'platform_settings')) {
    skip('platform_settings already exists');
  } else {
    await conn.query(`
      CREATE TABLE platform_settings (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        setting_key       VARCHAR(100) NOT NULL UNIQUE,
        setting_value     VARCHAR(255) NOT NULL,
        description       VARCHAR(255) DEFAULT NULL,
        updated_by_user_id INT DEFAULT NULL,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ok('Created platform_settings');
  }

  // Seed default settings
  await conn.query(`
    INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
      ('commission_rate', '5.00', 'Commission percentage per product purchase'),
      ('cost_per_kg', '0.40', 'Delivery cost per kilogram'),
      ('cost_per_foot', '0.60', 'Delivery cost per foot of size'),
      ('packaging_plastic', '1.00', 'Packaging cost for plastic category'),
      ('packaging_glass', '1.50', 'Packaging cost for glass category'),
      ('packaging_fragile', '2.00', 'Packaging cost for fragile category'),
      ('packaging_standard', '1.00', 'Packaging cost for standard category'),
      ('route_branch_to_branch', '2.00', 'Default branch-to-branch delivery charge'),
      ('route_branch_to_address', '2.50', 'Default branch-to-address delivery charge')
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
  `);
  ok('Platform settings seeded');

  // ── 6. Create ad_promotions table ───────────────────────────────
  console.log('\n[6] Checking ad_promotions table...');
  if (await tableExists(conn, 'ad_promotions')) {
    skip('ad_promotions already exists');
  } else {
    await conn.query(`
      CREATE TABLE ad_promotions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_name VARCHAR(255) NOT NULL,
        company_id      INT DEFAULT NULL,
        banner_image    VARCHAR(500) NOT NULL DEFAULT '',
        link_url        VARCHAR(500) DEFAULT NULL,
        fee_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        start_date      DATE NOT NULL,
        end_date        DATE NOT NULL,
        is_active       TINYINT(1) DEFAULT 1,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_active_dates (is_active, start_date, end_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ok('Created ad_promotions');
  }

  // ── 7. Super Admin account ───────────────────────────────────────
  console.log('\n[7] Setting up Super Admin account...');

  const [existing] = await conn.query(
    "SELECT id, username, email, status, is_approved, role FROM users WHERE role = 'super_admin' LIMIT 1"
  );

  const hash = await bcrypt.hash(SUPER_ADMIN.password, 12);

  if (existing.length > 0) {
    const admin = existing[0];
    warn(`Super Admin already exists (id=${admin.id}, email=${admin.email})`);
    console.log('     Forcing password reset + active + approved...');

    await conn.query(
      `UPDATE users SET password_hash = ?, status = 'active', is_approved = 1 WHERE id = ?`,
      [hash, admin.id]
    );
    ok(`Super Admin updated (id=${admin.id})`);
  } else {
    const [result] = await conn.query(
      `INSERT INTO users (username, email, password_hash, role, is_verified, is_approved, status)
       VALUES (?, ?, ?, 'super_admin', 1, 1, 'active')`,
      [SUPER_ADMIN.username, SUPER_ADMIN.email, hash]
    );
    ok(`Super Admin created (id=${result.insertId})`);
  }

  // ── 8. Verify the login works ────────────────────────────────────
  console.log('\n[8] Verifying login credentials...');
  const [rows] = await conn.query(
    "SELECT id, password_hash, status, is_approved FROM users WHERE email = ?",
    [SUPER_ADMIN.email]
  );

  if (rows.length === 0) {
    fail('Super Admin row not found after insert — something went wrong!');
    process.exit(1);
  }

  const user = rows[0];
  const match = await bcrypt.compare(SUPER_ADMIN.password, user.password_hash);

  if (!match) {
    fail('bcrypt.compare FAILED — password hash mismatch!');
    process.exit(1);
  }

  ok(`bcrypt.compare passed — password hash is correct`);
  ok(`status = ${user.status}`);
  ok(`is_approved = ${user.is_approved}`);

  await conn.end();

  // ── Done ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  ✅  Setup Complete!');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Admin Login URL : http://localhost:3000/admin/login`);
  console.log(`  Email           : ${SUPER_ADMIN.email}`);
  console.log(`  Password        : ${SUPER_ADMIN.password}`);
  console.log('══════════════════════════════════════════════════');
  console.log('  ⚠️  Change your password after first login!\n');
}

main().catch(err => {
  fail(`Unexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
