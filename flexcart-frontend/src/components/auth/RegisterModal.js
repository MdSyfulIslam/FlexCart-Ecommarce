import React, { useState, useContext } from 'react';
import Modal from '../common/Modal';
import { AuthContext } from '../../context/AuthContext';
import { FiUser, FiMail, FiLock, FiPhone, FiMapPin, FiEye, FiEyeOff, FiUserPlus } from 'react-icons/fi';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { validateEmail, isValidUsername, isValidPhone } from '../../utils/validators';
import './RegisterModal.css';

const RegisterModal = ({ isOpen, onClose, onSwitchToLogin }) => {
  const { register } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    address: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isValidUsername(formData.username)) {
      toast.error('Username must be 3–50 characters: letters, numbers, or underscores only');
      return;
    }

    if (!validateEmail(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (formData.phone && !isValidPhone(formData.phone)) {
      toast.error('Phone must be a valid Bangladesh number (e.g. 01712345678)');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const result = await register({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      phone: formData.phone,
      address: formData.address
    });

    if (result.success) {
      toast.success(`Welcome to FlexCart, ${result.user.username}!`);
      onClose();
      setFormData({
        username: '', email: '', password: '',
        confirmPassword: '', phone: '', address: ''
      });
    } else {
      toast.error(result.message);
    }

    setLoading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Account" size="medium">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-logo-section">
          <span className="auth-logo">FlexC</span>
          <span className="auth-logo-cart"><ShoppingCart size={20} /></span>
          <p className="auth-subtitle">Join FlexCart today</p>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Username *</label>
            <div className="input-with-icon">
              <FiUser className="input-icon" />
              <input
                type="text"
                name="username"
                placeholder="e.g. md_syful_islam"
                value={formData.username}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <div className="input-with-icon">
              <FiMail className="input-icon" />
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Password *</label>
            <div className="input-with-icon">
              <FiLock className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Min 6 characters"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                className="form-input"
              />
              <button
                type="button"
                className="input-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password *</label>
            <div className="input-with-icon">
              <FiLock className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="Repeat password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="form-input"
              />
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <div className="input-with-icon">
              <FiPhone className="input-icon" />
              <input
                type="tel"
                name="phone"
                placeholder="01712345678"
                value={formData.phone}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Address</label>
            <div className="input-with-icon">
              <FiMapPin className="input-icon" />
              <input
                type="text"
                name="address"
                placeholder="Your address"
                value={formData.address}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>
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
              <motion.span
                className="spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              Creating Account...
            </span>
          ) : (
            <>
              <FiUserPlus size={18} />
              Create Account
            </>
          )}
        </motion.button>

        <div className="auth-switch">
          <span>Already have an account?</span>
          <button type="button" className="auth-switch-btn" onClick={onSwitchToLogin}>
            Sign In
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RegisterModal;