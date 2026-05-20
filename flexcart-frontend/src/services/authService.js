import api from './api';

const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  refreshToken: (refreshToken) => api.post('/auth/refresh-token', { refreshToken }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  verifyOtp: (email, otp) => api.post('/auth/verify-otp', { email, otp }),
  resetPassword: (reset_token, new_password) => api.post('/auth/reset-password', { reset_token, new_password }),
  getLinkedAccounts: () => api.get('/auth/linked-accounts'),
  linkAccount: (credentials) => api.post('/auth/link-account', credentials),
  unlinkAccount: (accountId) => api.post('/auth/unlink-account', { accountId }),
  switchAccount: (accountId) => api.post('/auth/switch-account', { accountId })
};

export default authService;
