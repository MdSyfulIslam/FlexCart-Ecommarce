import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { RefreshCw, Star, Award, Crown, Gem, X } from 'lucide-react';
import './CompareProducts.css';

// onProductSelect(id) — called when user clicks a similar product; parent handles navigation
const CompareProducts = ({ productId, onClose, onProductSelect }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

    useEffect(() => {
        fetchSimilarProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productId]);

    const fetchSimilarProducts = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/products/${productId}/compare`);
            if (res.data.success) {
                setProducts(res.data.products);
            }
        } catch (err) {
            console.error('Fetch similar products error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleProductClick = (id) => {
        onClose();
        if (onProductSelect) onProductSelect(id);
    };

    const getBadgeIcon = (badge) => {
        const badges = {
          bronze: <Award size={14} style={{ color: '#cd7c2e' }} />,
          silver: <Award size={14} style={{ color: '#94a3b8' }} />,
          gold: <Award size={14} style={{ color: '#f59e0b' }} />,
          crown: <Crown size={14} style={{ color: '#f59e0b' }} />,
          diamond: <Gem size={14} style={{ color: '#38bdf8' }} />
        };
        return badges[badge] || null;
    };

    return (
        <div className="compare-overlay" onClick={onClose}>
            <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
                <div className="compare-modal__header">
                    <h3><RefreshCw size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Similar Products</h3>
                    <button className="compare-modal__close" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="compare-modal__content">
                    {loading ? (
                        <div className="compare-loading">
                            <div className="spinner"></div>
                            <p>Finding similar products...</p>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="compare-empty"><p>No similar products found</p></div>
                    ) : (
                        <div className="compare-modal__grid">
                            {products.map(product => (
                                <div key={product.id} className="compare-product-card" onClick={() => handleProductClick(product.id)}>
                                    <div className="compare-product-card__image">
                                        <img
                                            src={product.image_url ? `${API_BASE}${product.image_url}` : '/placeholder.png'}
                                            alt={product.name}
                                            onError={(e) => { e.target.src = '/placeholder.png'; }}
                                        />
                                        {product.discount_percentage > 0 && (
                                            <span className="compare-discount">-{product.discount_percentage}%</span>
                                        )}
                                    </div>
                                    <div className="compare-product-card__info">
                                        <h4>{product.name}</h4>
                                        <div className="compare-product-card__company">
                                            <span>{product.company_badge && getBadgeIcon(product.company_badge)}</span>
                                            <span>{product.company_name}</span>
                                        </div>
                                        <div className="compare-product-card__price">
                                            <span className="current">৳{product.current_price?.toFixed(2)}</span>
                                            {product.discount_percentage > 0 && product.old_price && (
                                                <span className="old">৳{product.old_price?.toFixed(2)}</span>
                                            )}
                                        </div>
                                        <div className="compare-product-card__rating">
                                            <span className="stars"><Star size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{product.rating?.toFixed(1) || '0.0'}</span>
                                            <span className="sold">{product.total_sold || 0} sold</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompareProducts;