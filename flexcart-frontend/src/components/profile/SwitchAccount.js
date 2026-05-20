import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiCheck, FiTrash2 } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import authService from '../../services/authService';
import { getImageUrl } from '../../utils/helpers';
import { toast } from 'react-toastify';
import './SwitchAccount.css';

const SwitchAccount = ({ onClose }) => {
  const { user, switchAccount } = useContext(AuthContext);
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLinkedAccounts();
  }, []);

  const loadLinkedAccounts = async () => {
    try {
      const response = await authService.getLinkedAccounts();
      if (response.data.success) {
        setLinkedAccounts(response.data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSwitch = async (accountId) => {
    setLoading(true);
    const result = await switchAccount(accountId);
    if (result.success) {
      toast.success('Switched account successfully!');
      window.location.reload();
    } else {
      toast.error(result.message || 'Switch failed');
    }
    setLoading(false);
  };

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await authService.linkAccount({ email: linkEmail, password: linkPassword });
      if (response.data.success) {
        toast.success('Account linked!');
        setShowLinkForm(false);
        setLinkEmail('');
        setLinkPassword('');
        loadLinkedAccounts();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to link account');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (account) => {
    if (loading) return;

    const ok = window.confirm(
      `Remove ${account?.email || 'this account'} from linked accounts?\n\nYou can link it again later.`
    );
    if (!ok) return;

    setLoading(true);
    try {
      const response = await authService.unlinkAccount(account.id);
      if (response.data.success) {
        toast.success('Account removed from linked list');
        await loadLinkedAccounts();
      } else {
        toast.error(response.data.message || 'Failed to remove account');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="switch-account">
      {/* Current Account */}
      <div className="sa-current">
        <div className="sa-account-item current">
          <div className="sa-avatar">
            {user?.profile_image ? (
              <img src={getImageUrl(user.profile_image)} alt="" />
            ) : (
              <span>{user?.username?.[0]?.toUpperCase()}</span>
            )}
          </div>
          <div className="sa-info">
            <p className="sa-name">{user?.username}</p>
            <p className="sa-email">{user?.email}</p>
          </div>
          <FiCheck size={16} className="sa-check" />
        </div>
      </div>

      {/* Linked Accounts */}
      {linkedAccounts.length > 0 && (
        <div className="sa-linked">
          <h4>Linked Accounts</h4>
          {linkedAccounts.map(account => (
            <div key={account.id} className="sa-account-row">
              <button
                className="sa-account-item"
                onClick={() => handleSwitch(account.id)}
                disabled={loading}
                title="Switch to this account"
              >
                <div className="sa-avatar">
                  {account.profile_image ? (
                    <img src={getImageUrl(account.profile_image)} alt="" />
                  ) : (
                    <span>{account.username?.[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="sa-info">
                  <p className="sa-name">{account.username}</p>
                  <p className="sa-email">{account.email}</p>
                </div>
              </button>

              <button
                type="button"
                className="sa-unlink-btn"
                onClick={() => handleUnlink(account)}
                disabled={loading}
                title="Remove from linked accounts"
              >
                <FiTrash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {linkedAccounts.length === 0 && !showLinkForm && (
        <p className="sa-empty">No linked accounts yet</p>
      )}

      {/* Link New Account */}
      {!showLinkForm ? (
        <button className="sa-link-btn" onClick={() => setShowLinkForm(true)}>
          <FiPlus size={16} />
          Link Another Account
        </button>
      ) : (
        <form className="sa-link-form" onSubmit={handleLinkAccount}>
          <h4>Link an Account</h4>
          <input
            type="email"
            placeholder="Email of account to link"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            required
            className="form-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={linkPassword}
            onChange={(e) => setLinkPassword(e.target.value)}
            required
            className="form-input"
          />
          <div className="sa-link-actions">
            <button type="button" className="sa-cancel-btn" onClick={() => setShowLinkForm(false)}>
              Cancel
            </button>
            <motion.button
              type="submit"
              className="sa-submit-btn"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? 'Linking...' : 'Link Account'}
            </motion.button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SwitchAccount;