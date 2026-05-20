import React, { useEffect, useState } from 'react';

/**
 * Shown after SSLCommerz redirects back to:
 *   /payment/success?order=FC-xxx   (success)
 *   /payment/fail?reason=...        (fail / cancel)
 */
const PaymentResultPage = () => {
  const isSuccess = window.location.pathname === '/payment/success';
  const params    = new URLSearchParams(window.location.search);
  const orderNumber = params.get('order');
  const reason      = params.get('reason') || 'payment_failed';

  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = '/';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const reasonLabel = {
    payment_failed:     'Your payment could not be processed.',
    validation_failed:  'Payment verification failed. No charge was made.',
    order_not_found:    'We could not match the payment to your order.',
    cancelled:          'You cancelled the payment.',
    invalid_callback:   'Invalid payment response received.',
    server_error:       'A server error occurred. Please contact support.',
    stock_unavailable:  'Sorry, an item in your order is out of stock. No charge was made.',
  }[reason] || 'Payment was not completed.';

  const styles = {
    page: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '24px',
    },
    card: {
      background: '#1e293b',
      borderRadius: '16px',
      padding: '48px 40px',
      maxWidth: '480px',
      width: '100%',
      textAlign: 'center',
      boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      border: `1px solid ${isSuccess ? '#166534' : '#7f1d1d'}`,
    },
    icon: {
      fontSize: '64px',
      marginBottom: '16px',
    },
    title: {
      fontSize: '24px',
      fontWeight: 700,
      color: isSuccess ? '#4ade80' : '#f87171',
      marginBottom: '12px',
    },
    subtitle: {
      fontSize: '15px',
      color: '#94a3b8',
      marginBottom: '24px',
      lineHeight: 1.6,
    },
    orderBox: {
      background: '#0f172a',
      borderRadius: '8px',
      padding: '12px 20px',
      marginBottom: '24px',
      fontSize: '14px',
      color: '#cbd5e1',
    },
    orderNum: {
      fontWeight: 700,
      color: '#60a5fa',
      fontSize: '16px',
    },
    countdown: {
      fontSize: '13px',
      color: '#64748b',
      marginTop: '16px',
    },
    btn: {
      display: 'inline-block',
      padding: '12px 28px',
      borderRadius: '8px',
      background: isSuccess ? '#16a34a' : '#2563eb',
      color: '#fff',
      fontWeight: 600,
      fontSize: '15px',
      cursor: 'pointer',
      border: 'none',
      textDecoration: 'none',
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>{isSuccess ? '✅' : '❌'}</div>
        <h1 style={styles.title}>
          {isSuccess ? 'Payment Successful!' : 'Payment Failed'}
        </h1>
        <p style={styles.subtitle}>
          {isSuccess
            ? 'Your advance payment was confirmed. Your order is now active and will be delivered to you. Remaining balance is due on delivery.'
            : reasonLabel}
        </p>

        {isSuccess && orderNumber && (
          <div style={styles.orderBox}>
            Order Number: <span style={styles.orderNum}>{orderNumber}</span>
            <br />
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              You can track your order in Order History.
            </span>
          </div>
        )}

        <a href="/" style={styles.btn}>
          {isSuccess ? 'Continue Shopping' : 'Back to FlexCart'}
        </a>

        <p style={styles.countdown}>
          Redirecting in {countdown}s…
        </p>
      </div>
    </div>
  );
};

export default PaymentResultPage;
