import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { FiMapPin, FiPhone, FiMail, FiGlobe, FiStar, FiPackage } from 'react-icons/fi';
import { Package } from 'lucide-react';
import companyService from '../../services/companyService';
import LoadingSpinner from '../common/LoadingSpinner';
import { getImageUrl, formatPrice, formatDate } from '../../utils/helpers';

const CompanyDetail = ({ companyId, onClose }) => {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const response = await companyService.getCompanyById(companyId);
        if (response.data.success) setCompany(response.data.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    loadCompany();
  }, [companyId]);

  if (loading) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Loading...">
        <LoadingSpinner />
      </Modal>
    );
  }

  if (!company) return null;

  return (
    <Modal isOpen={true} onClose={onClose} title={company.company_name} size="large">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '16px',
            background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
            fontSize: '2rem', fontWeight: 800, color: 'var(--primary)'
          }}>
            {company.company_logo ? (
              <img src={getImageUrl(company.company_logo)} alt={company.company_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span>{company.company_name?.[0]}</span>
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>{company.company_name}</h2>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FiStar size={14} /> {company.rating?.toFixed(1)} rating
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FiPackage size={14} /> {company.total_sales} sales
              </span>
              <span>{company.follower_count} followers</span>
            </div>
            {company.description && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {company.description}
              </p>
            )}
          </div>
        </div>

        {/* Contact */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '16px',
          background: 'var(--bg-tertiary)', borderRadius: '10px'
        }}>
          {company.contact_email && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <FiMail size={14} /> {company.contact_email}
            </span>
          )}
          {company.contact_phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <FiPhone size={14} /> {company.contact_phone}
            </span>
          )}
          {company.address && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <FiMapPin size={14} /> {company.address}
            </span>
          )}
          {company.website && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <FiGlobe size={14} /> {company.website}
            </span>
          )}
        </div>

        {/* Products */}
        {company.products && company.products.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>
              Products ({company.products.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {company.products.slice(0, 8).map(p => (
                <div key={p.id} style={{
                  background: 'var(--bg-tertiary)', borderRadius: '10px',
                  overflow: 'hidden', textAlign: 'center'
                }}>
                  <div style={{
                    aspectRatio: '1/1', background: 'var(--bg-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                  }}>
                    {p.image_url ? (
                      <img src={getImageUrl(p.image_url)} alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : <Package size={32} />}
                  </div>
                  <p style={{ fontSize: '0.75rem', padding: '6px', fontWeight: 500 }}>{p.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700, paddingBottom: '6px' }}>
                    {formatPrice(p.current_price)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales History */}
        {company.salesHistory && company.salesHistory.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Sales History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {company.salesHistory.slice(0, 10).map(sale => (
                <div key={sale.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: 'var(--bg-tertiary)',
                  borderRadius: '6px', fontSize: '0.8125rem'
                }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{sale.product_name}</span>
                  <span style={{ color: 'var(--text-tertiary)', margin: '0 12px' }}>x{sale.quantity}</span>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatPrice(sale.total_price)}</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', marginLeft: '12px' }}>
                    {formatDate(sale.order_date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CompanyDetail;