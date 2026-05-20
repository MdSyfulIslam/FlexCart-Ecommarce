import React, { useContext, useEffect } from 'react';
import { AuthContext } from '../../context/AuthContext';
import DeliveryAdminPanel from '../admin/delivery/DeliveryAdminPanel';
import DeliveryBoyPanel from '../admin/delivery/DeliveryBoyPanel';
import StaffAdminPanel from '../admin/staff/StaffAdminPanel';
import SuperAdminPanel from '../admin/super/SuperAdminPanel';
import './ExternalPortal.css';

// Maps each admin role to its correct portal slug
const ROLE_TO_PORTAL = {
  super_admin:    'super-admin',
  staff_admin:    'staff-admin',
  delivery_admin: 'delivery-admin',
  delivery_boy:   'delivery-boy',
};

const ExternalPortal = ({ portal }) => {
  const { isAuthenticated, user, loading } = useContext(AuthContext);

  // Redirect unauthenticated visitors to the dedicated admin login page
  const handleRequireAuth = () => {
    window.location.href = '/admin/login';
  };

  // After auth resolves: enforce role ↔ portal match
  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !user) {
      window.location.href = '/admin/login';
      return;
    }

    const correctPortal = ROLE_TO_PORTAL[user.role];
    if (!correctPortal) {
      // Authenticated but not an admin role — clear hint and go to user login
      localStorage.removeItem('fc_admin_portal');
      window.location.href = '/';
      return;
    }

    if (correctPortal !== portal) {
      // Super admin can also access the staff-admin panel without being redirected
      const isStaffAdminPortal = portal === 'staff-admin' && user.role === 'super_admin';
      if (!isStaffAdminPortal) {
        // On the wrong portal — redirect to the correct one
        window.location.href = `/?portal=${correctPortal}`;
      }
    }
  }, [loading, isAuthenticated, user, portal]);

  // While auth is resolving, render nothing to avoid any flash
  if (loading) return null;

  const panels = {
    'delivery-admin': <DeliveryAdminPanel onRequireAuth={handleRequireAuth} />,
    'delivery-boy':   <DeliveryBoyPanel   onRequireAuth={handleRequireAuth} />,
    'staff-admin':    <StaffAdminPanel    onRequireAuth={handleRequireAuth} />,
    'super-admin':    <SuperAdminPanel    onRequireAuth={handleRequireAuth} />,
  };

  return (
    <div className="external-portal">
      <div className="external-portal__content">
        {panels[portal] ?? null}
      </div>
    </div>
  );
};

export default ExternalPortal;
