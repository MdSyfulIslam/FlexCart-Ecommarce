import React, { useState, useContext, useEffect, useRef } from 'react';
import Modal from '../common/Modal';
import { motion } from 'framer-motion';
import { FiCreditCard, FiMapPin, FiTag, FiCheck } from 'react-icons/fi';
import { Smartphone, CreditCard, Landmark, Building2, Banknote } from 'lucide-react';
import { CartContext } from '../../context/CartContext';
import { AuthContext } from '../../context/AuthContext';
import orderService from '../../services/orderService';
import { PAYMENT_METHODS } from '../../utils/constants';
import { formatPrice } from '../../utils/helpers';
import { isValidPhone } from '../../utils/validators';
import { toast } from 'react-toastify';
import './PaymentModal.css';

const PAYMENT_ICONS = {
  bkash:            { icon: Smartphone, color: '#e2136e' },
  nagad:            { icon: Smartphone, color: '#f6821f' },
  rocket:           { icon: Smartphone, color: '#8a2be2' },
  bank_card:        { icon: CreditCard, color: '#1a73e8' },
  bank_transfer:    { icon: Landmark,   color: '#188038' },
  credit_card:      { icon: CreditCard, color: '#1a73e8' },
  debit_card:       { icon: CreditCard, color: '#0f766e' },
  paypal:           { icon: Building2,  color: '#003087' },
  cash_on_delivery: { icon: Banknote,   color: '#16a34a' },
};

const PaymentModal = ({ onClose, onSuccess, selectedItemIds, selectedTotal, selectedQuantity }) => {
  const { cartTotal, cartItems, fetchCart } = useContext(CartContext);
  const { user, loadUser } = useContext(AuthContext);
  const [paymentMethod, setPaymentMethod] = useState('bkash');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState(null); // null | { valid, discount, message }
  const promoTimerRef = useRef(null);
  const [usePoints, setUsePoints] = useState('');
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

  const baseTotal = selectedTotal !== undefined ? selectedTotal : cartTotal;
  const totalQty = selectedQuantity || 1;

  // Determine which cart items are selected
  const relevantItems = selectedItemIds?.length
    ? (cartItems || []).filter(i => selectedItemIds.includes(i.id))
    : (cartItems || []);
  const allCODAllowed = relevantItems.length > 0 && relevantItems.every(i => i.is_cod_allowed);
  const codAdvanceTotal = relevantItems.reduce((sum, item) => {
    if (item.is_cod_allowed && item.cod_advance_amount != null && parseFloat(item.cod_advance_amount) > 0) {
      return sum + parseFloat(item.cod_advance_amount) * item.quantity;
    }
    return sum;
  }, 0);

  // Get points as number (for calculations)
  const pointsNum = usePoints === '' ? 0 : parseInt(usePoints, 10) || 0;

  // Real-time promo code validation (debounced 600ms)
  useEffect(() => {
    if (promoTimerRef.current) clearTimeout(promoTimerRef.current);
    if (!promoCode.trim()) {
      setPromoStatus(null);
      return;
    }
    promoTimerRef.current = setTimeout(async () => {
      try {
        const res = await import('../../services/api').then(m => m.default.post('/orders/validate-promo', { promo_code: promoCode }));
        if (res.data.success) {
          setPromoStatus({ valid: true, discount: res.data.discount, finalTotal: res.data.finalTotal, message: `✓ Code applied: -৳${res.data.discount.toFixed(2)}` });
        } else {
          setPromoStatus({ valid: false, message: res.data.message });
        }
      } catch {
        setPromoStatus({ valid: false, message: 'Could not validate code' });
      }
    }, 600);
    return () => clearTimeout(promoTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoCode]);

  // Fetch delivery charge when district or quantity changes (debounced 400ms)
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
          m.default.get('/orders/delivery-charge', { params: { district, quantity: totalQty } })
        );
        if (res.data.success) {
          setDeliveryCharge(res.data.data.charge || 0);
        }
      } catch {
        setDeliveryCharge(0);
      } finally {
        setDeliveryLoading(false);
      }
    }, 400);
    return () => clearTimeout(deliveryTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, totalQty]);

  const handlePointsChange = (e) => {
    const val = e.target.value;

    // Allow empty field
    if (val === '') {
      setUsePoints('');
      return;
    }

    // Parse to integer - this removes leading zeros
    const num = parseInt(val, 10);

    // Don't allow negative or NaN
    if (isNaN(num) || num < 0) return;

    // Cap at user's available points
    const maxPoints = user?.points || 0;
    setUsePoints(Math.min(num, maxPoints));
  };

  const handlePointsBlur = () => {
    // When user clicks away, set empty to 0
    if (usePoints === '') {
      setUsePoints('');
    }
  };

  // Build available payment methods — add COD only if all selected items allow it
  const availablePaymentMethods = [
    ...PAYMENT_METHODS.filter(m => m.value !== 'cash_on_delivery'),
    ...(allCODAllowed ? [{ value: 'cash_on_delivery', label: 'Cash on Delivery' }] : []),
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!receiverMobile.trim()) {
      toast.error('Receiver mobile number is required');
      return;
    }
    if (!isValidPhone(receiverMobile)) {
      toast.error('Receiver mobile must be a valid Bangladesh number (e.g. 01712345678)');
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
      const response = await orderService.createOrder({
        payment_method: paymentMethod,
        promo_code: promoCode || undefined,
        use_points: pointsNum > 0 ? pointsNum : undefined,
        receiver_mobile: receiverMobile,
        district,
        upazila,
        receiver_location: receiverLocation,
        ...(selectedItemIds?.length ? { selected_item_ids: selectedItemIds } : {})
      });

      if (response.data.success) {
        // SSLCommerz: redirect to payment gateway
        if (response.data.data?.gatewayUrl) {
          toast.success('Redirecting to payment gateway…');
          window.location.href = response.data.data.gatewayUrl;
          return;
        }
        setOrderComplete(true);
        setOrderResult(response.data.data);
        await fetchCart();
        await loadUser();
        toast.success('Order placed successfully! 🎉');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (orderComplete && orderResult) {
    const isCOD = orderResult.paymentMethod === 'cash_on_delivery';
    const advancePaid = parseFloat(orderResult.codAdvancePaid || 0);
    const dueOnDelivery = parseFloat(
      orderResult.codDueOnDelivery != null
        ? orderResult.codDueOnDelivery
        : Math.max(0, parseFloat(orderResult.totalAmount) - advancePaid)
    );

    return (
      <Modal isOpen={true} onClose={onSuccess} title="Order Confirmed! 🎉" size="small">
        <div className="order-success">
          <motion.div
            className="success-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10 }}
          >
            <FiCheck size={48} />
          </motion.div>
          <h3>Thank You!</h3>
          <p>Order #{orderResult.orderNumber}</p>
          <div className="order-success-details">
            <div className="success-detail-item">
              <span>Total</span>
              <span>{formatPrice(orderResult.totalAmount)}</span>
            </div>
            {orderResult.discountAmount > 0 && (
              <div className="success-detail-item">
                <span>Discount</span>
                <span className="discount-text">-{formatPrice(orderResult.discountAmount)}</span>
              </div>
            )}
            {isCOD && advancePaid > 0 && (
              <>
                <div className="success-detail-item" style={{ color: '#16a34a', fontWeight: 600 }}>
                  <span><Banknote size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Advance Paid (Online)</span>
                  <span>{formatPrice(advancePaid)}</span>
                </div>
                <div className="success-detail-item" style={{ color: '#92400e' }}>
                  <span>Due on Delivery</span>
                  <span>{formatPrice(dueOnDelivery)}</span>
                </div>
              </>
            )}
            {isCOD && advancePaid === 0 && (
              <div className="success-detail-item" style={{ color: '#92400e' }}>
                <span>Pay on Delivery</span>
                <span>{formatPrice(parseFloat(orderResult.totalAmount))}</span>
              </div>
            )}
            <div className="success-detail-item">
              <span>Points Earned</span>
              <span className="points-earned">+{orderResult.pointsEarned} pts</span>
            </div>
            <div className="success-detail-item">
              <span>Stars Earned</span>
              <span className="stars-earned">+{orderResult.starsEarned} ★</span>
            </div>
          </div>
          <motion.button
            className="success-done-btn"
            onClick={onSuccess}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Continue Shopping
          </motion.button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Complete Your Purchase" size="medium">
      <form className="payment-form" onSubmit={handleSubmit}>
        {/* Receiver Info */}
        <div className="payment-section">
          <h4><FiMapPin size={16} /> Receiver Info</h4>
          <div className="form-group">
            <input
              type="tel"
              placeholder="Receiver Mobile Number *"
              value={receiverMobile}
              onChange={(e) => setReceiverMobile(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-row">
            <input
              type="text"
              placeholder="District *"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              required
              className="form-input"
            />
            <input
              type="text"
              placeholder="Upazila *"
              value={upazila}
              onChange={(e) => setUpazila(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <input
              type="text"
              placeholder="Receiver Location (house/road/area) *"
              value={receiverLocation}
              onChange={(e) => setReceiverLocation(e.target.value)}
              required
              className="form-input"
            />
          </div>
        </div>

        {/* Payment Method */}
        <div className="payment-section">
          <h4><FiCreditCard size={16} /> Payment Method</h4>
          <div className="payment-methods-grid">
            {availablePaymentMethods.map(method => {
              const meta = PAYMENT_ICONS[method.value];
              const Icon = meta?.icon;
              return (
                <button
                  key={method.value}
                  type="button"
                  className={`payment-method-option ${paymentMethod === method.value ? 'active' : ''}`}
                  onClick={() => setPaymentMethod(method.value)}
                  style={paymentMethod === method.value && meta ? { borderColor: meta.color, background: meta.color + '18' } : {}}
                >
                  {Icon && (
                    <span className="payment-method-icon" style={{ color: meta?.color }}>
                      <Icon size={18} />
                    </span>
                  )}
                  <span>{method.label}</span>
                </button>
              );
            })}
          </div>
          {paymentMethod === 'cash_on_delivery' && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#dcfce7', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.875rem', color: '#166534' }}>
              <Banknote size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
              {codAdvanceTotal > 0
                ? <><strong>Cash on Delivery:</strong> Pay <strong>৳{codAdvanceTotal.toFixed(2)}</strong> advance now via online payment to confirm your order. The remaining <strong>৳{Math.max(0, (baseTotal + deliveryCharge) - codAdvanceTotal).toFixed(2)}</strong> will be paid to the delivery person on receipt.</>
                : <><strong>Cash on Delivery:</strong> No advance required. Pay the full amount to the delivery person when your order arrives.</>
              }
            </div>
          )}
          {paymentMethod !== 'cash_on_delivery' && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.875rem', color: '#1e40af' }}>
              <strong>🔒 Secure payment via SSLCommerz</strong><br />
              <span style={{ color: '#374151', fontSize: '0.8rem' }}>
                <strong>Sandbox:</strong> bKash → <code>01552598200</code> / OTP <code>123456</code> / PIN <code>12345</code>&nbsp;&nbsp;
                Card → <code>4111111111111111</code> / any future exp / any CVV
              </span>
            </div>
          )}
        </div>

        {/* Promo Code */}
        <div className="payment-section">
          <h4><FiTag size={16} /> Promo Code</h4>
          <input
            type="text"
            placeholder="Enter promo code (optional)"
            value={promoCode}
          onChange={(e) => { setPromoCode(e.target.value); }}
            className={`form-input ${promoStatus ? (promoStatus.valid ? 'input-valid' : 'input-invalid') : ''}`}
          />
          {promoStatus && (
            <p className={`promo-feedback ${promoStatus.valid ? 'promo-valid' : 'promo-invalid'}`}>
              {promoStatus.message}
            </p>
          )}
        </div>

        {/* Use Points */}
        {user?.points > 0 && (
          <div className="payment-section">
            <h4>Use Points ({user.points} available, 100 pts = ৳1)</h4>
            <input
              type="number"
              min="0"
              max={user.points}
              placeholder="Enter points to use"
              value={usePoints}
              onChange={handlePointsChange}
              onBlur={handlePointsBlur}
              onFocus={() => {
                // Clear the field when focused if it's 0
                if (usePoints === 0) setUsePoints('');
              }}
              className="form-input"
            />
            {pointsNum > 0 && (
              <p className="points-discount-info">
                Discount: -{formatPrice(pointsNum / 100)}
              </p>
            )}
          </div>
        )}

        {/* Summary */}
        {(() => {
          const promoDiscount = promoStatus?.valid ? promoStatus.discount : 0;
          const pointsDiscount = pointsNum / 100;
          const totalDiscount = promoDiscount + pointsDiscount;
          const productTotal = Math.max(baseTotal - totalDiscount, 0);
          const finalTotal = productTotal + deliveryCharge;
          const isCOD = paymentMethod === 'cash_on_delivery';
          return (
            <div className="payment-summary">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatPrice(baseTotal)}</span>
              </div>
              {promoDiscount > 0 && (
                <div className="summary-row discount">
                  <span>Promo Discount</span>
                  <span>-{formatPrice(promoDiscount)}</span>
                </div>
              )}
              {pointsDiscount > 0 && (
                <div className="summary-row discount">
                  <span>Points Discount</span>
                  <span>-{formatPrice(pointsDiscount)}</span>
                </div>
              )}
              <div className="summary-row">
                <span>Delivery Charge {deliveryLoading ? '(loading...)' : district ? `(${district})` : '(enter district)'}</span>
                <span>{deliveryLoading ? '...' : deliveryCharge > 0 ? `৳${deliveryCharge.toFixed(2)}` : district ? '৳0.00' : '-'}</span>
              </div>
              {isCOD ? (
                <>
                  <div className="summary-row total">
                    <span>Total (Products + Delivery)</span>
                    <span>{formatPrice(finalTotal)}</span>
                  </div>
                  {codAdvanceTotal > 0 ? (
                    <>
                      <div className="summary-row" style={{ color: '#16a34a', fontWeight: 700, borderTop: '1px dashed #d1fae5', marginTop: '6px', paddingTop: '8px' }}>
                        <span><Banknote size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Pay Now (Advance to Confirm)</span>
                        <span>৳{codAdvanceTotal.toFixed(2)}</span>
                      </div>
                      <div className="summary-row" style={{ color: '#92400e', fontWeight: 600 }}>
                        <span>Remaining Due on Delivery</span>
                        <span>৳{Math.max(0, finalTotal - codAdvanceTotal).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="summary-row" style={{ color: '#92400e', fontWeight: 600, borderTop: '1px dashed #fed7aa', marginTop: '6px', paddingTop: '8px' }}>
                      <span>Pay on Delivery (no advance required)</span>
                      <span>৳{finalTotal.toFixed(2)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="summary-row total">
                  <span>Total</span>
                  <span>{formatPrice(finalTotal)}</span>
                </div>
              )}
            </div>
          );
        })()}

        <motion.button
          type="submit"
          className="payment-submit-btn"
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {(() => {
            const promoDiscount = promoStatus?.valid ? promoStatus.discount : 0;
            const productTotal = Math.max(baseTotal - promoDiscount - (pointsNum / 100), 0);
            const finalTotal = productTotal + deliveryCharge;
            if (paymentMethod === 'cash_on_delivery') {
              if (codAdvanceTotal > 0) {
                return loading ? 'Processing...' : `Confirm COD — Pay Advance ৳${codAdvanceTotal.toFixed(2)}`;
              }
              return loading ? 'Processing...' : 'Confirm COD Order (Pay on Delivery)';
            }
            return loading ? 'Processing...' : `Pay ${formatPrice(finalTotal)}`;
          })()}
        </motion.button>
      </form>
    </Modal>
  );
};

export default PaymentModal;