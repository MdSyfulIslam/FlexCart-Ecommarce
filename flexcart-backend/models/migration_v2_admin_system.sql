-- ============================================================
-- FlexCart Admin System v2 Migration
-- Run AFTER database.sql and migration_admin_panels.sql
-- Adds centralized audit logging for all admin actions
-- ============================================================

USE flexcart_db;

-- ============================================================
-- ADMIN AUDIT LOG
-- Tracks every create/update/delete action by any admin
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    admin_user_id INT NOT NULL,
    admin_role  VARCHAR(50) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50)  DEFAULT NULL,
    target_id   INT          DEFAULT NULL,
    details     JSON         DEFAULT NULL,
    ip_address  VARCHAR(45)  DEFAULT NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin   (admin_user_id),
    INDEX idx_action  (action),
    INDEX idx_created (created_at),
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMPANIES TABLE — Add missing columns (safe for existing DBs)
-- Uses INFORMATION_SCHEMA checks so re-running is safe
-- ============================================================

-- nid_front_image
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'nid_front_image');
SET @sql = IF(@col = 0,
    'ALTER TABLE companies ADD COLUMN nid_front_image VARCHAR(500) DEFAULT NULL AFTER nid_image',
    'SELECT 1 -- nid_front_image already exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- nid_back_image
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'nid_back_image');
SET @sql = IF(@col = 0,
    'ALTER TABLE companies ADD COLUMN nid_back_image VARCHAR(500) DEFAULT NULL AFTER nid_front_image',
    'SELECT 1 -- nid_back_image already exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- face_image
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'face_image');
SET @sql = IF(@col = 0,
    'ALTER TABLE companies ADD COLUMN face_image VARCHAR(500) DEFAULT NULL AFTER nid_back_image',
    'SELECT 1 -- face_image already exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- rejection_reason  ← THE CRITICAL MISSING COLUMN
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'rejection_reason');
SET @sql = IF(@col = 0,
    'ALTER TABLE companies ADD COLUMN rejection_reason TEXT DEFAULT NULL AFTER verification_status',
    'SELECT 1 -- rejection_reason already exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- NOTE: Do NOT insert the Super Admin here (no hardcoded hash).
-- Run: node scripts/createSuperAdmin.js   (from flexcart-backend/)
-- ============================================================

