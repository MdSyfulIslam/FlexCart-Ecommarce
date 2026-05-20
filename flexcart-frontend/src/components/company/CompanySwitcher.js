import React from 'react';
import { motion } from 'framer-motion';
import { Star, Users, ShoppingCart, Check, Building2 } from 'lucide-react';
import './CompanySwitcher.css';

const CompanySwitcher = ({ companies, activeCompany, onSelect }) => {
  const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace('/api', '');

  return (
    <div className="company-switcher">
      <div className="cs-header">
        <h2><Building2 size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Select Company Dashboard</h2>
        <p>Choose a company to manage</p>
      </div>

      <div className="cs-grid">
        {companies.map((company, idx) => (
          <motion.div
            key={company.id}
            className={`cs-card ${activeCompany?.id === company.id ? 'active' : ''}`}
            onClick={() => onSelect(company)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="cs-card__logo">
              <img
                src={company.company_logo ? `${API_BASE}${company.company_logo}` : '/assets/images/default-company.svg'}
                alt={company.company_name}
                onError={(e) => { e.target.src = '/assets/images/default-company.svg'; }}
              />
            </div>
            <div className="cs-card__info">
              <h3>{company.company_name}</h3>
              <span className="cs-category">{company.category || 'General'}</span>
              <div className="cs-card__stats">
                <span><Star size={12} fill="currentColor" /> {parseFloat(company.rating || 0).toFixed(1)}</span>
                <span><Users size={12} /> {company.follower_count || 0}</span>
                <span><ShoppingCart size={12} /> {company.total_sales || 0}</span>
              </div>
            </div>
            {activeCompany?.id === company.id && (
              <div className="cs-active-badge"><Check size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Active</div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default CompanySwitcher;