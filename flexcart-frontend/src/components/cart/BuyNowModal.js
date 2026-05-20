import React, { useState, useContext, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone, CreditCard, Landmark, Banknote,
  X, ShoppingBag, MapPin, Plus, Minus, CheckCircle, Truck, Package
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import orderService from '../../services/orderService';
import { formatPrice, getImageUrl } from '../../utils/helpers';
import { toast } from 'react-toastify';
import './BuyNowModal.css';

const BASE_PAYMENT_OPTIONS = [
  { value: 'bkash',         label: 'bKash',          icon: Smartphone, color: '#e2136e', bg: 'rgba(226,19,110,0.08)' },
  { value: 'nagad',         label: 'Nagad',           icon: Smartphone, color: '#f6821f', bg: 'rgba(246,130,31,0.08)' },
  { value: 'rocket',        label: 'Rocket',          icon: Smartphone, color: '#8a2be2', bg: 'rgba(138,43,226,0.08)' },
  { value: 'bank_card',     label: 'Bank Card',       icon: CreditCard, color: '#1a73e8', bg: 'rgba(26,115,232,0.08)' },
  { value: 'bank_transfer', label: 'Bank Transfer',   icon: Landmark,   color: '#188038', bg: 'rgba(24,128,56,0.08)'  },
];

const COD_OPTION = { value: 'cash_on_delivery', label: 'Cash on Delivery', icon: Banknote, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' };

const BuyNowModal = ({ product, onClose, onSuccess }) => {
  const { user, loadUser } = useContext(AuthContext);
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('bkash');
  const [receiverMobile, setReceiverMobile] = useState(user?.phone || '');
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [receiverLocation, setReceiverLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const deliveryTimerRef = useRef(null);

  const isCODProduct = product.is_cod_allowed === 1 || product.is_cod_allowed === true;
  const PAYMENT_OPTIONS = isCODProduct ? [...BASE_PAYMENT_OPTIONS, COD_OPTION] : BASE_PAYMENT_OPTIONS;

  const maxQty = Math.min(product.stock_quantity || 1, 20);
  const subtotal = parseFloat(product.current_price) * qty;
  const totalAmount = subtotal + deliveryCharge;

  // Fetch delivery charge when district or qty changes
  useEffect(() => {
    if (deliveryTimerRef.current) clearTimeout(deliveryTimerRef.current);
    if (!district.trim()) {
      setDeliveryCharge(0);
      return;
    }
    setDeliveryLoading(true);
    deliveryTimerRef.current = setTimeout(async () => {
      try {
        const res = await import('../../services/api').then(m =>
          m.default.get('/orders/delivery-charge', { params: { district, quantity: qty } })
        );
        if (res.data.success) setDeliveryCharge(res.data.data.charge || 0);
      } catch {
        setDeliveryCharge(0);
      } finally {
        setDeliveryLoading(false);
      }
    }, 400);
    return () => clearTimeout(deliveryTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, qty]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!receiverMobile.trim()) {
      toast.error('Receiver mobile number is required');
      return;
    }
    if (!district.trim()) {
      toast.error('District is required');
      return;
    }
    if (!upazila.trim()) {
      toast.error('Upazila is required');
      return;
    }
    if (!receiverLocation.trim()) {
      toast.error('Receiver location is required');
      return;
    }
    setLoading(true);
    try {
      const res = await orderService.buyNow({
        product_id: product.id,
        quantity: qty,
        payment_method: paymentMethod,
        receiver_mobile: receiverMobile,
        district,
        upazila,
        receiver_location: receiverLocation,
      });
      if (res.data.success) {
        if (res.data.data?.gatewayUrl) {
          toast.success('Redirecting to payment gateway…');
          window.location.href = res.data.data.gatewayUrl;
          return;
        }
        setOrderResult(res.data.data);
        setOrderComplete(true);
        await loadUser();
        toast.success('Order placed successfully!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (orderComplete && orderResult) {
    return (
      <div className="bn-overlay" onClick={onSuccess}>
        <motion.div
          className="bn-modal"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="bn-success">
            <motion.div
              className="bn-success-icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 8, delay: 0.15 }}
            >
              <CheckCircle size={56} />
            </motion.div>
            <h2>Order Placed!</h2>
            <p className="bn-order-num">#{orderResult.orderNumber}</p>
            <div className="bn-success-details">
              <div className="bn-detail-row">
                <span>Subtotal</span>
                <span>{formatPrice(orderResult.subtotal)}</span>
              </div>
              <div className="bn-detail-row">
                <span><Truck size={13} /> Delivery</span>
                <span>{formatPrice(orderResult.deliveryCharge)}</span>
              </div>
              <div className="bn-detail-row bn-total-row">
                <span>Total Paid</span>
                <span>{formatPrice(orderResult.totalAmount)}</span>
              </div>
              {orderResult.pointsEarned > 0 && (
                <div className="bn-detail-row bn-reward-row">
                  <span>Points Earned</span>
                  <span>+{orderResult.pointsEarned} pts</span>
                </div>
              )}
            </div>
            <motion.button
              className="bn-done-btn"
              onClick={onSuccess}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Continue Shopping
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bn-overlay" onClick={onClose}>
      <motion.div
        className="bn-modal"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bn-header">
          <div className="bn-header-title">
            <ShoppingBag size={18} />
            <span>Buy Now</span>
          </div>
          <button className="bn-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="bn-body">
          {/* Product Summary */}
          <div className="bn-product">
            <div className="bn-product-img-wrap">
              {product.image_url
                ? <img src={getImageUrl(product.image_url)} alt={product.name} className="bn-product-img" />
                : <div className="bn-product-img-placeholder"><Package size={28} /></div>
              }
            </div>
            <div className="bn-product-info">
              <div className="bn-product-name">{product.name}</div>
              <div className="bn-product-price">{formatPrice(product.current_price)}</div>
              {product.company_name && (
                <div className="bn-product-company">{product.company_name}</div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Quantity */}
            <div className="bn-section">
              <label className="bn-label">Quantity</label>
              <div className="bn-qty-row">
                <button
                  type="button"
                  className="bn-qty-btn"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                >
                  <Minus size={15} />
                </button>
                <span className="bn-qty-val">{qty}</span>
                <button
                  type="button"
                  className="bn-qty-btn"
                  onClick={() => setQty(q => Math.min(maxQty, q + 1))}
                  disabled={qty >= maxQty}
                >
                  <Plus size={15} />
                </button>
                <span className="bn-stock-hint">{product.stock_quantity} in stock</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bn-section">
              <label className="bn-label">Payment Method</label>
              <div className="bn-payment-grid">
                {PAYMENT_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = paymentMethod === opt.value;
                  return (
                    <motion.button
                      key={opt.value}
                      type="button"
                      className={`bn-payment-opt${active ? ' bn-payment-opt--active' : ''}`}
                      style={active ? { borderColor: opt.color, background: opt.bg } : {}}
                      onClick={() => setPaymentMethod(opt.value)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="bn-payment-icon" style={{ color: opt.color }}>
                        <Icon size={20} />
                      </span>
                      <span className="bn-payment-label">{opt.label}</span>
                      {active && (
                        <span className="bn-payment-check" style={{ color: opt.color }}>
                          <CheckCircle size={14} />
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
              {paymentMethod === 'cash_on_delivery' && (
                <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: '#dcfce7', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.82rem', color: '#166534' }}>
                  <Banknote size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />
                  <strong>Cash on Delivery:</strong> Pay delivery charge (৳{deliveryCharge.toFixed(2)}) now. Remaining ৳{subtotal.toFixed(2)} paid on delivery.
                </div>
              )}
              {paymentMethod !== 'cash_on_delivery' && (
                <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af' }}>
                  <strong>🔒 Secure payment via SSLCommerz</strong><br />
                  <span style={{ color: '#374151', fontSize: '0.78rem' }}>
                    <strong>Sandbox:</strong> bKash → <code>01552598200</code> / OTP <code>123456</code> / PIN <code>12345</code>&nbsp;&nbsp;
                    Card → <code>4111111111111111</code> / any future exp / any CVV
                  </span>
                </div>
              )}
            </div>

            {/* Receiver Info */}
            <div className="bn-section">
              <label className="bn-label"><MapPin size={13} /> Receiver Info</label>
              <input
                type="tel"
                className="bn-input"
                placeholder="Receiver Mobile Number *"
                value={receiverMobile}
                onChange={e => setReceiverMobile(e.target.value)}
                required
              />
              <div className="bn-addr-row">
                <input
                  type="text"
                  className="bn-input"
                  placeholder="District *"
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="bn-input"
                  placeholder="Upazila *"
                  value={upazila}
                  onChange={e => setUpazila(e.target.value)}
                  required
                />
              </div>
              <input
                type="text"
                className="bn-input"
                placeholder="Receiver Location (house/road/area) *"
                value={receiverLocation}
                onChange={e => setReceiverLocation(e.target.value)}
                required
              />
            </div>

            {/* Order Summary */}
            <div className="bn-summary">
              <div className="bn-summary-row">
                <span>Subtotal ({qty} × {formatPrice(product.current_price)})</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="bn-summary-row">
                <span className="bn-delivery-label">
                  <Truck size={13} /> Delivery {deliveryLoading ? '(loading...)' : district ? `(${district})` : '(enter district)'}
                </span>
                <span>{deliveryLoading ? '...' : deliveryCharge > 0 ? `৳${deliveryCharge.toFixed(2)}` : district ? '৳0.00' : '-'}</span>
              </div>
              {paymentMethod === 'cash_on_delivery' ? (
                <>
                  <div className="bn-summary-row" style={{ color: '#16a34a', fontWeight: 600 }}>
                    <span><Banknote size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Pay Now (Delivery Only)</span>
                    <span>৳{deliveryCharge.toFixed(2)}</span>
                  </div>
                  <div className="bn-summary-row" style={{ color: '#92400e' }}>
                    <span>Pay on Delivery (Products)</span>
                    <span>৳{subtotal.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="bn-summary-row bn-summary-total">
                  <span>Total</span>
                  <span>{formatPrice(totalAmount)}</span>
                </div>
              )}
            </div>

            <motion.button
              type="submit"
              className="bn-submit-btn"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.97 }}
            >
              {loading
                ? 'Placing Order...'
                : paymentMethod === 'cash_on_delivery'
                  ? `Confirm COD — Pay ৳${deliveryCharge.toFixed(2)} Now`
                  : `Pay ${formatPrice(totalAmount)}`
              }
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default BuyNowModal;
