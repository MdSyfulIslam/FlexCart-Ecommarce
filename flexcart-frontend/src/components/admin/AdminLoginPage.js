import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowLeft, LogIn, Shield, Check } from 'lucide-react';
import api from '../../services/api';
import './AdminLoginPage.css';

const ADMIN_ROLES = ['super_admin', 'staff_admin', 'delivery_admin', 'delivery_boy'];

const ROLE_REDIRECT = {
  super_admin:    '/?portal=super-admin',
  staff_admin:    '/?portal=staff-admin',
  delivery_admin: '/?portal=delivery-admin',
  delivery_boy:   '/?portal=delivery-boy',
};

const AdminLoginPage = () => {
  const { adminLogin, isAuthenticated, user, loading: authLoading } = useContext(AuthContext);

  // Login state
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'verify' | 'reset'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Forgot password state
  const [fpEmail,  setFpEmail]  = useState('');
  const [fpLoading, setFpLoading] = useState(false);

  // OTP state
  const [otp,      setOtp]      = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');

  // Reset password state
  const [newPass,  setNewPass]  = useState('');
  const [confPass, setConfPass] = useState('');
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [rpLoading, setRpLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (ADMIN_ROLES.includes(user.role)) {
        window.location.href = ROLE_REDIRECT[user.role];
      }
    }
  }, [isAuthenticated, user, authLoading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    const result = await adminLogin(email.trim(), password);
    setLoading(false);
    if (result.success) {
      const role = result.user?.role;
      if (ADMIN_ROLES.includes(role)) {
        window.location.href = ROLE_REDIRECT[role];
      } else {
        setError('This account does not have admin access. Contact the Super Admin.');
        localStorage.removeItem('flexcart_token');
        localStorage.removeItem('flexcart_refresh_token');
        window.location.reload();
      }
    } else {
      setError(result.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    if (!fpEmail.trim()) { setError('Please enter your email.'); return; }
    setFpLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: fpEmail.trim(), portal: 'admin' });
      setView('verify');
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setFpLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!otp.trim() || otp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    setOtpLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email: fpEmail.trim(), otp: otp.trim(), portal: 'admin' });
      if (res.data.success) {
        setResetToken(res.data.data.reset_token);
        setView('reset');
      } else {
        setError(res.data.message || 'Invalid OTP');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
    }
    setOtpLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPass.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPass !== confPass) { setError('Passwords do not match.'); return; }
    setRpLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { reset_token: resetToken, new_password: newPass });
      if (res.data.success) {
        setView('login');
        setEmail(fpEmail);
        setFpEmail(''); setOtp(''); setResetToken(''); setNewPass(''); setConfPass('');
        setError('');
        // show a success banner by temporarily using error field with green tone
        setTimeout(() => {
          alert('Password reset successfully! Please sign in with your new password.');
        }, 100);
      } else {
        setError(res.data.message || 'Reset failed.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Please start over.');
    }
    setRpLoading(false);
  };

  if (authLoading) {
    return (
      <div className="al-root al-root--loading">
        <div className="al-spinner" />
      </div>
    );
  }

  const VIEW_TITLES = {
    login:  'Welcome Back',
    forgot: 'Reset Password',
    verify: 'Verify OTP',
    reset:  'Set New Password',
  };

  return (
    <div className="al-root">
      <div className="al-bg" aria-hidden="true">
        <div className="al-bg-orb al-bg-orb--1" />
        <div className="al-bg-orb al-bg-orb--2" />
        <div className="al-bg-orb al-bg-orb--3" />
      </div>

      <div className="al-card">
        {/* Brand */}
        <div className="al-brand">
          <div className="al-brand-logo">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="al-brand-name">FlexCart</div>
            <div className="al-brand-sub">Admin Portal</div>
          </div>
        </div>

        <h1 className="al-title">{VIEW_TITLES[view]}</h1>

        {error && (
          <div className="al-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ── LOGIN ── */}
        {view === 'login' && (
          <form className="al-form" onSubmit={handleLogin} noValidate>
            <div className="al-field">
              <label htmlFor="al-email">Email Address</label>
              <div className="al-input-wrap">
                <Mail size={16} className="al-input-icon" />
                <input
                  id="al-email"
                  type="email"
                  className="al-input"
                  placeholder="admin@flexcart.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="al-field">
              <div className="al-field-label-row">
                <label htmlFor="al-password">Password</label>
                <button
                  type="button"
                  className="al-forgot-btn"
                  onClick={() => { setFpEmail(email); setError(''); setView('forgot'); }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="al-input-wrap">
                <Lock size={16} className="al-input-icon" />
                <input
                  id="al-password"
                  type={showPass ? 'text' : 'password'}
                  className="al-input al-input--pass"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="al-pass-toggle"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <button type="submit" className="al-submit" disabled={loading}>
              {loading
                ? <><div className="al-btn-spinner"/><span>Signing in…</span></>
                : <><LogIn size={18}/><span>Sign In</span></>
              }
            </button>
          </form>
        )}

        {/* ── FORGOT PASSWORD – Enter Email ── */}
        {view === 'forgot' && (
          <form className="al-form" onSubmit={handleForgot} noValidate>
            <p className="al-hint">Enter your admin email and we'll send you a one-time code.</p>
            <div className="al-field">
              <label htmlFor="al-fp-email">Admin Email</label>
              <div className="al-input-wrap">
                <Mail size={16} className="al-input-icon" />
                <input
                  id="al-fp-email"
                  type="email"
                  className="al-input"
                  placeholder="admin@flexcart.com"
                  value={fpEmail}
                  onChange={e => setFpEmail(e.target.value)}
                  required
                  disabled={fpLoading}
                />
              </div>
            </div>
            <button type="submit" className="al-submit" disabled={fpLoading}>
              {fpLoading
                ? <><div className="al-btn-spinner"/><span>Sending…</span></>
                : <><Shield size={18}/><span>Send OTP</span></>
              }
            </button>
            <button type="button" className="al-back" onClick={() => { setError(''); setView('login'); }}>
              <ArrowLeft size={15}/> Back to Sign In
            </button>
          </form>
        )}

        {/* ── VERIFY OTP ── */}
        {view === 'verify' && (
          <form className="al-form" onSubmit={handleVerifyOtp} noValidate>
            <p className="al-hint">
              A 6-digit code was sent to <strong>{fpEmail}</strong>. It expires in 10 minutes.
            </p>
            <div className="al-field">
              <label htmlFor="al-otp">One-Time Password</label>
              <div className="al-input-wrap">
                <Shield size={16} className="al-input-icon" />
                <input
                  id="al-otp"
                  type="text"
                  className="al-input al-otp-input"
                  placeholder="000000"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  disabled={otpLoading}
                />
              </div>
            </div>
            <button type="submit" className="al-submit" disabled={otpLoading}>
              {otpLoading
                ? <><div className="al-btn-spinner"/><span>Verifying…</span></>
                : <><Check size={18}/><span>Verify OTP</span></>
              }
            </button>
            <button type="button" className="al-back" onClick={() => { setError(''); setView('forgot'); }}>
              <ArrowLeft size={15}/> Resend / Change email
            </button>
          </form>
        )}

        {/* ── RESET PASSWORD ── */}
        {view === 'reset' && (
          <form className="al-form" onSubmit={handleResetPassword} noValidate>
            <p className="al-hint">OTP verified. Set your new admin password.</p>
            <div className="al-field">
              <label htmlFor="al-new-pass">New Password</label>
              <div className="al-input-wrap">
                <Lock size={16} className="al-input-icon" />
                <input
                  id="al-new-pass"
                  type={showNew ? 'text' : 'password'}
                  className="al-input al-input--pass"
                  placeholder="Min. 6 characters"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  required
                  disabled={rpLoading}
                />
                <button type="button" className="al-pass-toggle" onClick={() => setShowNew(v => !v)} tabIndex={-1}>
                  {showNew ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <div className="al-field">
              <label htmlFor="al-conf-pass">Confirm Password</label>
              <div className="al-input-wrap">
                <Lock size={16} className="al-input-icon" />
                <input
                  id="al-conf-pass"
                  type={showConf ? 'text' : 'password'}
                  className="al-input al-input--pass"
                  placeholder="Confirm new password"
                  value={confPass}
                  onChange={e => setConfPass(e.target.value)}
                  required
                  disabled={rpLoading}
                />
                <button type="button" className="al-pass-toggle" onClick={() => setShowConf(v => !v)} tabIndex={-1}>
                  {showConf ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <button type="submit" className="al-submit" disabled={rpLoading}>
              {rpLoading
                ? <><div className="al-btn-spinner"/><span>Saving…</span></>
                : <><Check size={18}/><span>Set New Password</span></>
              }
            </button>
          </form>
        )}

        {view === 'login' && (
          <div className="al-footer">
            No account? Contact the Super Admin to get access.
          </div>
        )}

        <a href="/" className="al-back-home">
          <ArrowLeft size={15}/> Back to FlexCart
        </a>
      </div>
    </div>
  );
};

export default AdminLoginPage;
