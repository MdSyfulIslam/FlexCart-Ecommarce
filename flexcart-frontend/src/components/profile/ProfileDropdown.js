import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import {
  FiUser, FiRefreshCw, FiLogOut,
  FiSun, FiImage, FiSettings, FiChevronRight, FiPlusCircle, FiClock, FiCheckCircle
} from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { CompanyContext } from '../../context/CompanyContext';
import { getImageUrl } from '../../utils/helpers';
import { toast } from 'react-toastify';
import './ProfileDropdown.css';

const ProfileDropdown = ({ onClose, onOpenModal, onRequireLogin, onRequireRegister }) => {
  const { user, isAuthenticated, logout } = useContext(AuthContext);
  const { myCompanies } = useContext(CompanyContext);

  // Determine company status for the current user
  const pendingCompany = myCompanies.find(c => c.verification_status === 'pending');
  const approvedCompany = myCompanies.find(c => c.verification_status === 'approved');
  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    onClose();
  };

  const handleOptionClick = (modalName) => {
    // These options don't require auth
    const noAuthRequired = ['appearance', 'backgroundTheme', 'settings'];

    if (!isAuthenticated && !noAuthRequired.includes(modalName)) {
      onRequireLogin();
      return;
    }

    // Tell PARENT to open the modal (parent manages state)
    onOpenModal(modalName);
  };

  const menuItems = [
    { id: 'my-profile', label: 'My Profile', icon: FiUser, modal: 'myProfile' },
    { id: 'switch-account', label: 'Switch Account', icon: FiRefreshCw, modal: 'switchAccount' },
    // Company item: dynamic based on verification status
    approvedCompany
      ? { id: 'company-dashboard', label: 'My Company', icon: FiCheckCircle, modal: 'companyDashboard' }
      : pendingCompany
        ? { id: 'company-pending', label: 'Application Pending', icon: FiClock, modal: null, disabled: true }
        : { id: 'create-company', label: 'Create Company', icon: FiPlusCircle, modal: 'createCompany' },
    { id: 'appearance', label: 'Appearance', icon: FiSun, modal: 'appearance' },
    { id: 'background-theme', label: 'Background Theme', icon: FiImage, modal: 'backgroundTheme' },
    { id: 'settings', label: 'Settings', icon: FiSettings, modal: 'settings' },
  ];

  return (
    <motion.div
      className="profile-dropdown"
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      {/* User Info */}
      {isAuthenticated && user ? (
        <div className="pd-user-info">
          <div className="pd-avatar">
            {user.profile_image ? (
              <img src={getImageUrl(user.profile_image)} alt={user.username} />
            ) : (
              <span>{user.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <div className="pd-user-details">
            <p className="pd-username">{user.username}</p>
            <p className="pd-email">{user.email}</p>
          </div>
        </div>
      ) : (
        <div className="pd-guest-info">
          <div className="pd-avatar guest">
            <FiUser size={20} />
          </div>
          <div className="pd-user-details">
            <p className="pd-username">Guest User</p>
            <p className="pd-email">Sign in to access all features</p>
          </div>
        </div>
      )}

      <div className="pd-divider" />

      {/* Menu Items */}
      <div className="pd-menu">
        {menuItems.map(item => {
          const Icon = item.icon;
          if (item.disabled) {
            return (
              <div key={item.id} className="pd-menu-item pd-menu-item--disabled">
                <Icon size={17} />
                <span>{item.label}</span>
              </div>
            );
          }
          return (
            <button
              key={item.id}
              className="pd-menu-item"
              onClick={() => handleOptionClick(item.modal)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
              <FiChevronRight size={14} className="pd-arrow" />
            </button>
          );
        })}
      </div>

      <div className="pd-divider" />

      {/* Logout / Login */}
      {isAuthenticated ? (
        <button className="pd-menu-item pd-logout" onClick={handleLogout}>
          <FiLogOut size={17} />
          <span>Logout</span>
        </button>
      ) : (
        <div className="pd-auth-buttons">
          <button className="pd-login-btn" onClick={onRequireLogin}>
            Sign In
          </button>
          <button className="pd-register-btn" onClick={onRequireRegister || onRequireLogin}>
            Create Account
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default ProfileDropdown;