-- ============================================================
-- Migration v6: Delivery Zone Pricing + Revenue History
-- Run after migration_admin_panels.sql
-- ============================================================

-- Fix shipping_address: allow NULL (removed from frontend checkout)
ALTER TABLE orders MODIFY COLUMN shipping_address TEXT NULL DEFAULT NULL;

-- Add delivery_charge column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- ── New platform settings for zone-based delivery ────────────
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('delivery_inside_dhaka',    '60.00',  'Base delivery charge inside Dhaka (BDT)'),
  ('delivery_outside_dhaka',   '120.00', 'Base delivery charge outside Dhaka (BDT)'),
  ('delivery_extra_per_item',  '30.00',  'Additional charge per extra item beyond the first (BDT)')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description);

-- Remove old weight/size settings that are no longer used (safe: only if they exist)
DELETE FROM platform_settings WHERE setting_key IN ('cost_per_kg','cost_per_foot','packaging_plastic','packaging_glass','packaging_fragile','packaging_standard','route_branch_to_branch','route_branch_to_address');

-- ── Revenue history table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_id        INT NOT NULL,
  order_number    VARCHAR(50) NOT NULL,
  sale_date       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  product_total   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  commission_rate DECIMAL(5,2)  NOT NULL DEFAULT 5.00,
  commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  delivery_revenue  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  source_type     ENUM('cart','buy_now') NOT NULL DEFAULT 'cart',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id),
  INDEX idx_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Category commissions table ────────────────────────────────
CREATE TABLE IF NOT EXISTS category_commissions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  category_id     INT NOT NULL,
  category_name   VARCHAR(100) NOT NULL DEFAULT '',
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  updated_by_user_id INT DEFAULT NULL,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── products: COD flag ────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_cod_allowed TINYINT(1) NOT NULL DEFAULT 0;

-- ── feedbacks: complaint tracking ────────────────────────────
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS company_id INT DEFAULT NULL;
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS feedback_type ENUM('feedback','complaint') NOT NULL DEFAULT 'feedback';
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open';

-- ── product_requests: out-of-stock notification requests ─────
CREATE TABLE IF NOT EXISTS product_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  product_id   INT NOT NULL,
  is_notified  TINYINT(1) NOT NULL DEFAULT 0,
  notified_at  TIMESTAMP NULL DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pr_user_product (user_id, product_id),
  INDEX idx_pr_product_id (product_id),
  INDEX idx_pr_notified (is_notified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
