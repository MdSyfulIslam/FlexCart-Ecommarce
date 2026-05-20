-- FlexCart Migration v4: Vehicle Driver Info, Via Routes, Order Branch Assignment
-- Run this SQL after migration_admin_panels.sql
-- Requires MySQL 8.0+ for ADD COLUMN IF NOT EXISTS

USE flexcart_db;

-- ============================================
-- VEHICLES: Driver Info + Via-Route Support
-- ============================================
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS route_from_branch_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS route_to_branch_id   INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_name          VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_phone         VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS route_via_branches   JSON         DEFAULT NULL
    COMMENT 'JSON array of branch IDs for intermediate stops, e.g. [3,5]';

-- FK indexes for route columns (ignore error if already exist)
ALTER TABLE vehicles
  ADD INDEX IF NOT EXISTS idx_route_from (route_from_branch_id),
  ADD INDEX IF NOT EXISTS idx_route_to   (route_to_branch_id);

-- ============================================
-- ORDERS: Branch Assignment
-- ============================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_branch_id INT       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_branch_at TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE orders
  ADD INDEX IF NOT EXISTS idx_assigned_branch (assigned_branch_id);

-- ============================================
-- AUDIT LOG: New action types (no schema change needed,
-- actions stored as VARCHAR - just documenting)
-- New actions: assigned_branch_to_order, cancelled_delivery_assignment, updated_vehicle
-- ============================================
