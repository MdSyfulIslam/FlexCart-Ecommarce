import React, { useContext, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiMinus, FiPlus, FiTrash2, FiShoppingBag } from 'react-icons/fi';
import { ShoppingCart, Package } from 'lucide-react';
import { CartContext } from '../../context/CartContext';
import { AuthContext } from '../../context/AuthContext';
import PaymentModal from './PaymentModal';
import { formatPrice, getImageUrl } from '../../utils/helpers';
import './CartDropdown.css';

const CartDropdown = ({ onClose }) => {
  const { cartItems, cartCount, updateQuantity, removeItem } = useContext(CartContext);
  const { isAuthenticated } = useContext(AuthContext);
  const [showPayment, setShowPayment] = useState(false);

  // Track selected item IDs — all selected by default when cart changes
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    setSelectedIds(new Set(cartItems.map(i => i.id)));
  }, [cartItems]);

  const selectedItems = useMemo(
    () => cartItems.filter(i => selectedIds.has(i.id)),
    [cartItems, selectedIds]
  );

  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, i) => sum + parseFloat(i.total_price || i.current_price * i.quantity), 0),
    [selectedItems]
  );

  const selectedQuantity = useMemo(
    () => selectedItems.reduce((sum, i) => sum + (i.quantity || 1), 0),
    [selectedItems]
  );

  const allSelected = cartItems.length > 0 && selectedIds.size === cartItems.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cartItems.map(i => i.id)));
    }
  };

  const toggleItem = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isAuthenticated) {
    return (
      <motion.div
        className="cart-dropdown"
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
      >
        <div className="cart-dropdown-header">
          <h3>Shopping Cart</h3>
          <button className="cart-close-btn" onClick={onClose}><FiX size={18} /></button>
        </div>
        <div className="cart-empty">
          <ShoppingCart size={40} />
          <p>Please log in to view your cart</p>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        className="cart-dropdown"
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <div className="cart-dropdown-header">
          <h3>Shopping Cart ({cartCount})</h3>
          <button className="cart-close-btn" onClick={onClose}><FiX size={18} /></button>
        </div>

        {cartItems.length === 0 ? (
          <div className="cart-empty">
            <ShoppingCart size={40} />
            <p>Your cart is empty</p>
            <p className="cart-empty-sub">Start shopping to add items!</p>
          </div>
        ) : (
          <>
            {/* Select all row */}
            <div className="cart-select-all-row">
              <label className="cart-checkbox-label">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="cart-checkbox"
                />
                <span>Select All ({cartItems.length})</span>
              </label>
              {selectedIds.size > 0 && selectedIds.size < cartItems.length && (
                <span className="cart-selected-count">{selectedIds.size} selected</span>
              )}
            </div>

            <div className="cart-items-list">
              {cartItems.map(item => (
                <motion.div
                  key={item.id}
                  className={`cart-item ${!selectedIds.has(item.id) ? 'cart-item--unselected' : ''}`}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <label className="cart-item-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="cart-checkbox"
                    />
                  </label>

                  <div className="cart-item-img">
                    {item.image_url ? (
                      <img src={getImageUrl(item.image_url)} alt={item.name} />
                    ) : <Package size={32} />}
                  </div>

                  <div className="cart-item-details">
                    <p className="cart-item-name">{item.name}</p>
                    <p className="cart-item-company">{item.company_name}</p>
                    <p className="cart-item-price">{formatPrice(item.current_price)}</p>
                  </div>

                  <div className="cart-item-actions">
                    <div className="cart-quantity-control">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <FiMinus size={12} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= item.stock_quantity}
                        title={item.quantity >= item.stock_quantity ? `Max stock: ${item.stock_quantity}` : ''}
                        style={item.quantity >= item.stock_quantity ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                      >
                        <FiPlus size={12} />
                      </button>
                    </div>

                    <p className="cart-item-total">{formatPrice(item.total_price)}</p>

                    <button className="cart-remove-btn" onClick={() => removeItem(item.id)}>
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="cart-footer">
              <div className="cart-total-row">
                <span>
                  {selectedIds.size < cartItems.length
                    ? `Selected (${selectedIds.size})`
                    : 'Total'}
                </span>
                <span className="cart-total-price">{formatPrice(selectedTotal)}</span>
              </div>
              <motion.button
                className="cart-checkout-btn"
                onClick={() => { if (selectedIds.size > 0) setShowPayment(true); }}
                disabled={selectedIds.size === 0}
                whileHover={{ scale: selectedIds.size > 0 ? 1.02 : 1 }}
                whileTap={{ scale: selectedIds.size > 0 ? 0.98 : 1 }}
                style={selectedIds.size === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                <FiShoppingBag size={18} />
                {selectedIds.size === 0
                  ? 'Select items to checkout'
                  : `Checkout (${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''})`}
              </motion.button>
            </div>
          </>
        )}
      </motion.div>

      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            onClose();
          }}
          selectedItemIds={[...selectedIds]}
          selectedTotal={selectedTotal}
          selectedQuantity={selectedQuantity}
        />
      )}
    </>
  );
};

export default CartDropdown;
