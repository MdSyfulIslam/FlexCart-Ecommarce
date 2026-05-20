import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, X, Check, ShoppingBag, Truck, Package,
  MessageSquare, Star, Tag, Zap, Settings, Building2
} from 'lucide-react';
import { NotificationContext } from '../../context/NotificationContext';
import { AuthContext } from '../../context/AuthContext';
import { timeAgo } from '../../utils/helpers';
import './NotificationDropdown.css';

const NOTIF_ICON_MAP = {
  order_confirmed:        { Icon: ShoppingBag,   color: '#10B981' },
  order_shipped:          { Icon: Truck,          color: '#6366F1' },
  order_delivered:        { Icon: Package,        color: '#10B981' },
  product_back_in_stock:  { Icon: Bell,           color: '#F59E0B' },
  comment_reply:          { Icon: MessageSquare,  color: '#3B82F6' },
  review_opinion:         { Icon: Star,           color: '#F59E0B' },
  discount_offer:         { Icon: Tag,            color: '#EF4444' },
  spin_reward:            { Icon: Zap,            color: '#8B5CF6' },
  system:                 { Icon: Settings,       color: '#64748B' },
  company_update:         { Icon: Building2,      color: '#3B82F6' },
};

const NotificationDropdown = ({ onClose }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useContext(NotificationContext);
  const { isAuthenticated } = useContext(AuthContext);

  return (
    <motion.div className="notification-dropdown" initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}>
      <div className="notif-header">
        <h3><Bell size={16} /> Notifications {unreadCount > 0 && `(${unreadCount})`}</h3>
        <div className="notif-header-actions">
          {unreadCount > 0 && (
            <button className="mark-all-btn" onClick={markAllAsRead}>
              <Check size={14} /> Mark all read
            </button>
          )}
          <button onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      <div className="notif-list">
        {!isAuthenticated ? (
          <div className="notif-empty"><p>Please log in to view notifications</p></div>
        ) : notifications.length === 0 ? (
          <div className="notif-empty"><Bell size={28} style={{ opacity: 0.3 }}/><p>No notifications yet</p></div>
        ) : (
          notifications.map(notif => {
            const info = NOTIF_ICON_MAP[notif.type] || NOTIF_ICON_MAP.system;
            const { Icon, color } = info;
            return (
              <div key={notif.id} className={`notif-item ${!notif.is_read ? 'unread' : ''}`}
                onClick={() => markAsRead(notif.id)}>
                <span className="notif-icon" style={{ background: `${color}15`, color }}>
                  <Icon size={16} />
                </span>
                <div className="notif-content">
                  <p className="notif-title">{notif.title}</p>
                  <p className="notif-message">{notif.message}</p>
                  <p className="notif-time">{timeAgo(notif.created_at)}</p>
                </div>
                {!notif.is_read && <div className="notif-unread-dot" />}
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
};

export default NotificationDropdown;