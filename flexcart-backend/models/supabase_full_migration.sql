-- ============================================================
-- FlexCart — Full PostgreSQL Migration for Supabase
-- Run this ONCE in Supabase SQL Editor (paste & click Run)
-- ============================================================

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
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
    gender VARCHAR(20) DEFAULT NULL,
    points INT DEFAULT 0,
    stars DECIMAL(3,2) DEFAULT 0.00,
    earned_stars DECIMAL(10,2) DEFAULT 0.00,
    spent_stars DECIMAL(10,2) DEFAULT 0.00,
    theme VARCHAR(20) DEFAULT 'light',
    background_image VARCHAR(500) DEFAULT NULL,
    appearance_color VARCHAR(20) DEFAULT '#4F46E5',
    role VARCHAR(100) NOT NULL DEFAULT 'customer',
    is_seller SMALLINT DEFAULT 0,
    is_verified SMALLINT DEFAULT 0,
    is_approved SMALLINT DEFAULT 1,
    last_spin_date TIMESTAMP DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active',
    assigned_branch_id INT DEFAULT NULL,
    salary DECIMAL(12,2) DEFAULT 0.00,
    delivery_is_available SMALLINT DEFAULT 1,
    delivery_last_location VARCHAR(500) DEFAULT NULL,
    delivery_last_location_updated_at TIMESTAMP DEFAULT NULL,
    plain_password VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ============================================
-- USER SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(500) NOT NULL,
    device_info VARCHAR(255) DEFAULT NULL,
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_active);

-- ============================================
-- LINKED ACCOUNTS
-- ============================================
CREATE TABLE IF NOT EXISTS linked_accounts (
    id SERIAL PRIMARY KEY,
    primary_user_id INT NOT NULL,
    linked_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_link UNIQUE (primary_user_id, linked_user_id)
);

-- ============================================
-- CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT DEFAULT NULL,
    icon VARCHAR(100) DEFAULT NULL,
    parent_id INT DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- ============================================
-- COMPANIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
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
    nid_image VARCHAR(500) NOT NULL DEFAULT '',
    nid_front_image VARCHAR(500) DEFAULT NULL,
    nid_back_image VARCHAR(500) DEFAULT NULL,
    face_image VARCHAR(500) DEFAULT NULL,
    nid_number VARCHAR(100) NOT NULL DEFAULT '',
    website VARCHAR(500) DEFAULT NULL,
    category VARCHAR(100) DEFAULT NULL,
    is_verified SMALLINT DEFAULT 0,
    verification_status VARCHAR(20) DEFAULT 'pending',
    rejection_reason TEXT DEFAULT NULL,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_ratings INT DEFAULT 0,
    total_sales INT DEFAULT 0,
    badge VARCHAR(20) DEFAULT 'bronze',
    total_revenue DECIMAL(15,2) DEFAULT 0.00,
    follower_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    category_id INT DEFAULT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    old_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    current_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    min_price DECIMAL(12,2) DEFAULT NULL,
    max_price DECIMAL(12,2) DEFAULT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    promo_code VARCHAR(50) DEFAULT NULL,
    promo_discount_type VARCHAR(20) DEFAULT 'percentage',
    promo_discount_value DECIMAL(10,2) DEFAULT 0.00,
    stock_quantity INT DEFAULT 0,
    is_in_stock SMALLINT DEFAULT 1,
    is_negotiable SMALLINT DEFAULT 0,
    is_ar_3d SMALLINT DEFAULT 0,
    ar_qr_image VARCHAR(500) DEFAULT NULL,
    ar_url VARCHAR(1000) DEFAULT NULL,
    image_url VARCHAR(500) DEFAULT NULL,
    images JSONB DEFAULT NULL,
    tags JSONB DEFAULT NULL,
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
    age_group VARCHAR(20) DEFAULT 'all',
    cod_advance_amount DECIMAL(12,2) DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(current_price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(is_in_stock);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating);

-- ============================================
-- PRODUCT IMAGES
-- ============================================
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    is_primary SMALLINT DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- ============================================
-- CART TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cart (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT DEFAULT 1,
    negotiated_price DECIMAL(12,2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT unique_cart_item UNIQUE (user_id, product_id)
);

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    total_amount DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0.00,
    points_used INT DEFAULT 0,
    promo_code VARCHAR(50) DEFAULT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash_on_delivery',
    payment_status VARCHAR(20) DEFAULT 'pending',
    order_status VARCHAR(30) DEFAULT 'pending',
    current_status VARCHAR(100) DEFAULT 'order_placed',
    shipping_address TEXT NOT NULL DEFAULT '',
    shipping_city VARCHAR(100) DEFAULT NULL,
    shipping_country VARCHAR(100) DEFAULT NULL,
    shipping_zip VARCHAR(20) DEFAULT NULL,
    tracking_number VARCHAR(100) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    cod_advance_paid DECIMAL(12,2) DEFAULT NULL,
    receiver_mobile VARCHAR(20) DEFAULT NULL,
    district VARCHAR(100) DEFAULT NULL,
    upazila VARCHAR(100) DEFAULT NULL,
    receiver_location TEXT DEFAULT NULL,
    assigned_branch_id INT DEFAULT NULL,
    assigned_branch_at TIMESTAMP DEFAULT NULL,
    branch_accepted_at TIMESTAMP DEFAULT NULL,
    branch_accepted_by_user_id INT DEFAULT NULL,
    from_location VARCHAR(255) DEFAULT NULL,
    to_location VARCHAR(255) DEFAULT NULL,
    route_id INT DEFAULT NULL,
    delivered_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ============================================
-- ORDER ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
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
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ============================================
-- BRANCHES
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    address TEXT DEFAULT NULL,
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- BRANCH DELIVERY PRICING
-- ============================================
CREATE TABLE IF NOT EXISTS branch_delivery_pricing (
    id SERIAL PRIMARY KEY,
    from_branch_id INT NOT NULL,
    to_branch_id INT NOT NULL,
    charge_branch_to_branch DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    charge_branch_to_branch_address DECIMAL(10,2) NOT NULL DEFAULT 2.50,
    currency VARCHAR(10) DEFAULT 'USD',
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_route UNIQUE (from_branch_id, to_branch_id),
    FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ============================================
-- VEHICLES
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
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
);

-- ============================================
-- DELIVERIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    from_branch_id INT DEFAULT NULL,
    to_branch_id INT DEFAULT NULL,
    delivery_type VARCHAR(100) DEFAULT 'branch_to_branch',
    destination_address TEXT DEFAULT NULL,
    weight_kg DECIMAL(6,1) NOT NULL DEFAULT 0.0,
    size_feet INT NOT NULL DEFAULT 0,
    price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0.40,
    price_per_foot DECIMAL(10,2) NOT NULL DEFAULT 0.60,
    cost_weight DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cost_size DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cost_route DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    packaging_category VARCHAR(100) DEFAULT 'standard',
    packaging_cost DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    delivery_boy_name VARCHAR(120) NOT NULL DEFAULT '',
    delivery_boy_phone VARCHAR(30) NOT NULL DEFAULT '',
    delivery_boy_user_id INT DEFAULT NULL,
    vehicle_plate VARCHAR(60) NOT NULL DEFAULT '',
    assigned_by_user_id INT NOT NULL DEFAULT 0,
    seller_paid_cash SMALLINT DEFAULT 1,
    status VARCHAR(100) DEFAULT 'assigned',
    rejection_reason TEXT DEFAULT NULL,
    proof_image_url VARCHAR(500) DEFAULT NULL,
    proof_lat DECIMAL(10,7) DEFAULT NULL,
    proof_lng DECIMAL(10,7) DEFAULT NULL,
    proof_notes TEXT DEFAULT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT unique_delivery_per_order UNIQUE (order_id)
);

-- ============================================
-- DELIVERY HUBS
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_hubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(500) NOT NULL,
    branch_id INT DEFAULT NULL,
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_hub_name_location UNIQUE (name, location)
);

-- ============================================
-- DELIVERY ROUTES
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_routes (
    id SERIAL PRIMARY KEY,
    from_location VARCHAR(255) NOT NULL,
    to_location VARCHAR(255) NOT NULL,
    is_active SMALLINT DEFAULT 1,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_route_locations UNIQUE (from_location, to_location),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- DELIVERY ROUTE HUBS
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_route_hubs (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL,
    hub_id INT NOT NULL,
    hub_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_route_hub UNIQUE (route_id, hub_id),
    CONSTRAINT uk_route_hub_order UNIQUE (route_id, hub_order),
    FOREIGN KEY (route_id) REFERENCES delivery_routes(id) ON DELETE CASCADE,
    FOREIGN KEY (hub_id) REFERENCES delivery_hubs(id) ON DELETE RESTRICT
);

-- ============================================
-- ORDER TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS order_tracking (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    location VARCHAR(500) DEFAULT NULL,
    status VARCHAR(100) NOT NULL,
    updated_by INT DEFAULT NULL,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- FAVOURITES
-- ============================================
CREATE TABLE IF NOT EXISTS favourites (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT unique_favourite UNIQUE (user_id, product_id)
);

-- ============================================
-- PRODUCT REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS product_requests (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    is_notified SMALLINT DEFAULT 0,
    notified_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT unique_request UNIQUE (user_id, product_id)
);

-- ============================================
-- COMPANY FOLLOWERS
-- ============================================
CREATE TABLE IF NOT EXISTS company_followers (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    company_id INT NOT NULL,
    notifications_enabled SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT unique_follow UNIQUE (user_id, company_id)
);

-- ============================================
-- COMPANY BRANCH PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS company_branch_preferences (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    branch_id INT NOT NULL,
    usage_count INT NOT NULL DEFAULT 0,
    last_assigned_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_company_branch_pref UNIQUE (company_id, branch_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ============================================
-- SPIN REWARDS
-- ============================================
CREATE TABLE IF NOT EXISTS spin_rewards (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    reward_type VARCHAR(20) NOT NULL,
    reward_value DECIMAL(10,2) DEFAULT 0.00,
    promo_code VARCHAR(50) DEFAULT NULL,
    promo_expiry TIMESTAMP DEFAULT NULL,
    is_used SMALLINT DEFAULT 0,
    spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(60) NOT NULL DEFAULT 'system',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id INT DEFAULT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    is_read SMALLINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ============================================
-- ADMIN NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_notifications (
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
);

-- ============================================
-- COMPANY NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS company_notifications (
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
);

CREATE INDEX IF NOT EXISTS idx_company_notif ON company_notifications(company_id, is_read);

-- ============================================
-- FEEDBACKS
-- ============================================
CREATE TABLE IF NOT EXISTS feedbacks (
    id SERIAL PRIMARY KEY,
    user_id INT DEFAULT NULL,
    name VARCHAR(100) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    subject VARCHAR(255) DEFAULT NULL,
    message TEXT NOT NULL,
    feedback_type VARCHAR(100) NOT NULL DEFAULT 'feedback',
    company_id INT DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    admin_reply TEXT DEFAULT NULL,
    replied_at TIMESTAMP DEFAULT NULL,
    replied_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- PRODUCT REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    order_id INT DEFAULT NULL,
    rating DECIMAL(2,1) NOT NULL,
    review_text TEXT DEFAULT NULL,
    seller_reply TEXT DEFAULT NULL,
    seller_reply_at TIMESTAMP DEFAULT NULL,
    is_verified_purchase SMALLINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- ============================================
-- COMPANY RATINGS
-- ============================================
CREATE TABLE IF NOT EXISTS company_ratings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    company_id INT NOT NULL,
    rating DECIMAL(2,1) NOT NULL,
    review_text TEXT DEFAULT NULL,
    stars_spent DECIMAL(3,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT unique_company_rating UNIQUE (user_id, company_id)
);

-- ============================================
-- SUPPORT INFO
-- ============================================
CREATE TABLE IF NOT EXISTS support_info (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    label VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    icon VARCHAR(100) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AI SEARCH HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS ai_search_history (
    id SERIAL PRIMARY KEY,
    user_id INT DEFAULT NULL,
    image_path VARCHAR(500) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    results JSONB DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- USER SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    language VARCHAR(10) DEFAULT 'en',
    currency VARCHAR(10) DEFAULT 'USD',
    email_notifications SMALLINT DEFAULT 1,
    push_notifications SMALLINT DEFAULT 1,
    order_updates SMALLINT DEFAULT 1,
    promotional_emails SMALLINT DEFAULT 0,
    two_factor_auth SMALLINT DEFAULT 0,
    privacy_profile VARCHAR(10) DEFAULT 'public',
    auto_play_animations SMALLINT DEFAULT 1,
    data_sharing SMALLINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- BACKGROUND THEMES
-- ============================================
CREATE TABLE IF NOT EXISTS background_themes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    preview_url VARCHAR(500) NOT NULL,
    resource_url VARCHAR(500) NOT NULL,
    category VARCHAR(50) DEFAULT NULL,
    is_premium SMALLINT DEFAULT 0,
    is_active SMALLINT DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PROMO CODES
-- ============================================
CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(12,2) DEFAULT 0.00,
    max_uses INT DEFAULT NULL,
    current_uses INT DEFAULT 0,
    is_active SMALLINT DEFAULT 1,
    expires_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- COMPANY PROMO CODES
-- ============================================
CREATE TABLE IF NOT EXISTS company_promo_codes (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    product_id INT DEFAULT NULL,
    code VARCHAR(50) NOT NULL,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(12,2) DEFAULT 0.00,
    max_uses INT DEFAULT NULL,
    current_uses INT DEFAULT 0,
    is_active SMALLINT DEFAULT 1,
    expires_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT unique_company_code UNIQUE (company_id, code)
);

-- ============================================
-- PRODUCT COMMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS product_comments (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    parent_id INT DEFAULT NULL,
    comment_text TEXT NOT NULL,
    is_read_by_company SMALLINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES product_comments(id) ON DELETE SET NULL
);

-- ============================================
-- GLOBAL NID REGISTRY
-- ============================================
CREATE TABLE IF NOT EXISTS global_nid_registry (
    id SERIAL PRIMARY KEY,
    nid_number VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AI NEGOTIATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS ai_negotiations (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    offered_price DECIMAL(12,2) DEFAULT NULL,
    final_price DECIMAL(12,2) DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active',
    customer_total_purchases DECIMAL(15,2) DEFAULT 0.00,
    customer_order_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ============================================
-- AI NEGOTIATION MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS ai_negotiation_messages (
    id SERIAL PRIMARY KEY,
    negotiation_id INT NOT NULL,
    sender VARCHAR(100) NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'response',
    message_text TEXT NOT NULL,
    offered_price DECIMAL(12,2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negotiation_id) REFERENCES ai_negotiations(id) ON DELETE CASCADE
);

-- ============================================
-- SELLER NEGOTIATION RULES
-- ============================================
CREATE TABLE IF NOT EXISTS seller_negotiation_rules (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    min_orders INT NOT NULL DEFAULT 0,
    max_orders INT DEFAULT NULL,
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ============================================
-- USER PRODUCT INTERACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS user_product_interactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    interaction_type VARCHAR(20) NOT NULL,
    product_id INT DEFAULT NULL,
    search_query VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ============================================
-- ADMIN REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_requests (
    id SERIAL PRIMARY KEY,
    requester_user_id INT NOT NULL,
    request_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    details JSONB DEFAULT NULL,
    status VARCHAR(100) DEFAULT 'pending',
    reviewed_by_user_id INT DEFAULT NULL,
    reviewed_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- PLATFORM SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS platform_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    updated_by_user_id INT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AD PROMOTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS ad_promotions (
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
);

-- ============================================
-- ADMIN AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
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
);

-- ============================================
-- PASSWORD RESET OTPs
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_otps (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    otp CHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- COMPANY LEADERBOARD VIEW
-- ============================================
CREATE OR REPLACE VIEW company_leaderboard AS
    SELECT c.id, c.company_name, c.company_logo, c.badge,
           c.total_revenue, c.total_sales, c.rating,
           c.total_ratings, c.follower_count, c.created_at,
           u.username AS owner_name,
           RANK() OVER (ORDER BY c.total_revenue DESC) AS rank
    FROM companies c
    JOIN users u ON c.user_id = u.id
    WHERE c.status = 'active';

-- ============================================================
-- SEED DATA
-- ============================================================

-- Categories
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
ON CONFLICT (name) DO NOTHING;

-- Branches
INSERT INTO branches (name, address) VALUES
  ('Branch 1','FlexCart Branch 1'),
  ('Branch 2','FlexCart Branch 2')
ON CONFLICT (name) DO NOTHING;

-- Branch delivery pricing
INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
SELECT b1.id, b2.id, 2.00, 2.50 FROM branches b1 JOIN branches b2 ON b2.name='Branch 2' WHERE b1.name='Branch 1'
ON CONFLICT DO NOTHING;

INSERT INTO branch_delivery_pricing (from_branch_id, to_branch_id, charge_branch_to_branch, charge_branch_to_branch_address)
SELECT b2.id, b1.id, 2.00, 2.50 FROM branches b1 JOIN branches b2 ON b2.name='Branch 2' WHERE b1.name='Branch 1'
ON CONFLICT DO NOTHING;

-- Platform settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('commission_rate','5.00','Commission percentage per product purchase'),
  ('cost_per_kg','0.40','Delivery cost per kilogram'),
  ('cost_per_foot','0.60','Delivery cost per foot of size'),
  ('packaging_plastic','1.00','Packaging cost for plastic category'),
  ('packaging_glass','1.50','Packaging cost for glass category'),
  ('packaging_fragile','2.00','Packaging cost for fragile category'),
  ('packaging_standard','1.00','Packaging cost for standard category'),
  ('route_branch_to_branch','2.00','Default branch-to-branch delivery charge'),
  ('route_branch_to_address','2.50','Default branch-to-address delivery charge')
ON CONFLICT (setting_key) DO NOTHING;

-- Support info
INSERT INTO support_info (type, label, value, icon, sort_order) VALUES
  ('phone','Customer Support','+1-800-FLEXCART','phone',1),
  ('phone','Technical Support','+1-800-FLEX-TECH','phone',2),
  ('email','General Inquiries','info@flexcart.com','mail',3),
  ('email','Support Email','support@flexcart.com','mail',4),
  ('address','Head Office','123 Commerce Street, Tech City, TC 12345','map-pin',5),
  ('hours','Business Hours','Mon-Fri: 9AM-6PM, Sat: 10AM-4PM','clock',6),
  ('social','Facebook','https://facebook.com/flexcart','facebook',7),
  ('social','Twitter','https://twitter.com/flexcart','twitter',8),
  ('faq','Return Policy','You can return any product within 30 days of purchase','help-circle',9),
  ('faq','Shipping','Free shipping on orders above $50','truck',10);

-- Promo codes
INSERT INTO promo_codes (code, discount_type, discount_value, min_order_amount, max_uses, expires_at) VALUES
  ('WELCOME10','percentage',10.00,20.00,1000, NOW() + INTERVAL '1 year'),
  ('SAVE20','percentage',20.00,50.00,500, NOW() + INTERVAL '6 months'),
  ('FLAT5','fixed',5.00,15.00,2000, NOW() + INTERVAL '3 months'),
  ('MEGA30','percentage',30.00,100.00,100, NOW() + INTERVAL '1 month'),
  ('FLEXFIRST','percentage',15.00,0.00,NULL, NOW() + INTERVAL '1 year')
ON CONFLICT (code) DO NOTHING;

-- Background themes
INSERT INTO background_themes (name, type, preview_url, resource_url, category, sort_order) VALUES
  ('Ocean Wave','3d','/assets/images/backgrounds/ocean_preview.jpg','/assets/animations/ocean.json','nature',1),
  ('Starry Night','3d','/assets/images/backgrounds/stars_preview.jpg','/assets/animations/stars.json','space',2),
  ('Forest Rain','3d','/assets/images/backgrounds/forest_preview.jpg','/assets/animations/forest.json','nature',3),
  ('City Lights','2d','/assets/images/backgrounds/city_preview.jpg','/assets/images/backgrounds/city.jpg','urban',4),
  ('Sunset Gradient','2d','/assets/images/backgrounds/sunset_preview.jpg','/assets/images/backgrounds/sunset.jpg','gradient',5),
  ('Snow Fall','3d','/assets/images/backgrounds/snow_preview.jpg','/assets/animations/snow.json','weather',6),
  ('Abstract Flow','2d','/assets/images/backgrounds/abstract_preview.jpg','/assets/images/backgrounds/abstract.jpg','abstract',7),
  ('Mountain View','image','/assets/images/backgrounds/mountain_preview.jpg','/assets/images/backgrounds/mountain.jpg','nature',8),
  ('Minimal White','2d','/assets/images/backgrounds/minimal_preview.jpg','/assets/images/backgrounds/minimal.jpg','minimal',9),
  ('Dark Mesh','2d','/assets/images/backgrounds/mesh_preview.jpg','/assets/images/backgrounds/mesh.jpg','dark',10);

-- Global NID Registry (sample valid NIDs)
INSERT INTO global_nid_registry (nid_number, full_name, date_of_birth, status) VALUES
  ('1234567890','John Doe','1990-05-15','active'),
  ('2345678901','Jane Smith','1988-11-22','active'),
  ('3456789012','Robert Johnson','1995-03-08','active'),
  ('4567890123','Emily Davis','1992-07-30','active'),
  ('5678901234','Michael Wilson','1985-01-17','active'),
  ('6789012345','Sarah Brown','1993-09-25','active'),
  ('7890123456','David Lee','1991-12-04','active'),
  ('8901234567','Lisa Anderson','1987-06-11','active'),
  ('9012345678','James Taylor','1994-02-28','active'),
  ('0123456789','Maria Garcia','1989-08-19','active')
ON CONFLICT (nid_number) DO NOTHING;

-- Super Admin user (password: superadmin@123)
-- bcrypt hash generated for 'superadmin@123' with 10 rounds
INSERT INTO users (username, email, password_hash, role, is_verified, status, plain_password)
VALUES (
  'superadmin',
  'flexcart@gmail.com',
  '$2a$10$fCaSFNRMTgqkVtxEJjDCLOEXY/hZYcnxtVhFoWPFELzTloe9YOJnu',
  'super_admin',
  1,
  'active',
  'superadmin@123'
)
ON CONFLICT (email) DO UPDATE SET role = 'super_admin', is_verified = 1;

-- ============================================================
-- DONE — All tables created and seeded successfully
-- ============================================================
