import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPackage, FiBell, FiTrash2, FiX } from 'react-icons/fi';
import { ClipboardList, Package, Clock, Check } from 'lucide-react';
import requestProductService from '../../services/requestProductService';
import LoadingSpinner from '../common/LoadingSpinner';
import ProductDetail from '../home/ProductDetail';
import { formatPrice, getImageUrl, formatDate } from '../../utils/helpers';
import { toast } from 'react-toastify';
import './RequestProduct.css';

const RequestProduct = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    try {
      const response = await requestProductService.getRequestedProducts();
      if (response.data.success) setRequests(response.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id) => {
    setRemovingId(id);
    try {
      await requestProductService.removeRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      toast.success('Request removed');
    } catch (error) {
      toast.error('Failed to remove request');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <div className="request-product">
      <div className="section-header">
        <h2><FiPackage /> Requested Products</h2>
        <p>You'll be notified when these products are back in stock</p>
      </div>

      {requests.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} />
          <h3>No product requests</h3>
          <p>When a product is out of stock, press <strong><FiBell size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Notify Me</strong> on the product page to be notified when it's available.</p>
        </div>
      ) : (
        <div className="request-list">
          <AnimatePresence>
            {requests.map((req, index) => (
              <motion.div
                key={req.id}
                className="request-card"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0 }}
                transition={{ delay: index * 0.04 }}
                layout
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedProduct({ ...req, id: req.product_id })}
              >
                <div className="request-img">
                  {req.image_url ? (
                    <img src={getImageUrl(req.image_url)} alt={req.name} />
                  ) : <Package size={32} />}
                </div>
                <div className="request-info">
                  <h4>{req.name}</h4>
                  <p className="request-company">{req.company_name}</p>
                  <p className="request-price">{formatPrice(req.current_price)}</p>
                  <p className="request-date">Requested {formatDate(req.created_at)}</p>
                </div>
                <div className="request-status">
                  {req.is_in_stock ? (
                    <span className="status-available">
                      <FiBell size={13} /> Now Available!
                    </span>
                  ) : (
                    <span className="status-waiting"><Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Waiting</span>
                  )}
                  {req.is_notified ? <span className="status-notified"><Check size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Notified</span> : null}
                </div>
                <button
                  className="request-remove-btn"
                  onClick={(e) => { e.stopPropagation(); handleRemove(req.id); }}
                  disabled={removingId === req.id}
                  title="Remove request"
                >
                  {removingId === req.id ? <FiX size={15} /> : <FiTrash2 size={15} />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>

      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
};

export default RequestProduct;