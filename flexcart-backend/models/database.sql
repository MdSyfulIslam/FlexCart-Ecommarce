-- FlexCart Database Schema
-- Run this SQL file in MySQL to create all tables

CREATE DATABASE IF NOT EXISTS flexcart_db;
USE flexcart_db;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    country VARCHAR(100) DEFAULT NULL,
    zip_code VARCHAR(20) DEFAULT NULL,
    profile_image VARCHAR(500) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    date_of_birth DATE DEFAULT NULL,
    gender ENUM('male', 'female', 'other') DEFAULT NULL,
    points INT DEFAULT 0,
    stars DECIMAL(3,2) DEFAULT 0.00,
    earned_stars DECIMAL(10,2) DEFAULT 0.00,
    spent_stars DECIMAL(10,2) DEFAULT 0.00,
    theme ENUM('light', 'dark') DEFAULT 'light',
    background_image VARCHAR(500) DEFAULT NULL,
    appearance_color VARCHAR(20) DEFAULT '#4F46E5',
    role ENUM('customer','seller','staff_admin','delivery_admin','super_admin','delivery_boy') NOT NULL DEFAULT 'customer',
    is_seller TINYINT(1) DEFAULT 0,
    is_verified TINYINT(1) DEFAULT 0,
    last_spin_date DATETIME DEFAULT NULL,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER SESSIONS (for switch account feature)
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(500) NOT NULL,
    device_info VARCHAR(255) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token(255)),
    INDEX idx_user_active (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LINKED ACCOUNTS (switch account feature)
-- ============================================
CREATE TABLE IF NOT EXISTS linked_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    primary_user_id INT NOT NULL,
    linked_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_link (primary_user_id, linked_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- COMPANIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    company_logo VARCHAR(500) DEFAULT NULL,
    cover_image VARCHAR(500) DEFAULT NULL,
    promo_banner VARCHAR(500) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    contact_email VARCHAR(255) DEFAULT NULL,
    contact_phone VARCHAR(20) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    country VARCHAR(100) DEFAULT NULL,
    nid_image VARCHAR(500) NOT NULL,
    nid_front_image VARCHAR(500) DEFAULT NULL,
    nid_back_image VARCHAR(500) DEFAULT NULL,
    face_image VARCHAR(500) DEFAULT NULL,
    nid_number VARCHAR(100) NOT NULL,
    website VARCHAR(500) DEFAULT NULL,
    category VARCHAR(100) DEFAULT NULL,
    is_verified TINYINT(1) DEFAULT 0,
    verification_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    rejection_reason TEXT DEFAULT NULL,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_ratings INT DEFAULT 0,
    total_sales INT DEFAULT 0,
    badge ENUM('bronze','silver','gold','crown','diamond') DEFAULT 'bronze',
    total_revenue DECIMAL(15,2) DEFAULT 0.00,
    follower_count INT DEFAULT 0,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_company_name (company_name),
    INDEX idx_user_id (user_id),
    INDEX idx_category (category),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PRODUCT CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT DEFAULT NULL,
    icon VARCHAR(100) DEFAULT NULL,
    parent_id INT DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    category_id INT DEFAULT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    old_price DECIMAL(12,2) NOT NULL,
    current_price DECIMAL(12,2) NOT NULL,
    min_price DECIMAL(12,2) DEFAULT NULL,
    max_price DECIMAL(12,2) DEFAULT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    promo_code VARCHAR(50) DEFAULT NULL,
    promo_discount_type ENUM('percentage','fixed') DEFAULT 'percentage',
    promo_discount_value DECIMAL(10,2) DEFAULT 0.00,
    stock_quantity INT DEFAULT 0,
    is_in_stock TINYINT(1) DEFAULT 1,
    is_negotiable TINYINT(1) DEFAULT 0,
    is_ar_3d TINYINT(1) DEFAULT 0,
    ar_qr_image VARCHAR(500) DEFAULT NULL,
    ar_url VARCHAR(1000) DEFAULT NULL,
    image_url VARCHAR(500) DEFAULT NULL,
    images JSON DEFAULT NULL,
    tags JSON DEFAULT NULL,
    points_reward INT DEFAULT 0,
    stars_reward DECIMAL(3,2) DEFAULT 0.00,
    total_sold INT DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_ratings INT DEFAULT 0,
    weight VARCHAR(50) DEFAULT NULL,
    dimensions VARCHAR(100) DEFAULT NULL,
    brand VARCHAR(100) DEFAULT NULL,
    model VARCHAR(100) DEFAULT NULL,
    color VARCHAR(50) DEFAULT NULL,
    warranty VARCHAR(100) DEFAULT NULL,
    age_group ENUM('all', 'kids', 'teens', 'adults', 'seniors') DEFAULT 'all',
    status ENUM('active', 'inactive', 'deleted') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_company (company_id),
    INDEX idx_category (category_id),
    INDEX idx_price (current_price),
    INDEX idx_stock (is_in_stock),
    INDEX idx_status (status),
    INDEX idx_rating (rating),
    INDEX idx_total_sold (total_sold),
    FULLTEXT idx_search (name, description, brand, model, color)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CART TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cart (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT DEFAULT 1,
    negotiated_price DECIMAL(12,2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_cart_item (user_id, product_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    total_amount DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0.00,
    points_used INT DEFAULT 0,
    promo_code VARCHAR(50) DEFAULT NULL,
    payment_method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash_on_delivery', 'points') DEFAULT 'cash_on_delivery',
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    order_status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned') DEFAULT 'pending',
    shipping_address TEXT NOT NULL,
    shipping_city VARCHAR(100) DEFAULT NULL,
    shipping_country VARCHAR(100) DEFAULT NULL,
    shipping_zip VARCHAR(20) DEFAULT NULL,
    tracking_number VARCHAR(100) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    delivered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_order_number (order_number),
    INDEX idx_status (order_status),
    INDEX idx_payment_status (payment_status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- BRANCHES TABLE (FlexCart branches)
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    address TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed sample branches (edit as needed)
INSERT INTO branches (name, address) VALUES
('Branch 1', 'FlexCart Branch 1'),
('Branch 2', 'FlexCart Branch 2')
ON DUPLICATE KEY UPDATE
    address = VALUES(address);

-- ============================================
-- BRANCH DELIVERY PRICING (fixed route charges)
-- ============================================
CREATE TABLE IF NOT EXISTS branch_delivery_pricing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_branch_id INT NOT NULL,
    to_branch_id INT NOT NULL,
    charge_branch_to_branch DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    charge_branch_to_branch_address DECIMAL(10,2) NOT NULL DEFAULT 2.50,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_route (from_branch_id, to_branch_id),
    FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default pricing for Branch 1 <-> Branch 2
INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
SELECT b1.id, b2.id, 2.00, 2.50
FROM branches b1
JOIN branches b2 ON b2.name = 'Branch 2'
WHERE b1.name = 'Branch 1'
ON DUPLICATE KEY UPDATE
    charge_branch_to_branch = VALUES(charge_branch_to_branch),
    charge_branch_to_branch_address = VALUES(charge_branch_to_branch_address),
    is_active = 1;

INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
SELECT b2.id, b1.id, 2.00, 2.50
FROM branches b1
JOIN branches b2 ON b2.name = 'Branch 2'
WHERE b1.name = 'Branch 1'
ON DUPLICATE KEY UPDATE
    charge_branch_to_branch = VALUES(charge_branch_to_branch),
    charge_branch_to_branch_address = VALUES(charge_branch_to_branch_address),
    is_active = 1;

-- ============================================
-- DELIVERIES TABLE (delivery-admin assignments + delivery proof)
-- ============================================
CREATE TABLE IF NOT EXISTS deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    from_branch_id INT NOT NULL,
    to_branch_id INT NOT NULL,
    delivery_type ENUM('branch_to_branch','branch_to_branch_address') NOT NULL,
    weight_kg DECIMAL(6,1) NOT NULL,
    size_feet INT NOT NULL,
    price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0.40,
    price_per_foot DECIMAL(10,2) NOT NULL DEFAULT 0.60,
    cost_weight DECIMAL(10,2) NOT NULL,
    cost_size DECIMAL(10,2) NOT NULL,
    cost_route DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL,
    delivery_boy_name VARCHAR(120) NOT NULL,
    delivery_boy_phone VARCHAR(30) NOT NULL,
    vehicle_plate VARCHAR(60) NOT NULL,
    assigned_by_user_id INT NOT NULL,
    seller_paid_cash TINYINT(1) DEFAULT 1,
    status ENUM('assigned','in_transit','delivered') DEFAULT 'assigned',
    proof_image_url VARCHAR(500) DEFAULT NULL,
    proof_lat DECIMAL(10,7) DEFAULT NULL,
    proof_lng DECIMAL(10,7) DEFAULT NULL,
    proof_notes TEXT DEFAULT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
    FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY unique_delivery_per_order (order_id),
    INDEX idx_driver_phone_status (delivery_boy_phone, status),
    INDEX idx_assigned_at (assigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ORDER ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    points_earned INT DEFAULT 0,
    stars_earned DECIMAL(3,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_order (order_id),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FAVOURITES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS favourites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_favourite (user_id, product_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PRODUCT REQUESTS (out of stock requests)
-- ============================================
CREATE TABLE IF NOT EXISTS product_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    is_notified TINYINT(1) DEFAULT 0,
    notified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_request (user_id, product_id),
    INDEX idx_user (user_id),
    INDEX idx_product_notified (product_id, is_notified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FOLLOWING COMPANIES
-- ============================================
CREATE TABLE IF NOT EXISTS company_followers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    company_id INT NOT NULL,
    notifications_enabled TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (user_id, company_id),
    INDEX idx_user (user_id),
    INDEX idx_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SPIN & REWARD TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS spin_rewards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reward_type ENUM('points', 'discount', 'stars', 'nothing') NOT NULL,
    reward_value DECIMAL(10,2) DEFAULT 0.00,
    promo_code VARCHAR(50) DEFAULT NULL,
    promo_expiry TIMESTAMP NULL,
    is_used TINYINT(1) DEFAULT 0,
    spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_promo (promo_code),
    INDEX idx_spun_at (spun_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('order_confirmed', 'order_shipped', 'order_delivered', 'product_back_in_stock', 'comment_reply', 'review_opinion', 'discount_offer', 'spin_reward', 'system', 'company_update') NOT NULL,
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
-- FEEDBACK TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS feedbacks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    name VARCHAR(100) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    subject VARCHAR(255) DEFAULT NULL,
    message TEXT NOT NULL,
    status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
    admin_reply TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PRODUCT REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS product_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    order_id INT DEFAULT NULL,
    rating DECIMAL(2,1) NOT NULL,
    review_text TEXT DEFAULT NULL,
    seller_reply TEXT DEFAULT NULL,
    seller_reply_at TIMESTAMP NULL DEFAULT NULL,
    is_verified_purchase TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_product (product_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- COMPANY RATINGS
-- ============================================
CREATE TABLE IF NOT EXISTS company_ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    company_id INT NOT NULL,
    rating DECIMAL(2,1) NOT NULL,
    review_text TEXT DEFAULT NULL,
    stars_spent DECIMAL(3,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_rating (user_id, company_id),
    INDEX idx_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SUPPORT INFO TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS support_info (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('phone', 'email', 'address', 'social', 'hours', 'faq') NOT NULL,
    label VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    icon VARCHAR(100) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- AI SEARCH HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS ai_search_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    image_path VARCHAR(500) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    results JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    language VARCHAR(10) DEFAULT 'en',
    currency VARCHAR(10) DEFAULT 'USD',
    email_notifications TINYINT(1) DEFAULT 1,
    push_notifications TINYINT(1) DEFAULT 1,
    order_updates TINYINT(1) DEFAULT 1,
    promotional_emails TINYINT(1) DEFAULT 0,
    two_factor_auth TINYINT(1) DEFAULT 0,
    privacy_profile ENUM('public', 'private') DEFAULT 'public',
    auto_play_animations TINYINT(1) DEFAULT 1,
    data_sharing TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- BACKGROUND THEMES
-- ============================================
CREATE TABLE IF NOT EXISTS background_themes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('image', '2d', '3d', 'weather') NOT NULL,
    preview_url VARCHAR(500) NOT NULL,
    resource_url VARCHAR(500) NOT NULL,
    category VARCHAR(50) DEFAULT NULL,
    is_premium TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROMO CODES
-- ============================================
CREATE TABLE IF NOT EXISTS promo_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type ENUM('percentage', 'fixed') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(12,2) DEFAULT 0.00,
    max_uses INT DEFAULT NULL,
    current_uses INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INSERT DEMO DATA
-- ============================================

-- Insert Categories
INSERT INTO categories (name, description, icon) VALUES
('Electronics', 'Electronic devices and gadgets', 'laptop'),
('Clothing', 'Fashion and apparel', 'shirt'),
('Home & Kitchen', 'Home appliances and kitchenware', 'home'),
('Books', 'Books and educational materials', 'book'),
('Sports', 'Sports equipment and accessories', 'dumbbell'),
('Beauty', 'Beauty and personal care', 'sparkles'),
('Toys', 'Toys and games', 'gamepad'),
('Automotive', 'Automotive parts and accessories', 'car'),
('Health', 'Health and wellness', 'heart'),
('Furniture', 'Furniture and decor', 'couch')
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    icon = VALUES(icon);

-- Insert Support Info
INSERT INTO support_info (type, label, value, icon, sort_order) VALUES
('phone', 'Customer Support', '+1-800-FLEXCART', 'phone', 1),
('phone', 'Technical Support', '+1-800-FLEX-TECH', 'phone', 2),
('email', 'General Inquiries', 'info@flexcart.com', 'mail', 3),
('email', 'Support Email', 'support@flexcart.com', 'mail', 4),
('address', 'Head Office', '123 Commerce Street, Tech City, TC 12345', 'map-pin', 5),
('hours', 'Business Hours', 'Mon-Fri: 9AM-6PM, Sat: 10AM-4PM', 'clock', 6),
('social', 'Facebook', 'https://facebook.com/flexcart', 'facebook', 7),
('social', 'Twitter', 'https://twitter.com/flexcart', 'twitter', 8),
('faq', 'Return Policy', 'You can return any product within 30 days of purchase', 'help-circle', 9),
('faq', 'Shipping', 'Free shipping on orders above $50', 'truck', 10)
ON DUPLICATE KEY UPDATE label = label;

-- Insert Background Themes
INSERT INTO background_themes (name, type, preview_url, resource_url, category, sort_order) VALUES
('Ocean Wave', '3d', '/assets/images/backgrounds/ocean_preview.jpg', '/assets/animations/ocean.json', 'nature', 1),
('Starry Night', '3d', '/assets/images/backgrounds/stars_preview.jpg', '/assets/animations/stars.json', 'space', 2),
('Forest Rain', '3d', '/assets/images/backgrounds/forest_preview.jpg', '/assets/animations/forest.json', 'nature', 3),
('City Lights', '2d', '/assets/images/backgrounds/city_preview.jpg', '/assets/images/backgrounds/city.jpg', 'urban', 4),
('Sunset Gradient', '2d', '/assets/images/backgrounds/sunset_preview.jpg', '/assets/images/backgrounds/sunset.jpg', 'gradient', 5),
('Snow Fall', '3d', '/assets/images/backgrounds/snow_preview.jpg', '/assets/animations/snow.json', 'weather', 6),
('Abstract Flow', '2d', '/assets/images/backgrounds/abstract_preview.jpg', '/assets/images/backgrounds/abstract.jpg', 'abstract', 7),
('Mountain View', 'image', '/assets/images/backgrounds/mountain_preview.jpg', '/assets/images/backgrounds/mountain.jpg', 'nature', 8),
('Minimal White', '2d', '/assets/images/backgrounds/minimal_preview.jpg', '/assets/images/backgrounds/minimal.jpg', 'minimal', 9),
('Dark Mesh', '2d', '/assets/images/backgrounds/mesh_preview.jpg', '/assets/images/backgrounds/mesh.jpg', 'dark', 10);

-- Insert Promo Codes
INSERT INTO promo_codes (code, discount_type, discount_value, min_order_amount, max_uses, expires_at) VALUES
('WELCOME10', 'percentage', 10.00, 20.00, 1000, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
('SAVE20', 'percentage', 20.00, 50.00, 500, DATE_ADD(NOW(), INTERVAL 6 MONTH)),
('FLAT5', 'fixed', 5.00, 15.00, 2000, DATE_ADD(NOW(), INTERVAL 3 MONTH)),
('MEGA30', 'percentage', 30.00, 100.00, 100, DATE_ADD(NOW(), INTERVAL 1 MONTH)),
('FLEXFIRST', 'percentage', 15.00, 0.00, NULL, DATE_ADD(NOW(), INTERVAL 1 YEAR))
ON DUPLICATE KEY UPDATE
    discount_type = VALUES(discount_type),
    discount_value = VALUES(discount_value),
    min_order_amount = VALUES(min_order_amount),
    max_uses = VALUES(max_uses),
    expires_at = VALUES(expires_at),
    is_active = 1;

-- ============================================
-- PRODUCT COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS product_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    parent_id INT DEFAULT NULL,
    comment_text TEXT NOT NULL,
    is_read_by_company TINYINT(1) DEFAULT 0,
    status ENUM('active','hidden','deleted') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES product_comments(id) ON DELETE SET NULL,
    INDEX idx_product (product_id),
    INDEX idx_user (user_id),
    INDEX idx_company_read (company_id, is_read_by_company),
    INDEX idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- COMPANY NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS company_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    type ENUM('new_comment','new_order','new_review','new_follower','product_sold','system') NOT NULL DEFAULT 'system',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id INT DEFAULT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_read (company_id, is_read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- GLOBAL NID REGISTRY (for company creation validation)
-- ============================================
CREATE TABLE IF NOT EXISTS global_nid_registry (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nid_number VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE DEFAULT NULL,
    status ENUM('active','inactive','blacklisted') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nid (nid_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert Global NID Registry (sample valid NIDs for company creation)
INSERT INTO global_nid_registry (nid_number, full_name, date_of_birth, status) VALUES
('1234567890', 'John Doe',       '1990-05-15', 'active'),
('2345678901', 'Jane Smith',     '1988-11-22', 'active'),
('3456789012', 'Robert Johnson', '1995-03-08', 'active'),
('4567890123', 'Emily Davis',    '1992-07-30', 'active'),
('5678901234', 'Michael Wilson', '1985-01-17', 'active'),
('6789012345', 'Sarah Brown',    '1993-09-25', 'active'),
('7890123456', 'David Lee',      '1991-12-04', 'active'),
('8901234567', 'Lisa Anderson',  '1987-06-11', 'active'),
('9012345678', 'James Taylor',   '1994-02-28', 'active'),
('0123456789', 'Maria Garcia',   '1989-08-19', 'active')
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    date_of_birth = VALUES(date_of_birth),
    status = VALUES(status);



-- ============================================
-- PRODUCT IMAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    is_primary TINYINT(1) DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product (product_id),
    INDEX idx_primary (is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- COMPANY PROMO CODES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS company_promo_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    product_id INT DEFAULT NULL,
    code VARCHAR(50) NOT NULL,
    discount_type ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(12,2) DEFAULT 0.00,
    max_uses INT DEFAULT NULL,
    current_uses INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    UNIQUE KEY unique_company_code (company_id, code),
    INDEX idx_code (code),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- AI NEGOTIATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_negotiations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    offered_price DECIMAL(12,2) DEFAULT NULL,
    final_price DECIMAL(12,2) DEFAULT NULL,
    status ENUM('active','accepted','rejected','expired') DEFAULT 'active',
    customer_total_purchases DECIMAL(15,2) DEFAULT 0.00,
    customer_order_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_user_product (user_id, product_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- AI NEGOTIATION MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_negotiation_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negotiation_id INT NOT NULL,
    sender ENUM('user','ai') NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    message_text TEXT NOT NULL,
    offered_price DECIMAL(12,2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negotiation_id) REFERENCES ai_negotiations(id) ON DELETE CASCADE,
    INDEX idx_negotiation (negotiation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- COMPANY LEADERBOARD VIEW
-- ============================================
CREATE OR REPLACE VIEW company_leaderboard AS
    SELECT c.id, c.company_name, c.company_logo, c.badge,
           c.total_revenue, c.total_sales, c.rating,
           c.total_ratings, c.follower_count, c.created_at,
           u.username AS owner_name,
           RANK() OVER (ORDER BY c.total_revenue DESC) AS `rank`
    FROM companies c
    JOIN users u ON c.user_id = u.id
    WHERE c.status = 'active'
    ORDER BY c.total_revenue DESC;

-- ============================================
-- USER PRODUCT INTERACTIONS (recommendations)
-- ============================================
-- Used to track lightweight behavioural events (view/search) for personalized recommendations.
CREATE TABLE IF NOT EXISTS user_product_interactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    interaction_type ENUM('view', 'search') NOT NULL,
    product_id INT DEFAULT NULL,
    search_query VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    INDEX idx_user_type_created (user_id, interaction_type, created_at),
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;