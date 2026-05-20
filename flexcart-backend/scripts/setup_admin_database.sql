-- ============================================================
-- FlexCart Admin System — Direct SQL Setup
-- ============================================================
-- Run this in MySQL Workbench or phpMyAdmin if you cannot
-- run Node.js scripts, OR if the Node.js setup.js fails.
--
-- IMPORTANT: Replace the bcrypt hash at the bottom with a
-- freshly generated one. You can generate it at:
--   https://bcrypt-generator.com/  (12 rounds)
-- OR run:  node -e "const b=require('bcryptjs');b.hash('SuperAdmin@2024',12).then(h=>console.log(h))"
--
-- After running this script, your login will be:
--   URL:      http://localhost:3000/admin/login
--   Email:    superadmin@flexcart.com
--   Password: SuperAdmin@2024
-- ============================================================

USE flexcart_db;

-- ── 1. Add missing columns to users ──────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS role             ENUM('customer','seller','staff_admin','delivery_admin','super_admin','delivery_boy') NOT NULL DEFAULT 'customer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved        TINYINT(1) DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_branch_id INT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary             DECIMAL(12,2) DEFAULT 0.00;

-- Set all NULL is_approved rows to 1 (approved by default)
UPDATE users SET is_approved = 1 WHERE is_approved IS NULL;

-- ── 2. Create admin_audit_log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Create vehicles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. Create admin_notifications ────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. Create platform_settings ───────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    setting_key        VARCHAR(100) NOT NULL UNIQUE,
    setting_value      VARCHAR(255) NOT NULL,
    description        VARCHAR(255) DEFAULT NULL,
    updated_by_user_id INT DEFAULT NULL,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
    ('commission_rate',        '5.00',  'Commission percentage per product purchase'),
    ('cost_per_kg',            '0.40',  'Delivery cost per kilogram'),
    ('cost_per_foot',          '0.60',  'Delivery cost per foot of size'),
    ('packaging_plastic',      '1.00',  'Packaging cost for plastic category'),
    ('packaging_glass',        '1.50',  'Packaging cost for glass category'),
    ('packaging_fragile',      '2.00',  'Packaging cost for fragile category'),
    ('packaging_standard',     '1.00',  'Packaging cost for standard category'),
    ('route_branch_to_branch', '2.00',  'Default branch-to-branch delivery charge'),
    ('route_branch_to_address','2.50',  'Default branch-to-address delivery charge')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ── 6. Create ad_promotions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_promotions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. Create / Update Super Admin ────────────────────────────────
-- This is a bcrypt hash of 'SuperAdmin@2024' with 12 rounds.
-- If it does not work, generate a fresh one with the command at the top.
SET @admin_hash = '$2a$12$ccaaqtTmvBbR//FXgo/RJeEA8PSTINNKT0dzmP0T6f7xobJUWqsDa';
SET @admin_email = 'superadmin@flexcart.com';

-- Insert if not exists
INSERT IGNORE INTO users (username, email, password_hash, role, is_verified, is_approved, status)
VALUES ('SuperAdmin', @admin_email, @admin_hash, 'super_admin', 1, 1, 'active');

-- If it already existed, force-update the hash + status
UPDATE users
SET password_hash = @admin_hash,
    status        = 'active',
    is_approved   = 1,
    is_verified   = 1
WHERE email = @admin_email;

-- ── 8. Verify ─────────────────────────────────────────────────────
SELECT
    id,
    username,
    email,
    role,
    status,
    is_approved,
    is_verified,
    LEFT(password_hash, 30) AS hash_preview
FROM users
WHERE email = 'superadmin@flexcart.com';

-- ============================================================
-- DONE. Run the Node.js server and go to:
--   http://localhost:3000/admin/login
--   Email:    superadmin@flexcart.com
--   Password: SuperAdmin@2024
-- ============================================================
