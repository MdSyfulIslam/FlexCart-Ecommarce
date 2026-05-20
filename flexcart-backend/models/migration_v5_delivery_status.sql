-- Migration v5: Delivery Status Flow
-- Adds previous_branch_id to orders to track branch-to-branch reassignment chains
-- Run this once against the database

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS previous_branch_id INT NULL DEFAULT NULL;

-- Optional FK (skip if branches table may be dropped/recreated during dev):
-- ALTER TABLE orders
--   ADD CONSTRAINT fk_orders_previous_branch
--   FOREIGN KEY (previous_branch_id) REFERENCES branches(id) ON DELETE SET NULL;
