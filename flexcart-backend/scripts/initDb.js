'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function firstEnv(keys, fallback) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return fallback;
}

function truthy(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

async function main() {
  const host = firstEnv(['DB_HOST', 'MYSQLHOST'], '127.0.0.1');
  const port = Number(firstEnv(['DB_PORT', 'MYSQLPORT'], '3306'));
  const user = firstEnv(['DB_USER', 'MYSQLUSER'], 'root');
  const password = firstEnv(['DB_PASSWORD', 'MYSQLPASSWORD'], '');
  const dbName = firstEnv(['DB_NAME', 'MYSQLDATABASE'], 'flexcart_db');

  const skipDemo = truthy(process.env.DB_INIT_SKIP_DEMO);

  const sqlPath = path.join(__dirname, '..', 'models', 'database.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');

  // Admin panels migration (extends the base schema)
  const adminMigrationPath = path.join(__dirname, '..', 'models', 'migration_admin_panels.sql');
  let adminMigrationSql = '';
  try {
    adminMigrationSql = fs.readFileSync(adminMigrationPath, 'utf8');
  } catch {
    adminMigrationSql = '';
  }

  // Many managed DBs do not allow CREATE DATABASE. We'll strip it and target the configured DB.
  sql = sql.replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?[^`\s;]+`?\s*;\s*/i, '');

  // Replace the first USE statement to point to the target DB.
  if (/\bUSE\s+`?[^`\s;]+`?\s*;/i.test(sql)) {
    sql = sql.replace(/\bUSE\s+`?[^`\s;]+`?\s*;/i, `USE \`${dbName}\`;`);
  } else {
    sql = `USE \`${dbName}\`;\n\n` + sql;
  }

  // Point the admin migration to the target DB as well
  if (adminMigrationSql && /\bUSE\s+`?[^`\s;]+`?\s*;/i.test(adminMigrationSql)) {
    adminMigrationSql = adminMigrationSql.replace(/\bUSE\s+`?[^`\s;]+`?\s*;/i, `USE \`${dbName}\`;`);
  } else if (adminMigrationSql) {
    adminMigrationSql = `USE \`${dbName}\`;\n\n` + adminMigrationSql;
  }

  // Optional: skip demo seed inserts.
  if (skipDemo) {
    sql = sql.replace(/\bINSERT\s+INTO[\s\S]*?;/gi, '');
  }

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true
  });

  try {
    // Best effort: create DB if allowed (ignored if permission is missing).
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    } catch {
      // ignore
    }

    await connection.query(sql);

    // Apply admin-panels migration (safe to run multiple times)
    if (adminMigrationSql && adminMigrationSql.trim()) {
      try {
        await connection.query(adminMigrationSql);
        console.log('ℹ️  Applied: migration_admin_panels.sql');
      } catch (e) {
        console.log('⚠️  Skipped admin-panels migration:', e.sqlMessage || e.message);
      }
    }

    // Backward-compatible migration: ensure users.role exists for older DBs.
    try {
      await connection.query(`USE \`${dbName}\`;`);
      const [cols] = await connection.query(
        `SELECT 1 AS ok
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
         LIMIT 1`,
        [dbName]
      );
      if (!cols || cols.length === 0) {
        await connection.query(
          `ALTER TABLE users
           ADD COLUMN role ENUM('customer','seller','staff_admin','delivery_admin','super_admin','delivery_boy')
           NOT NULL DEFAULT 'customer'`
        );
        console.log('ℹ️  Migrated: added users.role column');
      }
    } catch (e) {
      console.log('⚠️  Skipped users.role migration:', e.sqlMessage || e.message);
    }

    // Ensure essential delivery config exists (safe even when demo inserts are skipped).
    try {
      await connection.query(`USE \`${dbName}\`;`);

      const [[branchCountRow]] = await connection.query('SELECT COUNT(*) AS cnt FROM branches');
      const branchCount = Number(branchCountRow?.cnt || 0);
      if (branchCount === 0) {
        await connection.query(
          `INSERT INTO branches (name, address)
           VALUES ('Branch 1', 'FlexCart Branch 1'), ('Branch 2', 'FlexCart Branch 2')`
        );
        console.log('ℹ️  Seeded: branches (Branch 1, Branch 2)');
      }

      const [[pricingCountRow]] = await connection.query('SELECT COUNT(*) AS cnt FROM branch_delivery_pricing');
      const pricingCount = Number(pricingCountRow?.cnt || 0);
      if (pricingCount === 0) {
        await connection.query(
          `INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
           SELECT b1.id, b2.id, 2.00, 2.50
           FROM branches b1
           JOIN branches b2 ON b2.name = 'Branch 2'
           WHERE b1.name = 'Branch 1'
           ON DUPLICATE KEY UPDATE
             charge_branch_to_branch = VALUES(charge_branch_to_branch),
             charge_branch_to_branch_address = VALUES(charge_branch_to_branch_address),
             is_active = 1`
        );

        await connection.query(
          `INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
           SELECT b2.id, b1.id, 2.00, 2.50
           FROM branches b1
           JOIN branches b2 ON b2.name = 'Branch 2'
           WHERE b1.name = 'Branch 1'
           ON DUPLICATE KEY UPDATE
             charge_branch_to_branch = VALUES(charge_branch_to_branch),
             charge_branch_to_branch_address = VALUES(charge_branch_to_branch_address),
             is_active = 1`
        );

        console.log('ℹ️  Seeded: branch_delivery_pricing (default 2.00 / 2.50)');
      }
    } catch (e) {
      console.log('⚠️  Skipped delivery seed:', e.sqlMessage || e.message);
    }

    const [[row]] = await connection.query(
      'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?',
      [dbName]
    );

    console.log('✅ Database initialization completed');
    console.log(`   Host: ${host}:${port}`);
    console.log(`   Database: ${dbName}`);
    console.log(`   Tables: ${row?.table_count ?? 'unknown'}`);
    if (skipDemo) {
      console.log('   Demo data: skipped (DB_INIT_SKIP_DEMO=1)');
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('❌ Failed to initialize database schema');
  console.error(error.code || error.name || 'Error', error.errno || '', error.sqlMessage || error.message);
  process.exit(1);
});
