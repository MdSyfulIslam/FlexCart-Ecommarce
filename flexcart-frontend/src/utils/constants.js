export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
export const UPLOAD_URL = process.env.REACT_APP_UPLOAD_URL || 'http://localhost:5000';

export const ORDER_STATUSES = {
  pending: { label: 'Pending', color: '#F59E0B', icon: 'clock' },
  confirmed: { label: 'Confirmed', color: '#3B82F6', icon: 'check-circle' },
  processing: { label: 'Processing', color: '#8B5CF6', icon: 'loader' },
  shipped: { label: 'Shipped', color: '#6366F1', icon: 'truck' },
  delivered: { label: 'Delivered', color: '#10B981', icon: 'package' },
  cancelled: { label: 'Cancelled', color: '#EF4444', icon: 'x-circle' },
  returned: { label: 'Returned', color: '#F97316', icon: 'rotate-ccw' }
};

export const NOTIFICATION_TYPES = {
  order_confirmed: { icon: '✅', color: '#10B981' },
  order_shipped: { icon: '🚚', color: '#6366F1' },
  order_delivered: { icon: '📦', color: '#10B981' },
  product_back_in_stock: { icon: '🔔', color: '#F59E0B' },
  comment_reply: { icon: '💬', color: '#3B82F6' },
  review_opinion: { icon: '⭐', color: '#F59E0B' },
  discount_offer: { icon: '🏷️', color: '#EF4444' },
  spin_reward: { icon: '🎰', color: '#8B5CF6' },
  system: { icon: '⚙️', color: '#64748B' },
  company_update: { icon: '🏢', color: '#3B82F6' }
};

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'most_sold', label: 'Most Sold' },
  { value: 'price_low_high', label: 'Price: Low to High' },
  { value: 'price_high_low', label: 'Price: High to Low' },
  { value: 'most_rated', label: 'Most Rated' },
  { value: 'discount', label: 'Highest Discount' }
];

export const PAYMENT_METHODS = [
  { value: 'sslcommerz',       label: 'Online Payment',   description: 'Cards, bKash, Nagad & more via SSLCommerz' },
  { value: 'bkash',            label: 'bKash',            description: 'Mobile Banking' },
  { value: 'nagad',            label: 'Nagad',            description: 'Mobile Banking' },
  { value: 'rocket',           label: 'Rocket',           description: 'Mobile Banking' },
  { value: 'bank_card',        label: 'Bank Card',        description: 'Credit / Debit Card' },
  { value: 'bank_transfer',    label: 'Bank Transfer',    description: 'Online Banking' },
  { value: 'cash_on_delivery', label: 'Cash on Delivery', description: 'Pay on arrival' },
];

// Methods that route through SSLCommerz hosted checkout (all online methods)
export const SSL_GATEWAY_METHODS = ['sslcommerz', 'bkash', 'nagad', 'rocket', 'bank_card', 'bank_transfer'];

export const APPEARANCE_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#EF4444', '#F59E0B',
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#F97316',
  '#14B8A6', '#6366F1', '#D946EF', '#0EA5E9', '#84CC16'
];

export const SPIN_WHEEL_SEGMENTS = [
  { label: '10 Pts', type: 'points', value: 10, color: '#3B82F6' },
  { label: '0.2 ★', type: 'stars', value: 0.2, color: '#A855F7' },
  { label: '25 Pts', type: 'points', value: 25, color: '#10B981' },
  { label: '0.5 ★', type: 'stars', value: 0.5, color: '#8B5CF6' },
  { label: '50 Pts', type: 'points', value: 50, color: '#EC4899' },
  { label: 'Try Again', type: 'nothing', value: 0, color: '#94A3B8' },
  { label: '100 Pts', type: 'points', value: 100, color: '#F97316' },
  { label: '1.0 ★', type: 'stars', value: 1.0, color: '#6366F1' },
  { label: '200 Pts', type: 'points', value: 200, color: '#EF4444' },
  { label: '0.3 ★', type: 'stars', value: 0.3, color: '#14B8A6' },
  { label: '150 Pts', type: 'points', value: 150, color: '#F59E0B' },
  { label: '2.0 ★', type: 'stars', value: 2.0, color: '#06B6D4' },
];