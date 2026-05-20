'use strict';
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ──────────────────────────────────────────────────────────────────────────────
// PostgreSQL / Supabase
// ──────────────────────────────────────────────────────────────────────────────
const { Pool } = require('pg');

  // Internal Render hostnames (no dots) don't need SSL; external do
  const dbUrl = process.env.DATABASE_URL || '';
  const needsSsl = dbUrl.includes('.render.com') || dbUrl.includes('.postgres.') || dbUrl.includes('.supabase.co') || dbUrl.includes('.supabase.com');
  const pgPool = new Pool({
    connectionString: dbUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    min: 2,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
  });

  // Prevent idle client connection resets (e.g. Supabase dropping idle sockets)
  // from crashing the process with an unhandled 'error' event.
  pgPool.on('error', (err) => {
    console.error('[DB] Idle client error (pool will reconnect):', err.message);
  });

  // ── MySQL SQL → PostgreSQL SQL converter ────────────────────────────────────
  function convertSQL(sql) {
    let s = sql;
    // Strip MySQL-only preamble
    s = s.replace(/CREATE\s+DATABASE\s+[^;]+;\s*/gi, '');
    s = s.replace(/USE\s+`?[^\s;`]+`?\s*;\s*/gi, '');
    // Backtick identifiers → plain (pg handles unquoted lower-case fine)
    s = s.replace(/`([^`]+)`/g, '$1');
    // AUTO_INCREMENT → SERIAL (must come before generic INT replacement)
    s = s.replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'SERIAL PRIMARY KEY');
    s = s.replace(/\bINT\s+AUTO_INCREMENT\b/gi, 'SERIAL');
    // TINYINT(1) / TINYINT → SMALLINT
    s = s.replace(/TINYINT\s*\(\s*1\s*\)/gi, 'SMALLINT');
    s = s.replace(/\bTINYINT\b/gi, 'SMALLINT');
    // ENUM → VARCHAR(100)
    s = s.replace(/ENUM\s*\([^)]+\)/gi, 'VARCHAR(100)');
    // DATETIME → TIMESTAMP
    s = s.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
    // Remove storage engine / charset suffix
    s = s.replace(/\)\s*ENGINE\s*=\s*InnoDB[^;]*/gi, ')');
    // Remove ON UPDATE CURRENT_TIMESTAMP
    s = s.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '');
    // UNIQUE KEY name (cols) → CONSTRAINT name UNIQUE (cols)
    s = s.replace(/\bUNIQUE\s+KEY\s+(\w+)\s*(\([^)]+\))/gi, 'CONSTRAINT $1 UNIQUE $2');
    // Remove non-unique inline INDEX declarations (pg needs separate CREATE INDEX)
    s = s.replace(/,\s*(?:KEY|INDEX)\s+\w+\s*\([^)]+\)/gi, '');
    // Remove FULLTEXT index declarations
    s = s.replace(/,\s*FULLTEXT\s+\w+\s*\([^)]+\)/gi, '');
    // ON DUPLICATE KEY UPDATE … → ON CONFLICT DO NOTHING
    s = s.replace(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b[\s\S]*?(?=;|$)/gi, 'ON CONFLICT DO NOTHING');
    // ALTER TABLE t ADD INDEX → no-op comment
    s = s.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+INDEX\s+(\w+)\s*\(([^)]+)\)/gi,
      'SELECT 1 /* INDEX $2 on $1($3) */');
    // ALTER TABLE t ADD UNIQUE INDEX → ADD CONSTRAINT UNIQUE
    s = s.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+UNIQUE\s+INDEX\s+(\w+)\s*\(([^)]+)\)/gi,
      'ALTER TABLE $1 ADD CONSTRAINT $2 UNIQUE ($3)');
    // MODIFY COLUMN col ENUM(…) [DEFAULT 'x'] → ALTER COLUMN col TYPE VARCHAR(100) [SET DEFAULT 'x']
    s = s.replace(/\bMODIFY\s+COLUMN\s+(\w+)\s+(?:ENUM\s*\([^)]+\)|VARCHAR\s*\(\d+\))\s*(?:NOT\s+NULL\s*)?(?:DEFAULT\s+'([^']*)')?/gi,
      (m, col, def) => `ALTER COLUMN ${col} TYPE VARCHAR(100)${def ? `, ALTER COLUMN ${col} SET DEFAULT '${def}'` : ''}`);
    return s;
  }

  // ── ? → $1, $2, … ──────────────────────────────────────────────────────────
  function pgParams(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  // ── Unified query: returns [rows, fields] like mysql2 ──────────────────────
  async function pgQuery(sql, params) {
    const args = Array.isArray(params) ? params : [];
    let s = pgParams(sql);

    // Auto-append RETURNING id for INSERT so callers can read insertId
    const isInsert = /^\s*INSERT\s+/i.test(sql);
    let addedReturning = false;
    if (isInsert && !/RETURNING/i.test(s)) {
      s = s.replace(/;?\s*$/, ' RETURNING id');
      addedReturning = true;
    }

    try {
      const result = await pgPool.query(s, args.length ? args : undefined);
      const rows = result.rows || [];
      if (addedReturning && rows.length > 0 && rows[0].id !== undefined) {
        rows.insertId = rows[0].id;
      }
      return [rows, result.fields || []];
    } catch (err) {
      if (addedReturning) {
        // Retry without RETURNING (table might not have id column)
        const result = await pgPool.query(pgParams(sql), args.length ? args : undefined);
        return [result.rows || [], result.fields || []];
      }
      throw err;
    }
  }

  // ── pool object (mysql2-compatible surface) ─────────────────────────────────
  const pool = {
    query:   pgQuery,
    execute: pgQuery,

    getConnection: async () => {
      const client = await pgPool.connect();

      // Build a query function that runs on THIS client (so transactions work correctly)
      const clientQuery = async (sql, params) => {
        const args = Array.isArray(params) ? params : [];
        let s = pgParams(sql);
        const isInsert = /^\s*INSERT\s+/i.test(sql);
        let addedReturning = false;
        if (isInsert && !/RETURNING/i.test(s)) {
          s = s.replace(/;?\s*$/, ' RETURNING id');
          addedReturning = true;
        }
        try {
          const result = await client.query(s, args.length ? args : undefined);
          const rows = result.rows || [];
          if (addedReturning && rows.length > 0 && rows[0].id !== undefined) {
            rows.insertId = rows[0].id;
          }
          return [rows, result.fields || []];
        } catch (err) {
          if (addedReturning) {
            const result2 = await client.query(pgParams(sql), args.length ? args : undefined);
            return [result2.rows || [], result2.fields || []];
          }
          throw err;
        }
      };

      return {
        query:            clientQuery,
        execute:          clientQuery,
        release:          ()       => client.release(),
        beginTransaction: ()       => client.query('BEGIN'),
        commit:           ()       => client.query('COMMIT'),
        rollback:         ()       => client.query('ROLLBACK'),
      };
    },

    end: () => pgPool.end(),
  };

  // ── Schema init + migrations ────────────────────────────────────────────────
  const testConnection = async () => {
    try {
      await pgPool.query('SELECT 1');
      console.log('✅ PostgreSQL Database connected successfully');

      // ── 1. Run base schema (database.sql converted to PG) ────────────────
      const sqlPath = path.join(__dirname, '..', 'models', 'database.sql');
      let initSQL = fs.readFileSync(sqlPath, 'utf8');
      initSQL = convertSQL(initSQL);

      // Split on ; boundaries and skip pure INSERT seed statements
      // Strip leading SQL comments before testing so "-- comment\nINSERT..." is still excluded
      const stmts = initSQL.split(';')
        .map(s => s.trim())
        .filter(s => {
          const noComments = s.replace(/--[^\n]*/g, '').trim();
          return noComments.length > 5 && !/^\s*INSERT\s+/i.test(noComments);
        });

      for (const stmt of stmts) {
        try { await pgPool.query(stmt); } catch (_) { /* table exists, etc. */ }
      }
      console.log('✅ Base schema applied');

      // ── 2. Incremental migrations ────────────────────────────────────────
      const migrations = [
        `ALTER TABLE product_reviews ADD COLUMN seller_reply TEXT DEFAULT NULL`,
        `ALTER TABLE product_reviews ADD COLUMN seller_reply_at TIMESTAMP DEFAULT NULL`,
        `ALTER TABLE companies ADD COLUMN promo_banner VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN role VARCHAR(100) NOT NULL DEFAULT 'customer'`,

        `CREATE TABLE IF NOT EXISTS deliveries (
          id SERIAL PRIMARY KEY,
          order_id INT NOT NULL,
          order_number VARCHAR(50) NOT NULL,
          from_branch_id INT DEFAULT NULL,
          to_branch_id INT DEFAULT NULL,
          delivery_type VARCHAR(100) DEFAULT 'branch_to_branch',
          weight_kg DECIMAL(6,1) NOT NULL DEFAULT 0.0,
          size_feet INT NOT NULL DEFAULT 0,
          price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0.40,
          price_per_foot DECIMAL(10,2) NOT NULL DEFAULT 0.60,
          cost_weight DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          cost_size DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          cost_route DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          delivery_boy_name VARCHAR(120) NOT NULL DEFAULT '',
          delivery_boy_phone VARCHAR(30) NOT NULL DEFAULT '',
          vehicle_plate VARCHAR(60) NOT NULL DEFAULT '',
          assigned_by_user_id INT NOT NULL,
          seller_paid_cash SMALLINT DEFAULT 1,
          status VARCHAR(100) DEFAULT 'assigned',
          proof_image_url VARCHAR(500) DEFAULT NULL,
          proof_lat DECIMAL(10,7) DEFAULT NULL,
          proof_lng DECIMAL(10,7) DEFAULT NULL,
          proof_notes TEXT DEFAULT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          delivered_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
          CONSTRAINT unique_delivery_per_order UNIQUE (order_id)
        )`,

        `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS destination_address TEXT DEFAULT NULL`,
        `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS packaging_category VARCHAR(100) DEFAULT 'standard'`,
        `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS packaging_cost DECIMAL(10,2) NOT NULL DEFAULT 1.00`,
        `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_boy_user_id INT DEFAULT NULL`,
        `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL`,

        `ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_branch_id INT DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved SMALLINT DEFAULT 1`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS salary DECIMAL(12,2) DEFAULT 0.00`,

        `CREATE TABLE IF NOT EXISTS branches (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          address TEXT DEFAULT NULL,
          is_active SMALLINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS branch_delivery_pricing (
          id SERIAL PRIMARY KEY,
          from_branch_id INT NOT NULL,
          to_branch_id INT NOT NULL,
          charge_branch_to_branch DECIMAL(10,2) NOT NULL DEFAULT 2.00,
          charge_branch_to_branch_address DECIMAL(10,2) NOT NULL DEFAULT 2.50,
          is_active SMALLINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uk_route UNIQUE (from_branch_id, to_branch_id),
          FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE CASCADE,
          FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS vehicles (
          id SERIAL PRIMARY KEY,
          plate_number VARCHAR(60) NOT NULL UNIQUE,
          vehicle_type VARCHAR(60) DEFAULT 'bike',
          branch_id INT DEFAULT NULL,
          assigned_user_id INT DEFAULT NULL,
          route_from_branch_id INT DEFAULT NULL,
          route_to_branch_id INT DEFAULT NULL,
          driver_name VARCHAR(100) DEFAULT NULL,
          driver_phone VARCHAR(30) DEFAULT NULL,
          route_via_branches JSONB DEFAULT NULL,
          route_id INT DEFAULT NULL,
          is_active SMALLINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS admin_requests (
          id SERIAL PRIMARY KEY,
          requester_user_id INT NOT NULL,
          request_type VARCHAR(100) NOT NULL,
          title VARCHAR(255) NOT NULL,
          details JSONB DEFAULT NULL,
          status VARCHAR(100) DEFAULT 'pending',
          reviewed_by_user_id INT DEFAULT NULL,
          reviewed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS admin_notifications (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'system',
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          reference_id INT DEFAULT NULL,
          reference_type VARCHAR(50) DEFAULT NULL,
          is_read SMALLINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS platform_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(100) NOT NULL UNIQUE,
          setting_value VARCHAR(255) NOT NULL,
          description VARCHAR(255) DEFAULT NULL,
          updated_by_user_id INT DEFAULT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
          ('commission_rate','5.00','Commission percentage per product purchase'),
          ('cost_per_kg','0.40','Delivery cost per kilogram'),
          ('cost_per_foot','0.60','Delivery cost per foot of size'),
          ('packaging_plastic','1.00','Packaging cost for plastic category'),
          ('packaging_glass','1.50','Packaging cost for glass category'),
          ('packaging_fragile','2.00','Packaging cost for fragile category'),
          ('packaging_standard','1.00','Packaging cost for standard category'),
          ('route_branch_to_branch','2.00','Default branch-to-branch delivery charge'),
          ('route_branch_to_address','2.50','Default branch-to-address delivery charge')
        ON CONFLICT (setting_key) DO NOTHING`,

        `CREATE TABLE IF NOT EXISTS ad_promotions (
          id SERIAL PRIMARY KEY,
          advertiser_name VARCHAR(255) NOT NULL,
          company_id INT DEFAULT NULL,
          banner_image VARCHAR(500) NOT NULL DEFAULT '',
          link_url VARCHAR(500) DEFAULT NULL,
          fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active SMALLINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS admin_audit_log (
          id SERIAL PRIMARY KEY,
          admin_user_id INT NOT NULL,
          admin_role VARCHAR(50) NOT NULL,
          action VARCHAR(100) NOT NULL,
          target_type VARCHAR(50) DEFAULT NULL,
          target_id INT DEFAULT NULL,
          details JSONB DEFAULT NULL,
          ip_address VARCHAR(45) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS company_notifications (
          id SERIAL PRIMARY KEY,
          company_id INT NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'system',
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          reference_id INT DEFAULT NULL,
          reference_type VARCHAR(50) DEFAULT NULL,
          is_read SMALLINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS product_images (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL,
          image_url VARCHAR(500) NOT NULL,
          is_primary SMALLINT DEFAULT 0,
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS company_promo_codes (
          id SERIAL PRIMARY KEY,
          company_id INT NOT NULL,
          product_id INT DEFAULT NULL,
          code VARCHAR(50) NOT NULL,
          discount_type VARCHAR(100) NOT NULL DEFAULT 'percentage',
          discount_value DECIMAL(10,2) NOT NULL,
          min_order_amount DECIMAL(12,2) DEFAULT 0.00,
          max_uses INT DEFAULT NULL,
          current_uses INT DEFAULT 0,
          is_active SMALLINT DEFAULT 1,
          expires_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
          CONSTRAINT unique_company_code UNIQUE (company_id, code)
        )`,

        `ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price DECIMAL(12,2) DEFAULT NULL`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS max_price DECIMAL(12,2) DEFAULT NULL`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50) DEFAULT NULL`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_negotiable SMALLINT DEFAULT 0`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_ar_3d SMALLINT DEFAULT 0`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS ar_qr_image VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS ar_url VARCHAR(1000) DEFAULT NULL`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS cod_advance_amount DECIMAL(12,2) DEFAULT NULL`,

        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS nid_front_image VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS nid_back_image VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS face_image VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(15,2) DEFAULT 0.00`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS badge VARCHAR(20) DEFAULT 'bronze'`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS cover_image VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS follower_count INT NOT NULL DEFAULT 0`,

        `ALTER TABLE company_followers ADD COLUMN IF NOT EXISTS notifications_enabled SMALLINT DEFAULT 1`,

        `ALTER TABLE companies ADD CONSTRAINT IF NOT EXISTS idx_unique_company_name UNIQUE (company_name)`,
        `ALTER TABLE companies ADD CONSTRAINT IF NOT EXISTS idx_unique_contact_email UNIQUE (contact_email)`,
        `ALTER TABLE companies ADD CONSTRAINT IF NOT EXISTS idx_unique_contact_phone UNIQUE (contact_phone)`,
        `ALTER TABLE companies ADD CONSTRAINT IF NOT EXISTS idx_unique_nid_number UNIQUE (nid_number)`,
        `ALTER TABLE companies ADD CONSTRAINT IF NOT EXISTS idx_unique_website UNIQUE (website)`,

        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_advance_paid DECIMAL(12,2) DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_mobile VARCHAR(20) DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS district VARCHAR(100) DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS upazila VARCHAR(100) DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_location TEXT DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_branch_id INT DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_branch_at TIMESTAMP NULL DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_accepted_at TIMESTAMP NULL DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_accepted_by_user_id INT DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS from_location VARCHAR(255) DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS to_location VARCHAR(255) DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_id INT DEFAULT NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_status VARCHAR(100) DEFAULT 'order_placed'`,

        `ALTER TABLE users ADD COLUMN IF NOT EXISTS earned_stars DECIMAL(10,2) DEFAULT 0.00`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS spent_stars DECIMAL(10,2) DEFAULT 0.00`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS delivery_is_available SMALLINT DEFAULT 1`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS delivery_last_location VARCHAR(500) DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS delivery_last_location_updated_at TIMESTAMP NULL DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255) DEFAULT NULL`,

        `ALTER TABLE cart ADD COLUMN IF NOT EXISTS negotiated_price DECIMAL(12,2) DEFAULT NULL`,

        `CREATE TABLE IF NOT EXISTS delivery_hubs (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          location VARCHAR(500) NOT NULL,
          branch_id INT DEFAULT NULL,
          is_active SMALLINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uk_hub_name_location UNIQUE (name, location)
        )`,

        `CREATE TABLE IF NOT EXISTS delivery_routes (
          id SERIAL PRIMARY KEY,
          from_location VARCHAR(255) NOT NULL,
          to_location VARCHAR(255) NOT NULL,
          is_active SMALLINT DEFAULT 1,
          created_by INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uk_route_locations UNIQUE (from_location, to_location),
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS delivery_route_hubs (
          id SERIAL PRIMARY KEY,
          route_id INT NOT NULL,
          hub_id INT NOT NULL,
          hub_order INT NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uk_route_hub UNIQUE (route_id, hub_id),
          CONSTRAINT uk_route_hub_order UNIQUE (route_id, hub_order),
          FOREIGN KEY (route_id) REFERENCES delivery_routes(id) ON DELETE CASCADE,
          FOREIGN KEY (hub_id) REFERENCES delivery_hubs(id) ON DELETE RESTRICT
        )`,

        `CREATE TABLE IF NOT EXISTS company_branch_preferences (
          id SERIAL PRIMARY KEY,
          company_id INT NOT NULL,
          branch_id INT NOT NULL,
          usage_count INT NOT NULL DEFAULT 0,
          last_assigned_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uk_company_branch_pref UNIQUE (company_id, branch_id),
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS order_tracking (
          id SERIAL PRIMARY KEY,
          order_id INT NOT NULL,
          location VARCHAR(500) DEFAULT NULL,
          status VARCHAR(100) NOT NULL,
          updated_by INT DEFAULT NULL,
          event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS seller_negotiation_rules (
          id SERIAL PRIMARY KEY,
          company_id INT NOT NULL,
          min_orders INT NOT NULL DEFAULT 0,
          max_orders INT DEFAULT NULL,
          discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )`,

        `ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(100) NOT NULL DEFAULT 'feedback'`,
        `ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS company_id INT DEFAULT NULL`,
        `ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS admin_reply TEXT DEFAULT NULL`,
        `ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP NULL DEFAULT NULL`,
        `ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS replied_by INT DEFAULT NULL`,

        `CREATE TABLE IF NOT EXISTS ai_negotiations (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          product_id INT NOT NULL,
          company_id INT NOT NULL,
          status VARCHAR(100) DEFAULT 'active',
          final_price DECIMAL(12,2) DEFAULT NULL,
          offered_price DECIMAL(12,2) DEFAULT NULL,
          customer_order_count INT DEFAULT 0,
          customer_total_purchases DECIMAL(15,2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS ai_negotiation_messages (
          id SERIAL PRIMARY KEY,
          negotiation_id INT NOT NULL,
          sender VARCHAR(100) NOT NULL,
          message_type VARCHAR(50) NOT NULL DEFAULT 'response',
          message_text TEXT NOT NULL,
          offered_price DECIMAL(12,2) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (negotiation_id) REFERENCES ai_negotiations(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS password_reset_otps (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          email VARCHAR(255) NOT NULL DEFAULT '',
          otp CHAR(6) NOT NULL DEFAULT '',
          otp_code CHAR(6) DEFAULT NULL,
          expires_at TIMESTAMP NOT NULL,
          used SMALLINT NOT NULL DEFAULT 0,
          is_used SMALLINT NOT NULL DEFAULT 0,
          is_verified SMALLINT NOT NULL DEFAULT 0,
          reset_token VARCHAR(256) DEFAULT NULL,
          token_expires_at TIMESTAMP DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // Migrate existing password_reset_otps rows to new column names
        `ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS otp_code CHAR(6) DEFAULT NULL`,
        `ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS is_used SMALLINT NOT NULL DEFAULT 0`,
        `ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS is_verified SMALLINT NOT NULL DEFAULT 0`,
        `ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS reset_token VARCHAR(256) DEFAULT NULL`,
        `ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP DEFAULT NULL`,
        `UPDATE password_reset_otps SET otp_code = otp WHERE otp_code IS NULL AND otp <> ''`,
        `UPDATE password_reset_otps SET is_used = used WHERE is_used = 0 AND used = 1`,

        // ── migration_v5_delivery_status ──────────────────────────────────────
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS previous_branch_id INT NULL DEFAULT NULL`,

        // ── deduplicate support_info (seeded on every restart due to comment-prefixed INSERT) ──
        `DELETE FROM support_info WHERE id NOT IN (
          SELECT MIN(id) FROM support_info GROUP BY type, label, value
        )`,

        // ── migration_v6: delivery zone pricing + revenue ────────────────────
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00`,
        `ALTER TABLE orders ALTER COLUMN shipping_address DROP NOT NULL`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_cod_allowed SMALLINT NOT NULL DEFAULT 0`,

        `CREATE TABLE IF NOT EXISTS revenue_history (
          id SERIAL PRIMARY KEY,
          order_id INT NOT NULL,
          order_number VARCHAR(50) NOT NULL,
          sale_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          product_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          commission_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
          commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          delivery_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          source_type VARCHAR(100) NOT NULL DEFAULT 'cart',
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          CONSTRAINT unique_revenue_order UNIQUE (order_id)
        )`,

        // Ensure unique constraint exists even if table was created by old startup-migration.js
        `DO $$ BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint WHERE conname = 'unique_revenue_order'
           ) THEN
             ALTER TABLE revenue_history ADD CONSTRAINT unique_revenue_order UNIQUE (order_id);
           END IF;
         END $$`,

        `CREATE TABLE IF NOT EXISTS category_commissions (
          id SERIAL PRIMARY KEY,
          category_id INT NOT NULL,
          category_name VARCHAR(100) NOT NULL DEFAULT '',
          commission_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
          updated_by_user_id INT DEFAULT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_category_commission UNIQUE (category_id)
        )`,

        `INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
          ('delivery_inside_dhaka',   '60.00',  'Base delivery charge inside Dhaka (BDT)'),
          ('delivery_outside_dhaka',  '120.00', 'Base delivery charge outside Dhaka (BDT)'),
          ('delivery_extra_per_item', '30.00',  'Additional charge per extra item beyond the first (BDT)')
        ON CONFLICT (setting_key) DO NOTHING`,
      ];

      for (const sql of migrations) {
        try { await pgPool.query(sql); } catch (_) { /* already exists */ }
      }
      console.log('✅ Migrations applied');

      // ── 3. Seed branches ────────────────────────────────────────────────────
      await pgPool.query(`
        INSERT INTO branches (name, address) VALUES
          ('Branch 1','FlexCart Branch 1'),
          ('Branch 2','FlexCart Branch 2')
        ON CONFLICT (name) DO NOTHING
      `).catch(() => {});

      await pgPool.query(`
        INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
        SELECT b1.id, b2.id, 2.00, 2.50 FROM branches b1 JOIN branches b2 ON b2.name='Branch 2' WHERE b1.name='Branch 1'
        ON CONFLICT DO NOTHING
      `).catch(() => {});

      await pgPool.query(`
        INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
        SELECT b2.id, b1.id, 2.00, 2.50 FROM branches b1 JOIN branches b2 ON b2.name='Branch 2' WHERE b1.name='Branch 1'
        ON CONFLICT DO NOTHING
      `).catch(() => {});

      // ── 4. Seed default categories ──────────────────────────────────────────
      await pgPool.query(`
        INSERT INTO categories (name, description, icon, is_active, sort_order) VALUES
          ('Electronics','Electronic devices and gadgets','laptop',1,1),
          ('Clothing','Fashion and apparel','shirt',1,2),
          ('Home & Kitchen','Home appliances and kitchenware','home',1,3),
          ('Books','Books and educational materials','book',1,4),
          ('Sports','Sports equipment and accessories','dumbbell',1,5),
          ('Beauty','Beauty and personal care','sparkles',1,6),
          ('Toys','Toys and games','gamepad',1,7),
          ('Automotive','Automotive parts and accessories','car',1,8),
          ('Health','Health and wellness','heart',1,9),
          ('Furniture','Furniture and decor','couch',1,10),
          ('Other','Miscellaneous products','package',1,11)
        ON CONFLICT (name) DO NOTHING
      `).catch(() => {});

      // ── 5. Seed Super Admin ─────────────────────────────────────────────────
      const bcrypt = require('bcryptjs');
      const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@flexcart.com';
      const adminPass  = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@' + Math.random().toString(36).slice(2, 10);
      const hash = await bcrypt.hash(adminPass, 10);
      await pgPool.query(`
        INSERT INTO users (username, email, password_hash, role, is_verified, status)
        VALUES ('superadmin', $2, $1, 'super_admin', 1, 'active')
        ON CONFLICT (email) DO UPDATE SET role = 'super_admin', is_verified = 1
      `, [hash, adminEmail]).catch(() => {});
      console.log(`✅ Super admin ready (${adminEmail})`);

      // ── 6. Recalculate company ratings ──────────────────────────────────────
      await pgPool.query(`
        UPDATE companies SET
          rating = COALESCE((SELECT AVG(cr.rating) FROM company_ratings cr WHERE cr.company_id = companies.id), 0),
          total_ratings = COALESCE((SELECT COUNT(*) FROM company_ratings cr WHERE cr.company_id = companies.id), 0)
      `).catch(() => {});

    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      // Don't exit — server stays up so health check passes; DB retries on next request
    }
  };

module.exports = { pool, testConnection, convertSQL };

// ──────────────────────────────────────────────────────────────────────────
// (MySQL branch removed — Supabase PostgreSQL only)
// ──────────────────────────────────────────────────────────────────────────
