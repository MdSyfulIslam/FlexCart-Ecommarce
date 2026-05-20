import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiPackage, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { Package, CheckCircle2, Banknote } from 'lucide-react';
import orderService from '../../services/orderService';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatPrice, formatDateTime, getImageUrl } from '../../utils/helpers';
import { ORDER_STATUSES } from '../../utils/constants';
import { connectSocket } from '../../services/socketService';
import './OrderHistory.css';

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      const response = await orderService.getOrderHistory({ limit: 50 });
      if (response.data.success) {
        setOrders(response.data.data.orders);
      }
    } catch (error) {
      console.error('Load orders error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 8000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    const refreshOrders = () => loadOrders();
    socket.on('order:status:changed', refreshOrders);
    socket.on('order:tracking:changed', refreshOrders);

    return () => {
      socket.off('order:status:changed', refreshOrders);
      socket.off('order:tracking:changed', refreshOrders);
    };
  }, [loadOrders]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="order-history">
      <div className="section-header">
        <h2><FiPackage /> Order History</h2>
        <p>{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <h3>No orders yet</h3>
          <p>Start shopping to see your order history</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order, index) => {
            const status = ORDER_STATUSES[order.order_status] || ORDER_STATUSES.pending;
            const statusLabel = order.delivery_status_text || (
              order.order_status === 'shipped'
                ? 'On the Way'
                : order.order_status === 'delivered'
                  ? 'Received'
                  : status.label
            );
            const isExpanded = expandedOrder === order.id;

            return (
              <motion.div
                key={order.id}
                className="order-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div
                  className="order-card-header"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="order-info">
                    <span className="order-number">#{order.order_number}</span>
                    <span className="order-date">{formatDateTime(order.created_at)}</span>
                  </div>
                  <div className="order-meta">
                    <span
                      className="order-status"
                      style={{ background: `${status.color}20`, color: status.color }}
                    >
                      {statusLabel}
                    </span>
                    <span className="order-total">{formatPrice(order.total_amount)}</span>
                    {isExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                  </div>
                </div>

                {isExpanded && order.items && (
                  <motion.div
                    className="order-items"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {order.items.map(item => (
                      <div key={item.id} className="order-item">
                        <div className="order-item-img">
                          {item.image_url ? (
                            <img src={getImageUrl(item.image_url)} alt={item.product_name} />
                          ) : <Package size={32} />}
                        </div>
                        <div className="order-item-info">
                          <p className="order-item-name">{item.product_name}</p>
                          <p className="order-item-company">{item.company_name}</p>
                          <p className="order-item-qty">Qty: {item.quantity} × {formatPrice(item.unit_price)}</p>
                        </div>
                        <span className="order-item-total">{formatPrice(item.total_price)}</span>
                      </div>
                    ))}

                    <div className="order-summary-row">
                      {order.discount_amount > 0 && (
                        <p>Discount: -{formatPrice(order.discount_amount)}</p>
                      )}
                      {order.points_used > 0 && (
                        <p>Points Used: {order.points_used}</p>
                      )}
                      {order.delivery_charge > 0 && (
                        <p>Delivery Charge: {formatPrice(order.delivery_charge)}</p>
                      )}
                      <p>Payment: {order.payment_method?.replace(/_/g, ' ')}</p>
                      {order.payment_method === 'cash_on_delivery' && (() => {
                        const advance = parseFloat(order.cod_advance_paid || 0);
                        const remaining = Math.max(0, parseFloat(order.total_amount) - advance);
                        return (
                          <div className="order-cod-summary">
                            {advance > 0 && (
                              <p className="order-cod-paid"><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Advance Paid: {formatPrice(advance)}</p>
                            )}
                            <p className="order-cod-due">
                              <Banknote size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />{advance > 0 ? 'Remaining Due on Delivery' : 'Total Due on Delivery'}: {formatPrice(remaining)}
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    {order.delivery && (
                      <div className="order-delivery">
                        <h4>Delivery Details</h4>
                        <div className="order-delivery-grid">
                          <p><b>Delivery Boy:</b> {order.delivery.delivery_boy_name}</p>
                          <p><b>Contact:</b> {order.delivery.delivery_boy_phone}</p>
                          <p><b>Vehicle:</b> {order.delivery.vehicle_plate}</p>
                          <p><b>Route:</b> {order.delivery.from_branch_name} → {order.delivery.to_branch_name}</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrderHistory;