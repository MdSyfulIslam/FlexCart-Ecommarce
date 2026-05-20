-- FlexCart Admin Panels Migration
-- Run this SQL after the main database.sql

USE flexcart_db;

-- ============================================
-- ADD PACKAGING & CATEGORY FIELDS TO DELIVERIES
-- ============================================
ALTER TABLE deliveries
  ADD COLUMN packaging_category ENUM('plastic','glass','fragile','standard') DEFAULT 'standard' AFTER size_feet,
  ADD COLUMN packaging_cost DECIMAL(10,2) NOT NULL DEFAULT 1.00 AFTER packaging_category,
  ADD COLUMN delivery_boy_user_id INT DEFAULT NULL AFTER vehicle_plate,
  ADD COLUMN destination_address TEXT DEFAULT NULL AFTER delivery_type;

-- Add FK if delivery boy has a user account
ALTER TABLE deliveries
  ADD INDEX idx_delivery_boy_user (delivery_boy_user_id);

-- ============================================
-- ADD BRANCH ASSIGNMENT TO USERS
-- ============================================
ALTER TABLE users
  ADD COLUMN assigned_branch_id INT DEFAULT NULL AFTER role,
  ADD COLUMN is_approved TINYINT(1) DEFAULT 1 AFTER assigned_branch_id,
  ADD COLUMN salary DECIMAL(12,2) DEFAULT 0.00 AFTER is_approved;

-- ============================================
-- VEHICLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(60) NOT NULL UNIQUE,
    vehicle_type VARCHAR(60) DEFAULT 'bike',
    branch_id INT DEFAULT NULL,
    assigned_user_id INT DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
    INDEX idx_branch (branch_id),
    INDEX idx_plate (plate_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ADMIN REQUESTS (staff -> super admin approval)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requester_user_id INT NOT NULL,
    request_type ENUM('account_approval','branch_create','personnel_create','other') NOT NULL,
    title VARCHAR(255) NOT NULL,
    details JSON DEFAULT NULL,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    reviewed_by_user_id INT DEFAULT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_requester (requester_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ADMIN NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'system',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id INT DEFAULT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PLATFORM SETTINGS (super admin configurable)
-- ============================================
CREATE TABLE IF NOT EXISTS platform_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    updated_by_user_id INT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default platform settings
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
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ============================================
-- AD PROMOTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ad_promotions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    advertiser_name VARCHAR(255) NOT NULL,
    company_id INT DEFAULT NULL,
    banner_image VARCHAR(500) NOT NULL,
    link_url VARCHAR(500) DEFAULT NULL,
    fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    INDEX idx_active_dates (is_active, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
