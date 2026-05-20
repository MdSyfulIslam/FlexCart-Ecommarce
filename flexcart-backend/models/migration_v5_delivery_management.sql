-- FlexCart Migration v5: Delivery Route, Hub, Tracking, and Order Extensions
-- Non-breaking additive migration

USE flexcart_db;

-- ============================================
-- DELIVERY HUBS
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_hubs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(500) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_hub_name_location (name, location),
  INDEX idx_hub_name (name),
  INDEX idx_hub_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PREDEFINED DELIVERY ROUTES
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_location VARCHAR(255) NOT NULL,
  to_location VARCHAR(255) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_route_locations (from_location, to_location),
  INDEX idx_route_from_to (from_location, to_location),
  INDEX idx_route_active (is_active),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ROUTE TO HUB RELATION (ORDERED)
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_route_hubs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  route_id INT NOT NULL,
  hub_id INT NOT NULL,
  hub_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_route_hub (route_id, hub_id),
  UNIQUE KEY uk_route_hub_order (route_id, hub_order),
  INDEX idx_route_hub_route (route_id),
  INDEX idx_route_hub_hub (hub_id),
  FOREIGN KEY (route_id) REFERENCES delivery_routes(id) ON DELETE CASCADE,
  FOREIGN KEY (hub_id) REFERENCES delivery_hubs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ORDERS TABLE EXTENSION
-- ============================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS from_location VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS to_location VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS route_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_status ENUM('order_placed','picked_up','at_hub','in_transit','out_for_delivery','delivered') DEFAULT 'order_placed';

ALTER TABLE orders
  ADD INDEX IF NOT EXISTS idx_orders_route_id (route_id),
  ADD INDEX IF NOT EXISTS idx_orders_current_status (current_status);

SET @fk_orders_route_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'orders'
    AND constraint_name = 'fk_orders_route_id'
    AND constraint_type = 'FOREIGN KEY'
);
SET @sql_fk_orders_route := IF(
  @fk_orders_route_exists = 0,
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_route_id FOREIGN KEY (route_id) REFERENCES delivery_routes(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk_orders_route FROM @sql_fk_orders_route;
EXECUTE stmt_fk_orders_route;
DEALLOCATE PREPARE stmt_fk_orders_route;

-- ============================================
-- VEHICLES TABLE EXTENSION
-- ============================================
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS route_id INT DEFAULT NULL;

ALTER TABLE vehicles
  ADD INDEX IF NOT EXISTS idx_vehicle_route_id (route_id);

SET @fk_vehicles_route_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'vehicles'
    AND constraint_name = 'fk_vehicles_route_id'
    AND constraint_type = 'FOREIGN KEY'
);
SET @sql_fk_vehicles_route := IF(
  @fk_vehicles_route_exists = 0,
  'ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_route_id FOREIGN KEY (route_id) REFERENCES delivery_routes(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk_vehicles_route FROM @sql_fk_vehicles_route;
EXECUTE stmt_fk_vehicles_route;
DEALLOCATE PREPARE stmt_fk_vehicles_route;

-- ============================================
-- USERS TABLE EXTENSION (DELIVERY BOY AVAILABILITY/LOCATION)
-- ============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS delivery_is_available TINYINT(1) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delivery_last_location VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_last_location_updated_at TIMESTAMP NULL DEFAULT NULL;

-- ============================================
-- ORDER TRACKING TIMELINE (APPEND ONLY)
-- ============================================
CREATE TABLE IF NOT EXISTS order_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  location VARCHAR(500) DEFAULT NULL,
  status ENUM('order_placed','picked_up','at_hub','in_transit','out_for_delivery','delivered') NOT NULL,
  updated_by INT DEFAULT NULL,
  event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tracking_order_time (order_id, event_timestamp),
  INDEX idx_tracking_status (status),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
