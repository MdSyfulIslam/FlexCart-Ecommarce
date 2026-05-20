import React, { useState, useContext } from 'react';
import Modal from '../common/Modal';
import { AuthContext } from '../../context/AuthContext';
import { FiMail, FiLock, FiEye, FiEyeOff, FiLogIn, FiShield, FiArrowLeft, FiCheck } from 'react-icons/fi';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import api from '../../services/api';
import './LoginModal.css';

const MODAL_TITLES = {
  login: 'Welcome Back',
  forgot: 'Reset Password',
  verify: 'Verify OTP',
  reset: 'Set New Password',
};

const LoginModal = ({ isOpen, onClose, onSwitchToRegister }) => {
  const { login } = useContext(AuthContext);
  const [view, setView] = useState('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [fpEmail, setFpEmail] = useState('');
  const [fpLoading, setFpLoading] = useState(false);

  // OTP state
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [rpLoading, setRpLoading] = useState(false);

  const resetAll = () => {
    setView('login');
    setFpEmail(''); setOtp(''); setResetToken('');
    setNewPassword(''); setConfirmPassword('');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      toast.success(`Welcome back, ${result.user.username}!`);
      setEmail(''); setPassword('');
      onClose();
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!fpEmail.trim()) { toast.error('Please enter your email'); return; }
    setFpLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: fpEmail.trim(), portal: 'user' });
      toast.success('OTP sent! Check your email inbox.');
      setView('verify');
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
    setFpLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setOtpLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email: fpEmail.trim(), otp: otp.trim(), portal: 'user' });
      if (res.data.success) {
        setResetToken(res.data.data.reset_token);
        setView('reset');
      } else {
        toast.error(res.data.message || 'Invalid OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired OTP');
    }
    setOtpLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setRpLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { reset_token: resetToken, new_password: newPassword });
      if (res.data.success) {
        toast.success('Password reset! Please sign in with your new password.');
        resetAll();
      } else {
        toast.error(res.data.message || 'Reset failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed. Please start over.');
    }
    setRpLoading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={MODAL_TITLES[view]} size="small">

      {/* ── LOGIN ── */}
      {view === 'login' && (
        <form className="auth-form" onSubmit={handleLogin}>
          <div className="auth-logo-section">
            <span className="auth-logo">FlexC</span>
            <span className="auth-logo-cart"><ShoppingCart size={20} /></span>
            <p className="auth-subtitle">Sign in to your account</p>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-with-icon">
              <FiMail className="input-icon" />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-with-icon">
              <FiLock className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
                minLength={6}
              />
              <button type="button" className="input-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => { setFpEmail(email); setView('forgot'); }}
            >
              Forgot password?
            </button>
          </div>

          <motion.button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (
              <span className="btn-loading">
                <motion.span className="spinner" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                Signing in...
              </span>
            ) : (
              <><FiLogIn size={18} /> Sign In</>
            )}
          </motion.button>

          <div className="auth-switch">
            <span>Don't have an account?</span>
            <button type="button" className="auth-switch-btn" onClick={onSwitchToRegister}>
              Create Account
            </button>
          </div>
        </form>
      )}

      {/* ── FORGOT PASSWORD – Enter Email ── */}
      {view === 'forgot' && (
        <form className="auth-form" onSubmit={handleForgot}>
          <div className="auth-logo-section">
            <FiShield size={36} className="auth-reset-icon" />
            <p className="auth-subtitle">Enter your registered email and we'll send you a one-time code.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-with-icon">
              <FiMail className="input-icon" />
              <input
                type="email"
                placeholder="Your registered email"
                value={fpEmail}
                onChange={(e) => setFpEmail(e.target.value)}
                required
                className="form-input"
              />
            </div>
          </div>

          <motion.button
            type="submit"
            className="auth-submit-btn"
            disabled={fpLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {fpLoading ? 'Sending OTP…' : 'Send OTP'}
          </motion.button>

          <button type="button" className="auth-back-link" onClick={() => setView('login')}>
            <FiArrowLeft size={14} /> Back to Sign In
          </button>
        </form>
      )}

      {/* ── VERIFY OTP ── */}
      {view === 'verify' && (
        <form className="auth-form" onSubmit={handleVerifyOtp}>
          <div className="auth-logo-section">
            <FiShield size={36} className="auth-reset-icon" />
            <p className="auth-subtitle">
              We sent a 6-digit code to <strong>{fpEmail}</strong>. Enter it below — it expires in 10 minutes.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">One-Time Password (OTP)</label>
            <div className="input-with-icon">
              <FiShield className="input-icon" />
              <input
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="form-input auth-otp-input"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>
          </div>

          <motion.button
            type="submit"
            className="auth-submit-btn"
            disabled={otpLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {otpLoading ? 'Verifying…' : <><FiCheck size={16} /> Verify OTP</>}
          </motion.button>

          <button type="button" className="auth-back-link" onClick={() => setView('forgot')}>
            <FiArrowLeft size={14} /> Resend / Change email
          </button>
        </form>
      )}

      {/* ── RESET PASSWORD ── */}
      {view === 'reset' && (
        <form className="auth-form" onSubmit={handleResetPassword}>
          <div className="auth-logo-section">
            <FiShield size={36} className="auth-reset-icon" />
            <p className="auth-subtitle">Create a new password for your account.</p>
          </div>

          <div className="form-group">
            <label className="form-label">New Password</label>
            <div className="input-with-icon">
              <FiLock className="input-icon" />
              <input
                type={showNew ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="form-input"
                minLength={6}
              />
              <button type="button" className="input-toggle" onClick={() => setShowNew(v => !v)}>
                {showNew ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <div className="input-with-icon">
              <FiLock className="input-icon" />
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="form-input"
              />
              <button type="button" className="input-toggle" onClick={() => setShowConfirm(v => !v)}>
                {showConfirm ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
          </div>

          <motion.button
            type="submit"
            className="auth-submit-btn"
            disabled={rpLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {rpLoading ? 'Saving…' : <><FiCheck size={16} /> Set New Password</>}
          </motion.button>
        </form>
      )}
    </Modal>
  );
};

export default LoginModal;
