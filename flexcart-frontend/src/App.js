import React, { useContext, lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AuthContext } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider } from './context/NotificationContext';
import { CompanyProvider } from './context/CompanyContext';
import { NavigationProvider } from './context/NavigationContext';
import MainLayout from './components/layout/MainLayout';
import AdminLoginPage from './components/admin/AdminLoginPage';
import Toast from './components/common/Toast';
import MaintenancePage from './components/common/MaintenancePage';
import PaymentResultPage from './components/common/PaymentResultPage';
import './App.css';

// Lazy-load heavy admin portal to keep the main bundle lean
const ExternalPortal = lazy(() => import('./components/portal/ExternalPortal'));

const ROLE_TO_PORTAL = {
  super_admin:    'super-admin',
  staff_admin:    'staff-admin',
  delivery_admin: 'delivery-admin',
  delivery_boy:   'delivery-boy',
};

// Ensures authenticated admins are never shown the user panel
const AdminGuard = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    // While auth resolves, show minimal spinner (not user panel)
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0f172a'
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid #334155', borderTopColor: '#3b82f6',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // If the loaded user is an admin, redirect to their portal
  if (user && ROLE_TO_PORTAL[user.role]) {
    window.location.href = `/?portal=${ROLE_TO_PORTAL[user.role]}`;
    return null;
  }

  return children;
};

function App() {
    // ── Maintenance mode — set REACT_APP_MAINTENANCE=true in Vercel env vars ──
    if (process.env.REACT_APP_MAINTENANCE === 'true') {
      return <MaintenancePage />;
    }

    const pathname = window.location.pathname;
    const portal = new URLSearchParams(window.location.search).get('portal');

    // SSLCommerz payment result pages
    const isPaymentResult = pathname === '/payment/success' || pathname === '/payment/fail';
    if (isPaymentResult) {
      return (
        <AuthProvider>
          <ThemeProvider>
            <div className="app">
              <PaymentResultPage />
              <Toast />
            </div>
          </ThemeProvider>
        </AuthProvider>
      );
    }

    // Dedicated admin login page
    const isAdminLogin = pathname === '/admin' || pathname === '/admin/login' || pathname.startsWith('/admin/login');

    // Portal panels — query-param based routing
    const isPortal = ['delivery-admin', 'delivery-boy', 'staff-admin', 'super-admin'].includes(portal);

    // Fast redirect: if no portal param in URL but admin hint + token exist,
    // redirect immediately (before React auth round-trip) — only when a valid
    // session is likely present (token exists).
    if (!isPortal && !isAdminLogin) {
      const savedPortal = localStorage.getItem('fc_admin_portal');
      const hasToken   = !!localStorage.getItem('flexcart_token');
      if (savedPortal && hasToken && ['delivery-admin', 'delivery-boy', 'staff-admin', 'super-admin'].includes(savedPortal)) {
        window.location.replace(`/?portal=${savedPortal}`);
        return null;
      }
    }

    return (
        <AuthProvider>
            <ThemeProvider>
                <div className="app">
                    {isAdminLogin ? (
                        <AdminLoginPage />
                    ) : isPortal ? (
                        <Suspense fallback={null}>
                            <ExternalPortal portal={portal} />
                        </Suspense>
                    ) : (
                        <AdminGuard>
                            <CartProvider>
                                <NotificationProvider>
                                    <CompanyProvider>
                                        <NavigationProvider>
                                            <MainLayout />
                                        </NavigationProvider>
                                    </CompanyProvider>
                                </NotificationProvider>
                            </CartProvider>
                        </AdminGuard>
                    )}
                    <Toast />
                </div>
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;