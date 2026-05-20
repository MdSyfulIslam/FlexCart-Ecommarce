import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUsers, FiUserMinus, FiBell, FiBellOff } from 'react-icons/fi';
import companyService from '../../services/companyService';
import CompanyProfile from './CompanyProfile';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';
import { getImageUrl, formatDate } from '../../utils/helpers';
import './FollowingCompanies.css';

const FollowingCompanies = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(null); // { id, name }

  useEffect(() => { loadCompanies(); }, []);

  const loadCompanies = async () => {
    try {
      const response = await companyService.getFollowingCompanies();
      if (response.data.success) setCompanies(response.data.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const handleUnfollowClick = (e, company) => {
    e.stopPropagation();
    setConfirmUnfollow({ id: company.id, name: company.company_name });
  };

  const handleConfirmUnfollow = async () => {
    if (!confirmUnfollow || actionId) return;
    const { id } = confirmUnfollow;
    setActionId(id);
    setConfirmUnfollow(null);
    try {
      const res = await companyService.toggleFollow(id);
      if (res.data.success && !res.data.data.isFollowing) {
        setCompanies(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) { console.error(err); }
    finally { setActionId(null); }
  };

  const handleToggleNotifications = async (e, companyId) => {
    e.stopPropagation();
    if (actionId) return;
    setActionId(`notif-${companyId}`);
    try {
      const res = await companyService.toggleNotifications(companyId);
      if (res.data.success) {
        setCompanies(prev =>
          prev.map(c => c.id === companyId ? { ...c, notifications_enabled: res.data.notificationsEnabled ? 1 : 0 } : c)
        );
      }
    } catch (err) { console.error(err); }
    finally { setActionId(null); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="following-companies">
      <div className="section-header">
        <h2><FiUsers /> Following Companies</h2>
        <p>{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</p>
      </div>

      {companies.length === 0 ? (
        <div className="empty-state">
          <span>🏢</span>
          <h3>Not following any companies</h3>
          <p>Follow companies to stay updated</p>
        </div>
      ) : (
        <div className="companies-grid">
          {companies.map((company, index) => (
            <motion.div
              key={company.id}
              className="company-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedCompany(company)}
            >
              <div className="company-card-avatar">
                {company.company_logo ? (
                  <img src={getImageUrl(company.company_logo)} alt={company.company_name} />
                ) : (
                  <span>{company.company_name?.[0]}</span>
                )}
              </div>
              <div className="company-card-info">
                <h4>{company.company_name}</h4>
                <p className="company-category">{company.category || 'General'}</p>
                <p className="company-followed">Followed {formatDate(company.followed_at)}</p>
              </div>
              <div className="company-card-actions" onClick={e => e.stopPropagation()}>
                <button
                  className={`company-notif-btn ${company.notifications_enabled ? 'notif-on' : 'notif-off'}`}
                  onClick={(e) => handleToggleNotifications(e, company.id)}
                  disabled={actionId === `notif-${company.id}`}
                  title={company.notifications_enabled ? 'Mute notifications' : 'Enable notifications'}
                >
                  {company.notifications_enabled ? <FiBell size={15} /> : <FiBellOff size={15} />}
                </button>
                <button
                  className="company-unfollow-btn"
                  onClick={(e) => handleUnfollowClick(e, company)}
                  disabled={actionId === company.id}
                  title="Unfollow"
                >
                  <FiUserMinus size={15} />
                  <span>Unfollow</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Company Profile Modal */}
      {selectedCompany && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedCompany(null)}
          title={selectedCompany.company_name}
          size="large"
          closePosition="left"
        >
          <CompanyProfile
            companyId={selectedCompany.id}
            onClose={() => setSelectedCompany(null)}
          />
        </Modal>
      )}

      {/* Unfollow Confirmation Dialog */}
      <AnimatePresence>
        {confirmUnfollow && (
          <motion.div
            className="unfollow-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmUnfollow(null)}
          >
            <motion.div
              className="unfollow-dialog"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="unfollow-dialog__icon">🏢</div>
              <h3>Unfollow Company?</h3>
              <p>Are you sure you want to unfollow <strong>"{confirmUnfollow.name}"</strong>?</p>
              <div className="unfollow-dialog__actions">
                <button className="unfollow-dialog__no" onClick={() => setConfirmUnfollow(null)}>No, Keep Following</button>
                <button className="unfollow-dialog__yes" onClick={handleConfirmUnfollow}>Yes, Unfollow</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FollowingCompanies;