const { pool, convertSQL } = require('../config/db');
const bcrypt = require('bcryptjs');

async function safeQuery(sql, label) {
  try {
    // Convert MySQL-flavoured SQL to PostgreSQL before executing.
    // convertSQL handles: AUTO_INCREMENT→SERIAL, TINYINT→SMALLINT, ENUM→VARCHAR,
    // ENGINE=InnoDB stripped, ON UPDATE CURRENT_TIMESTAMP stripped,
    // UNIQUE KEY → CONSTRAINT UNIQUE, INDEX declarations removed,
    // ON DUPLICATE KEY UPDATE → ON CONFLICT DO NOTHING, MODIFY COLUMN ENUM → ALTER COLUMN TYPE.
    const pgSql = convertSQL(sql);
    await pool.query(pgSql);
    console.log(`[Migration] ✓ ${label}`);
  } catch (e) {
    // Ignore "already exists" errors for both MySQL and PostgreSQL
    const ignoredCodes = [
      'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY', // MySQL
      '42701', // PostgreSQL: duplicate_column (column already exists)
      '42P07', // PostgreSQL: duplicate_table
      '23505', // PostgreSQL: unique_violation
      '42P16', // PostgreSQL: invalid_table_definition (e.g. duplicate constraint)
    ];
    if (!ignoredCodes.includes(e.code)) {
      console.warn(`[Migration] ⚠ ${label}: ${e.message}`);
    }
  }
}

async function runStartupMigration() {
  try {
    console.log('[Migration] Running startup schema migration…');

    // ── orders: delivery_charge column ────────────────────────────────────
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00`,
      'orders.delivery_charge column'
    );

    // ── orders: allow NULL on shipping_address ─────────────────────────────
    await safeQuery(
      `ALTER TABLE orders ALTER COLUMN shipping_address DROP NOT NULL`,
      'orders.shipping_address → nullable'
    );

    // ── platform_settings: insert new delivery zone pricing ───────────────
    await safeQuery(
      `INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
         ('delivery_inside_dhaka',   '60.00',  'Base delivery charge inside Dhaka (BDT)'),
         ('delivery_outside_dhaka',  '120.00', 'Base delivery charge outside Dhaka (BDT)'),
         ('delivery_extra_per_item', '30.00',  'Additional charge per extra item beyond the first (BDT)')
       ON CONFLICT (setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         description   = EXCLUDED.description`,
      'platform_settings: delivery zone keys upserted'
    );

    // ── platform_settings: remove obsolete packaging/routing keys ─────────
    await safeQuery(
      `DELETE FROM platform_settings WHERE setting_key IN (
         'cost_per_kg','cost_per_foot',
         'packaging_plastic','packaging_glass','packaging_fragile','packaging_standard',
         'route_branch_to_branch','route_branch_to_address'
       )`,
      'platform_settings: old packaging/routing keys removed'
    );

    // ── revenue_history table ─────────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS revenue_history (
         id               INT AUTO_INCREMENT PRIMARY KEY,
         order_id         INT NOT NULL,
         order_number     VARCHAR(50) NOT NULL,
         sale_date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         product_total    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         delivery_charge  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
         commission_rate  DECIMAL(5,2)  NOT NULL DEFAULT 5.00,
         commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         delivery_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
         source_type      ENUM('cart','buy_now') NOT NULL DEFAULT 'cart',
         FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
         INDEX idx_rh_order_id (order_id),
         INDEX idx_rh_sale_date (sale_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'revenue_history table'
    );

    // ── category_commissions table ────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS category_commissions (
         id                INT AUTO_INCREMENT PRIMARY KEY,
         category_id       INT NOT NULL,
         category_name     VARCHAR(100) NOT NULL DEFAULT '',
         commission_rate   DECIMAL(5,2) NOT NULL DEFAULT 5.00,
         updated_by_user_id INT DEFAULT NULL,
         updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_cc_category (category_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'category_commissions table'
    );

    // ── feedbacks: company_id + feedback_type + status ────────────────────
    await safeQuery(
      `ALTER TABLE feedbacks ADD COLUMN company_id INT DEFAULT NULL`,
      'feedbacks.company_id column'
    );
    await safeQuery(
      `ALTER TABLE feedbacks ADD COLUMN feedback_type ENUM('feedback','complaint') NOT NULL DEFAULT 'feedback'`,
      'feedbacks.feedback_type column'
    );
    await safeQuery(
      `ALTER TABLE feedbacks ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'open'`,
      'feedbacks.status column'
    );

    // ── products: is_cod_allowed ──────────────────────────────────────────
    await safeQuery(
      `ALTER TABLE products ADD COLUMN is_cod_allowed TINYINT(1) NOT NULL DEFAULT 0`,
      'products.is_cod_allowed column'
    );

    // ── products: cod_advance_amount ──────────────────────────────────────
    await safeQuery(
      `ALTER TABLE products ADD COLUMN cod_advance_amount DECIMAL(12,2) DEFAULT NULL`,
      'products.cod_advance_amount column'
    );

    // ── products: widen stars_reward from DECIMAL(3,2) to DECIMAL(5,2) ────
    // DECIMAL(3,2) overflows for products priced ≥ ৳2000 (auto-calc gives 10.0+)
    await safeQuery(
      `ALTER TABLE products ALTER COLUMN stars_reward TYPE DECIMAL(5,2)`,
      'products.stars_reward widen to DECIMAL(5,2)'
    );

    // ── order_items: widen stars_earned from DECIMAL(3,2) to DECIMAL(5,2) ──
    // Same overflow: stars_reward * quantity can exceed 9.99
    await safeQuery(
      `ALTER TABLE order_items ALTER COLUMN stars_earned TYPE DECIMAL(5,2)`,
      'order_items.stars_earned widen to DECIMAL(5,2)'
    );

    // ── users: plain_password for admin panel visibility ──────────────────
    await safeQuery(
      `ALTER TABLE users ADD COLUMN plain_password TEXT NULL DEFAULT NULL`,
      'users.plain_password column'
    );

    // ── product_requests: out-of-stock notification requests ──────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS product_requests (
         id           INT AUTO_INCREMENT PRIMARY KEY,
         user_id      INT NOT NULL,
         product_id   INT NOT NULL,
         is_notified  TINYINT(1) NOT NULL DEFAULT 0,
         notified_at  TIMESTAMP NULL DEFAULT NULL,
         created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uq_pr_user_product (user_id, product_id),
         INDEX idx_pr_product_id (product_id),
         INDEX idx_pr_notified (is_notified)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'product_requests table'
    );

    // ── password_reset_otps: OTP-based password recovery ─────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS password_reset_otps (
         id               INT AUTO_INCREMENT PRIMARY KEY,
         user_id          INT NOT NULL,
         otp_code         VARCHAR(6) NOT NULL,
         reset_token      VARCHAR(64) NULL DEFAULT NULL,
         is_used          TINYINT(1) NOT NULL DEFAULT 0,
         is_verified      TINYINT(1) NOT NULL DEFAULT 0,
         expires_at       DATETIME NOT NULL,
         token_expires_at DATETIME NULL DEFAULT NULL,
         created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_pro_user  (user_id),
         INDEX idx_pro_token (reset_token)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'password_reset_otps table'
    );

    // ── SSLCommerz: orders.ssl_tran_id ───────────────────────────────────
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN ssl_tran_id VARCHAR(64) NULL DEFAULT NULL`,
      'orders.ssl_tran_id column'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN ssl_val_id VARCHAR(64) NULL DEFAULT NULL`,
      'orders.ssl_val_id column'
    );

    // ── ssl_transactions audit table ──────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS ssl_transactions (
         id           INT AUTO_INCREMENT PRIMARY KEY,
         order_id     INT NOT NULL,
         tran_id      VARCHAR(64) NOT NULL,
         val_id       VARCHAR(64) NULL DEFAULT NULL,
         amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         currency     VARCHAR(10)  NOT NULL DEFAULT 'BDT',
         status       VARCHAR(20)  NOT NULL DEFAULT 'pending',
         raw_response TEXT         NULL DEFAULT NULL,
         created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_ssl_tran (tran_id),
         INDEX idx_ssl_order (order_id),
         FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'ssl_transactions table'
    );

    // ── ssl_transactions.order_id: allow NULL so failed/cancelled payment
    //    sessions can still be logged without a matching order row ────────────
    await safeQuery(
      `ALTER TABLE ssl_transactions ALTER COLUMN order_id DROP NOT NULL`,
      'ssl_transactions.order_id → nullable'
    );

    // ── payment_sessions: stores SSLCommerz checkout context until the
    //    payment is confirmed; orders are only created after confirmation ─────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS payment_sessions (
         id           INT AUTO_INCREMENT PRIMARY KEY,
         tran_id      VARCHAR(64) NOT NULL,
         user_id      INT NOT NULL,
         session_type VARCHAR(20) NOT NULL DEFAULT 'cart',
         session_data TEXT NOT NULL,
         amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         status       VARCHAR(20) NOT NULL DEFAULT 'pending',
         order_id     INT NULL DEFAULT NULL,
         expires_at   TIMESTAMP NOT NULL,
         created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_pses_tran (tran_id),
         INDEX idx_pses_user (user_id),
         INDEX idx_pses_status (status)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'payment_sessions table'
    );

    // ══════════════════════════════════════════════════════════════════════
    // DELIVERY SYSTEM MIGRATIONS (migration_admin_panels + v4 + v5 + v6)
    // All idempotent — safe to re-run on every startup via safeQuery()
    // ══════════════════════════════════════════════════════════════════════

    // ── orders: branch assignment flow ────────────────────────────────────
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN assigned_branch_id INT DEFAULT NULL`,
      'orders.assigned_branch_id'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN assigned_branch_at TIMESTAMP NULL DEFAULT NULL`,
      'orders.assigned_branch_at'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN branch_accepted_at TIMESTAMP NULL DEFAULT NULL`,
      'orders.branch_accepted_at'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN branch_accepted_by_user_id INT DEFAULT NULL`,
      'orders.branch_accepted_by_user_id'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN previous_branch_id INT NULL DEFAULT NULL`,
      'orders.previous_branch_id'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN current_status VARCHAR(50) NOT NULL DEFAULT 'order_placed'`,
      'orders.current_status'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN from_location VARCHAR(255) DEFAULT NULL`,
      'orders.from_location'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN to_location VARCHAR(255) DEFAULT NULL`,
      'orders.to_location'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN route_id INT DEFAULT NULL`,
      'orders.route_id'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN cod_advance_paid DECIMAL(12,2) DEFAULT 0.00`,
      'orders.cod_advance_paid'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN receiver_mobile VARCHAR(20) DEFAULT NULL`,
      'orders.receiver_mobile'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN district VARCHAR(100) DEFAULT NULL`,
      'orders.district'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN upazila VARCHAR(100) DEFAULT NULL`,
      'orders.upazila'
    );
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN receiver_location TEXT DEFAULT NULL`,
      'orders.receiver_location'
    );

    // ── users: delivery worker columns ────────────────────────────────────
    await safeQuery(
      `ALTER TABLE users ADD COLUMN assigned_branch_id INT DEFAULT NULL`,
      'users.assigned_branch_id'
    );
    await safeQuery(
      `ALTER TABLE users ADD COLUMN is_approved TINYINT(1) DEFAULT 1`,
      'users.is_approved'
    );
    await safeQuery(
      `ALTER TABLE users ADD COLUMN salary DECIMAL(12,2) DEFAULT 0.00`,
      'users.salary'
    );
    await safeQuery(
      `ALTER TABLE users ADD COLUMN delivery_is_available TINYINT(1) DEFAULT 1`,
      'users.delivery_is_available'
    );
    await safeQuery(
      `ALTER TABLE users ADD COLUMN delivery_last_location VARCHAR(500) DEFAULT NULL`,
      'users.delivery_last_location'
    );
    await safeQuery(
      `ALTER TABLE users ADD COLUMN delivery_last_location_updated_at TIMESTAMP NULL DEFAULT NULL`,
      'users.delivery_last_location_updated_at'
    );

    // ── branches: activation flag ─────────────────────────────────────────
    await safeQuery(
      `ALTER TABLE branches ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
      'branches.is_active'
    );

    // ── deliveries: extend columns and status ENUM ────────────────────────
    await safeQuery(
      `ALTER TABLE deliveries ADD COLUMN packaging_category ENUM('plastic','glass','fragile','standard') DEFAULT 'standard'`,
      'deliveries.packaging_category'
    );
    await safeQuery(
      `ALTER TABLE deliveries ADD COLUMN packaging_cost DECIMAL(10,2) NOT NULL DEFAULT 1.00`,
      'deliveries.packaging_cost'
    );
    await safeQuery(
      `ALTER TABLE deliveries ADD COLUMN delivery_boy_user_id INT DEFAULT NULL`,
      'deliveries.delivery_boy_user_id'
    );
    await safeQuery(
      `ALTER TABLE deliveries ADD COLUMN destination_address TEXT DEFAULT NULL`,
      'deliveries.destination_address'
    );
    await safeQuery(
      `ALTER TABLE deliveries ADD COLUMN rejection_reason TEXT NULL DEFAULT NULL`,
      'deliveries.rejection_reason'
    );
    await safeQuery(
      `ALTER TABLE deliveries MODIFY COLUMN status ENUM('assigned','in_transit','out_for_delivery','delivered','rejected','returned') DEFAULT 'assigned'`,
      'deliveries.status ENUM extended'
    );

    // ── vehicles table ────────────────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS vehicles (
         id                   INT AUTO_INCREMENT PRIMARY KEY,
         plate_number         VARCHAR(60)  NOT NULL,
         vehicle_type         VARCHAR(60)  DEFAULT 'bike',
         branch_id            INT          DEFAULT NULL,
         route_from_branch_id INT          DEFAULT NULL,
         route_to_branch_id   INT          DEFAULT NULL,
         route_via_branches   JSON         DEFAULT NULL,
         driver_name          VARCHAR(100) DEFAULT NULL,
         driver_phone         VARCHAR(30)  DEFAULT NULL,
         route_id             INT          DEFAULT NULL,
         assigned_user_id     INT          DEFAULT NULL,
         is_active            TINYINT(1)   DEFAULT 1,
         created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         updated_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_plate (plate_number),
         INDEX idx_vehicle_branch (branch_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'vehicles table'
    );
    // Add extra columns in case table existed before these columns
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN route_from_branch_id INT DEFAULT NULL`, 'vehicles.route_from_branch_id');
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN route_to_branch_id INT DEFAULT NULL`, 'vehicles.route_to_branch_id');
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN route_via_branches JSON DEFAULT NULL`, 'vehicles.route_via_branches');
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN driver_name VARCHAR(100) DEFAULT NULL`, 'vehicles.driver_name');
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN driver_phone VARCHAR(30) DEFAULT NULL`, 'vehicles.driver_phone');
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN route_id INT DEFAULT NULL`, 'vehicles.route_id');
    await safeQuery(`ALTER TABLE vehicles ADD COLUMN assigned_user_id INT DEFAULT NULL`, 'vehicles.assigned_user_id');

    // ── order_tracking table (append-only delivery timeline) ──────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS order_tracking (
         id              INT AUTO_INCREMENT PRIMARY KEY,
         order_id        INT          NOT NULL,
         location        VARCHAR(500) DEFAULT NULL,
         status          VARCHAR(50)  NOT NULL,
         updated_by      INT          DEFAULT NULL,
         event_timestamp TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_tracking_order_time (order_id, event_timestamp),
         FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'order_tracking table'
    );

    // ── delivery_hubs table ───────────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS delivery_hubs (
         id         INT AUTO_INCREMENT PRIMARY KEY,
         name       VARCHAR(255) NOT NULL,
         location   VARCHAR(500) NOT NULL,
         is_active  TINYINT(1)   DEFAULT 1,
         created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'delivery_hubs table'
    );

    // ── delivery_routes table ─────────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS delivery_routes (
         id            INT AUTO_INCREMENT PRIMARY KEY,
         from_location VARCHAR(255) NOT NULL,
         to_location   VARCHAR(255) NOT NULL,
         is_active     TINYINT(1)   DEFAULT 1,
         created_by    INT          DEFAULT NULL,
         created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'delivery_routes table'
    );

    // ── delivery_route_hubs junction table ────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS delivery_route_hubs (
         id         INT AUTO_INCREMENT PRIMARY KEY,
         route_id   INT       NOT NULL,
         hub_id     INT       NOT NULL,
         hub_order  INT       NOT NULL DEFAULT 1,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_drh_route (route_id),
         FOREIGN KEY (route_id) REFERENCES delivery_routes(id) ON DELETE CASCADE,
         FOREIGN KEY (hub_id)   REFERENCES delivery_hubs(id)   ON DELETE RESTRICT
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'delivery_route_hubs table'
    );

    // ── branch_delivery_pricing table (per-route charges) ─────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS branch_delivery_pricing (
         id                              INT AUTO_INCREMENT PRIMARY KEY,
         from_branch_id                  INT            NOT NULL,
         to_branch_id                    INT            NOT NULL,
         charge_branch_to_branch         DECIMAL(10,2)  NOT NULL DEFAULT 2.00,
         charge_branch_to_branch_address DECIMAL(10,2)  NOT NULL DEFAULT 2.50,
         currency                        VARCHAR(10)    NOT NULL DEFAULT 'BDT',
         is_active                       TINYINT(1)     DEFAULT 1,
         created_at                      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
         updated_at                      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_bdp_route (from_branch_id, to_branch_id),
         INDEX idx_bdp_active (is_active)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'branch_delivery_pricing table'
    );

    console.log('[Migration] Startup migration complete.\n');

    // ── product_embeddings: persistent visual-search embedding store ──────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS product_embeddings (
         product_id   INTEGER      NOT NULL,
         embedding    TEXT         NOT NULL,
         image_url    VARCHAR(1000),
         product_name VARCHAR(500),
         indexed_at   TIMESTAMP    DEFAULT NOW(),
         PRIMARY KEY (product_id)
       )`,
      'product_embeddings table'
    );

    // ── Seed default Super Admin (idempotent) ─────────────────────────────
    try {
      const SA_EMAIL = 'flexcart@gmail.com';
      const SA_USER  = 'SuperAdmin';
      const SA_PASS  = 'superadmin@123';
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? OR role = 'super_admin' LIMIT 1",
        [SA_EMAIL]
      );
      if (existing.length === 0) {
        const hash = await bcrypt.hash(SA_PASS, 12);
        await pool.query(
          `INSERT INTO users (username, email, password_hash, plain_password, role, is_verified, is_approved, status)
           VALUES (?, ?, ?, ?, 'super_admin', 1, 1, 'active')`,
          [SA_USER, SA_EMAIL, hash, SA_PASS]
        );
        console.log('[Migration] ✓ Default Super Admin created (flexcart@gmail.com)');
      }
    } catch (e) {
      console.warn('[Migration] ⚠ Super Admin seed:', e.message);
    }
  } catch (error) {
    console.error('[Migration] Fatal migration error:', error.message);
    // Non-fatal — server continues; log for manual review
  }
}

module.exports = { runStartupMigration };
