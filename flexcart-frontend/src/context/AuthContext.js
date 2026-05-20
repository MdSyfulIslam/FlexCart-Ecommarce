import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const ADMIN_ROLES = ['super_admin', 'staff_admin', 'delivery_admin', 'delivery_boy'];
  const ROLE_TO_PORTAL = {
    super_admin:    'super-admin',
    staff_admin:    'staff-admin',
    delivery_admin: 'delivery-admin',
    delivery_boy:   'delivery-boy',
  };

  const loadUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('flexcart_token');
      if (!token) {
        setLoading(false);
        return;
      }

      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await api.get('/profile');

      if (response.data.success) {
        const userData = response.data.data;
        setUser(userData);
        setIsAuthenticated(true);
        // Store admin portal hint so routing survives refresh
        if (ADMIN_ROLES.includes(userData.role)) {
          localStorage.setItem('fc_admin_portal', ROLE_TO_PORTAL[userData.role]);
        } else {
          localStorage.removeItem('fc_admin_portal');
        }
      }
    } catch (error) {
      console.error('Load user error:', error);
      localStorage.removeItem('flexcart_token');
      localStorage.removeItem('flexcart_refresh_token');
      localStorage.removeItem('fc_admin_portal');
      delete api.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
        const { user: userData, accessToken, refreshToken } = response.data.data;
        localStorage.setItem('flexcart_token', accessToken);
        localStorage.setItem('flexcart_refresh_token', refreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        setUser(userData);
        setIsAuthenticated(true);
        return { success: true, user: userData };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      const isNetworkError = !error.response;
      return {
        success: false,
        message: isNetworkError
          ? 'Server is waking up, please try again in a moment...'
          : (error.response?.data?.message || 'Login failed')
      };
    }
  };

  const adminLogin = async (email, password) => {
    try {
      const response = await api.post('/auth/admin-login', { email, password });
      if (response.data.success) {
        const { user: userData, accessToken, refreshToken } = response.data.data;
        localStorage.setItem('flexcart_token', accessToken);
        localStorage.setItem('flexcart_refresh_token', refreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        setUser(userData);
        setIsAuthenticated(true);
        // Persist admin portal hint for routing
        if (ADMIN_ROLES.includes(userData.role)) {
          localStorage.setItem('fc_admin_portal', ROLE_TO_PORTAL[userData.role]);
        }
        return { success: true, user: userData };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      const isNetworkError = !error.response;
      return {
        success: false,
        message: isNetworkError
          ? 'Server is waking up, please try again in a moment...'
          : (error.response?.data?.message || 'Login failed')
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await api.post('/auth/register', userData);
      if (response.data.success) {
        const { user: newUser, accessToken, refreshToken } = response.data.data;
        localStorage.setItem('flexcart_token', accessToken);
        localStorage.setItem('flexcart_refresh_token', refreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        setUser(newUser);
        setIsAuthenticated(true);
        return { success: true, user: newUser };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed'
      };
    }
  };

  const logout = async () => {
    const wasAdmin = user && ADMIN_ROLES.includes(user.role);
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Continue with local logout even if API call fails
    }
    localStorage.removeItem('flexcart_token');
    localStorage.removeItem('flexcart_refresh_token');
    localStorage.removeItem('fc_admin_portal');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setIsAuthenticated(false);

    // Admin logout → always return to admin login page
    if (wasAdmin) {
      window.location.href = '/admin/login';
    } else {
      window.location.reload();
    }
  };

  const switchAccount = async (accountId) => {
    try {
      const response = await api.post('/auth/switch-account', { accountId });
      if (response.data.success) {
        const { user: switchedUser, accessToken, refreshToken } = response.data.data;
        localStorage.setItem('flexcart_token', accessToken);
        localStorage.setItem('flexcart_refresh_token', refreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        setUser(switchedUser);
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { success: false, message: 'Switch failed' };
    }
  };

  const updateUser = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated,
      login,
      adminLogin,
      register,
      logout,
      switchAccount,
      updateUser,
      loadUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};