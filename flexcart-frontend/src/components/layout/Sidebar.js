import React, { useState, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiHome, FiClock, FiPackage, FiHeart, FiUsers, FiGift,
  FiBarChart2, FiHelpCircle, FiMessageSquare, FiChevronRight,
  FiBriefcase, FiAward
} from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import './Sidebar.css';

const menuItems = [
  { id: 'home', label: 'Home', icon: FiHome, requiresAuth: false },
  { id: 'order-history', label: 'Order History', icon: FiClock, requiresAuth: true, hasTime: true },
  { id: 'request-product', label: 'Request Product', icon: FiPackage, requiresAuth: true },
  { id: 'favourite-product', label: 'Favourite Products', icon: FiHeart, requiresAuth: true },
  { id: 'following-companies', label: 'Following Companies', icon: FiUsers, requiresAuth: true },
  { id: 'company-dashboard', label: 'Company Dashboard', icon: FiBriefcase, requiresAuth: true },
  { id: 'company-leaderboard', label: 'Company Leaderboard', icon: FiAward, requiresAuth: true },
  { id: 'spin-reward', label: 'Spin & Reward', icon: FiGift, requiresAuth: true, hasTime: true },
  { id: 'review-graph', label: 'Review Graph', icon: FiBarChart2, requiresAuth: true },
  { id: 'support-help', label: 'Support / Help', icon: FiHelpCircle, requiresAuth: false },
  { id: 'feedback', label: 'Feedback', icon: FiMessageSquare, requiresAuth: false }
];

const Sidebar = ({ activeSection, onSectionChange, onRequireAuth, isMobileOpen }) => {
  const { isAuthenticated, user } = useContext(AuthContext);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSubMenu, setExpandedSubMenu] = useState(null);

  const role = user?.role || 'customer';
  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  const handleItemClick = (item) => {
    if (item.requiresAuth && !isAuthenticated) {
      onRequireAuth();
      return;
    }

    if (item.expandable) {
      setExpandedSubMenu(expandedSubMenu === item.id ? null : item.id);
    }

    onSectionChange(item.id);
  };

  return (
    <motion.aside
      className={`sidebar ${isExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'} ${isMobileOpen ? 'sidebar-mobile-open' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => {
        setIsExpanded(false);
        setExpandedSubMenu(null);
      }}
      animate={{
        width: isExpanded ? 280 : 70
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <nav className="sidebar-nav">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const isSubExpanded = expandedSubMenu === item.id;

          return (
            <div key={item.id} className="sidebar-item-wrapper">
              <motion.button
                className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
                onClick={() => handleItemClick(item)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                title={!isExpanded ? item.label : ''}
              >
                <div className="sidebar-item-icon">
                  <Icon size={20} />
                  {item.hasTime && isExpanded && (
                    <FiClock size={10} className="time-indicator" />
                  )}
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.span
                      className="sidebar-item-label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {isExpanded && item.expandable && (
                  <motion.div
                    className="sidebar-expand-arrow"
                    animate={{ rotate: isSubExpanded ? 90 : 0 }}
                  >
                    <FiChevronRight size={14} />
                  </motion.div>
                )}

                {isActive && (
                  <motion.div
                    className="sidebar-active-indicator"
                    layoutId="activeIndicator"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </motion.button>

              <AnimatePresence>
                {isSubExpanded && isExpanded && item.expandable && (
                  <motion.div
                    className="sidebar-submenu"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="sidebar-submenu-content">
                      <p className="sidebar-submenu-hint">
                        Click to view
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          );
        })}
      </nav>
    </motion.aside>
  );
};

export default Sidebar;