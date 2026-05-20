import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Wake up Render free-tier backend on app load (it sleeps after 15 min inactivity).
// Use the api instance so the retry interceptor applies when the server is still cold.
const wakeUpBackend = () => {
  api.get('/health', { timeout: 60000, _isWakeUp: true }).catch(() => {});
};
wakeUpBackend();

// Request interceptor — attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('flexcart_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // For FormData (file uploads), remove Content-Type so the browser can set
    // multipart/form-data with the correct boundary automatically.
    // Without this, the default 'application/json' header would prevent multer
    // from parsing uploaded files on the backend.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper — redirect admin to login and clear stale tokens
const redirectToAdminLogin = () => {
  localStorage.removeItem('flexcart_token');
  localStorage.removeItem('flexcart_refresh_token');
  if (window.location.pathname.startsWith('/admin')) {
    window.location.replace('/admin/login');
  }
};

// Response interceptor — token refresh + global 401 handling + network retry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    // Retry network errors (e.g. Render cold-start drops the connection).
    // Allow up to 5 retries with exponential back-off capped at 30 s per attempt.
    // Total max wait ≈ 10+20+30+30+30 = 120 s — enough for Render's ~50 s cold start.
    if (!error.response) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      if (originalRequest._retryCount <= 5) {
        const delay = Math.min(10000 * originalRequest._retryCount, 30000);
        await new Promise(res => setTimeout(res, delay));
        return api(originalRequest);
      }
    }

    // Attempt silent token refresh on TOKEN_EXPIRED
    if (status === 401 && code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('flexcart_refresh_token');
        if (refreshToken) {
          const response = await axios.post(
            `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/refresh-token`,
            { refreshToken }
          );
          if (response.data.success) {
            const { accessToken, refreshToken: newRefreshToken } = response.data.data;
            localStorage.setItem('flexcart_token', accessToken);
            localStorage.setItem('flexcart_refresh_token', newRefreshToken);
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return api(originalRequest);
          }
        }
      } catch {
        redirectToAdminLogin();
        return Promise.reject(error);
      }
      // Refresh returned non-success
      redirectToAdminLogin();
      return Promise.reject(error);
    }

    // Any 401 on admin API calls means session is gone — go to login
    if (status === 401 && !originalRequest._retry) {
      const isAdminCall = originalRequest.url?.includes('/staff-admin') ||
                          originalRequest.url?.includes('/super-admin');
      if (isAdminCall) {
        redirectToAdminLogin();
      }
    }

    return Promise.reject(error);
  }
);

export default api;