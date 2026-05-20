import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import {
  FiGlobe, FiDollarSign, FiBell, FiMail, FiShield,
  FiEye, FiPlay, FiDatabase, FiSave, FiLock, FiEyeOff
} from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import settingsService from '../../services/settingsService';
import { toast } from 'react-toastify';
import './Settings.css';

const Settings = ({ onClose }) => {
  const { isAuthenticated } = useContext(AuthContext);
  const [settings, setSettings] = useState({
    language: 'en',
    currency: 'USD',
    email_notifications: true,
    push_notifications: true,
    order_updates: true,
    promotional_emails: false,
    two_factor_auth: false,
    privacy_profile: 'public',
    auto_play_animations: true,
    data_sharing: false
  });
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (isAuthenticated) loadSettings();
  }, [isAuthenticated]);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getSettings();
      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      console.error('Load settings error:', error);
    }
  };

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    setHasChanges(true);
  };

  const handleSelect = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await settingsService.updateSettings(settings);
      if (response.data.success) {
        toast.success('Settings saved!');
        setHasChanges(false);
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    const { old_password, new_password, confirm_password } = pwForm;
    if (!old_password || !new_password || !confirm_password) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (new_password !== confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    if (new_password.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    setPwLoading(true);
    try {
      const res = await settingsService.changePassword({ old_password, new_password });
      if (res.data.success) {
        toast.success('Password updated successfully');
        setPwForm({ old_password: '', new_password: '', confirm_password: '' });
      } else {
        toast.error(res.data.message || 'Failed to update password');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  const settingsSections = [
    {
      title: 'General',
      items: [
        {
          icon: FiGlobe, label: 'Language', key: 'language', type: 'select',
          options: [
            { value: 'en', label: 'English' },
            { value: 'bn', label: 'বাংলা' },
            { value: 'es', label: 'Español' },
            { value: 'fr', label: 'Français' }
          ]
        },
        {
          icon: FiDollarSign, label: 'Currency', key: 'currency', type: 'select',
          options: [
            { value: 'USD', label: 'USD ($)' },
            { value: 'BDT', label: 'BDT (৳)' },
            { value: 'EUR', label: 'EUR (€)' },
            { value: 'GBP', label: 'GBP (£)' }
          ]
        }
      ]
    },
    {
      title: 'Notifications',
      items: [
        { icon: FiBell, label: 'Push Notifications', key: 'push_notifications', type: 'toggle' },
        { icon: FiMail, label: 'Email Notifications', key: 'email_notifications', type: 'toggle' },
        { icon: FiBell, label: 'Order Updates', key: 'order_updates', type: 'toggle' },
        { icon: FiMail, label: 'Promotional Emails', key: 'promotional_emails', type: 'toggle' }
      ]
    },
    {
      title: 'Privacy & Security',
      items: [
        { icon: FiShield, label: 'Two-Factor Authentication', key: 'two_factor_auth', type: 'toggle' },
        {
          icon: FiEye, label: 'Profile Visibility', key: 'privacy_profile', type: 'select',
          options: [
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' }
          ]
        },
        { icon: FiDatabase, label: 'Data Sharing', key: 'data_sharing', type: 'toggle' }
      ]
    },
    {
      title: 'Display',
      items: [
        { icon: FiPlay, label: 'Auto-play Animations', key: 'auto_play_animations', type: 'toggle' }
      ]
    }
  ];

  return (
    <div className="settings-page">
      {settingsSections.map((section, sIndex) => (
        <div key={sIndex} className="settings-section">
          <h3 className="settings-section-title">{section.title}</h3>
          <div className="settings-items">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="settings-item">
                  <div className="settings-item-left">
                    <Icon size={18} className="settings-item-icon" />
                    <span className="settings-item-label">{item.label}</span>
                  </div>

                  <div className="settings-item-right">
                    {item.type === 'toggle' && (
                      <button
                        className={`settings-toggle ${settings[item.key] ? 'active' : ''}`}
                        onClick={() => handleToggle(item.key)}
                      >
                        <motion.div
                          className="settings-toggle-knob"
                          animate={{ x: settings[item.key] ? 20 : 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      </button>
                    )}

                    {item.type === 'select' && (
                      <select
                        className="settings-select"
                        value={settings[item.key]}
                        onChange={(e) => handleSelect(item.key, e.target.value)}
                      >
                        {item.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Save Button */}
      <motion.button
        className={`settings-save-btn ${hasChanges ? 'has-changes' : ''}`}
        onClick={handleSave}
        disabled={loading || !hasChanges}
        whileHover={hasChanges ? { scale: 1.02 } : {}}
        whileTap={hasChanges ? { scale: 0.98 } : {}}
      >
        {loading ? 'Saving...' : <><FiSave size={16} /> Save Settings</>}
      </motion.button>

      <p className="settings-hint">Changes are saved when you press Save. Close this panel when done.</p>

      {/* Change Password Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Change Password</h3>
        <div className="settings-pw-card">
          <div className="settings-pw-field">
            <FiLock size={15} className="settings-pw-icon" />
            <input
              type={showOld ? 'text' : 'password'}
              className="settings-pw-input"
              placeholder="Current password"
              value={pwForm.old_password}
              onChange={e => setPwForm(f => ({ ...f, old_password: e.target.value }))}
            />
            <button type="button" className="settings-pw-eye" onClick={() => setShowOld(v => !v)}>
              {showOld ? <FiEyeOff size={15} /> : <FiEye size={15} />}
            </button>
          </div>
          <div className="settings-pw-field">
            <FiLock size={15} className="settings-pw-icon" />
            <input
              type={showNew ? 'text' : 'password'}
              className="settings-pw-input"
              placeholder="New password (min. 6 characters)"
              value={pwForm.new_password}
              onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}
            />
            <button type="button" className="settings-pw-eye" onClick={() => setShowNew(v => !v)}>
              {showNew ? <FiEyeOff size={15} /> : <FiEye size={15} />}
            </button>
          </div>
          <div className="settings-pw-field">
            <FiLock size={15} className="settings-pw-icon" />
            <input
              type="password"
              className="settings-pw-input"
              placeholder="Confirm new password"
              value={pwForm.confirm_password}
              onChange={e => setPwForm(f => ({ ...f, confirm_password: e.target.value }))}
            />
          </div>
          <motion.button
            className="settings-pw-btn"
            onClick={handleChangePassword}
            disabled={pwLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {pwLoading ? 'Updating...' : <><FiShield size={15} /> Update Password</>}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default Settings;