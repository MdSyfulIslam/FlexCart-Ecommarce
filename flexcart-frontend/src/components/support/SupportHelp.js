import React, { useState, useEffect } from 'react';
import { FiHelpCircle, FiPhone, FiMail, FiMapPin, FiClock, FiExternalLink } from 'react-icons/fi';
import supportService from '../../services/supportService';
import LoadingSpinner from '../common/LoadingSpinner';
import './SupportHelp.css';

const SupportHelp = () => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supportService.getSupportInfo()
      .then(res => { if (res.data.success) setInfo(res.data.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="support-help">
      <div className="section-header">
        <h2><FiHelpCircle /> Support / Help</h2>
        <p>We're here to help!</p>
      </div>

      <div className="support-grid">
        {info?.phone?.map(item => (
          <div key={item.id} className="support-card">
            <FiPhone className="support-card-icon" size={24} />
            <h4>{item.label}</h4>
            <p>{item.value}</p>
          </div>
        ))}
        {info?.email?.map(item => (
          <div key={item.id} className="support-card">
            <FiMail className="support-card-icon" size={24} />
            <h4>{item.label}</h4>
            <p>{item.value}</p>
          </div>
        ))}
        {info?.address?.map(item => (
          <div key={item.id} className="support-card">
            <FiMapPin className="support-card-icon" size={24} />
            <h4>{item.label}</h4>
            <p>{item.value}</p>
          </div>
        ))}
        {info?.hours?.map(item => (
          <div key={item.id} className="support-card">
            <FiClock className="support-card-icon" size={24} />
            <h4>{item.label}</h4>
            <p>{item.value}</p>
          </div>
        ))}
      </div>

      {info?.faq?.length > 0 && (
        <div className="support-faq">
          <h3>Frequently Asked Questions</h3>
          {info.faq.map(item => (
            <div key={item.id} className="faq-item">
              <h4>{item.label}</h4>
              <p>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {info?.social?.length > 0 && (
        <div className="support-social">
          <h3>Follow Us</h3>
          <div className="social-links">
            {info.social.map(item => (
              <a key={item.id} href={item.value} target="_blank" rel="noopener noreferrer" className="social-link">
                <FiExternalLink size={14} /> {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportHelp;