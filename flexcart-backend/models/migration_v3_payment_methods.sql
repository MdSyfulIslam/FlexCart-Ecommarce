-- FlexCart v3 Migration: Add BD payment methods
-- Run after database.sql

USE flexcart_db;

ALTER TABLE orders
  MODIFY COLUMN payment_method ENUM(
    'credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash_on_delivery',
    'bkash', 'nagad', 'rocket', 'bank_card'
  ) DEFAULT 'bkash';
