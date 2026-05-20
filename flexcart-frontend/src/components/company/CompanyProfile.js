import React, { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import CompanyReview from './CompanyReview';
import ProductDetail from '../home/ProductDetail';
import api from '../../services/api';
import companyService from '../../services/companyService';
import { FiBell, FiBellOff, FiShare2, FiMail, FiPhone, FiMapPin } from 'react-icons/fi';
import { Star, FileText, Check, UserCheck, UserPlus, PenLine, Laptop, Home, BookOpen, Car, ShoppingBag } from 'lucide-react';
import { getImageUrl } from '../../utils/helpers';
import './CompanyProfile.css';

const CompanyProfile = ({ companyId, onClose, onViewProduct }) => {
    const { user } = useContext(AuthContext);

    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState(null);
    const [categoryProducts, setCategoryProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [showReview, setShowReview] = useState(false);
    const [togglingNotif, setTogglingNotif] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const fetchCompany = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const res = await api.get(`/companies/${companyId}`);
            if (res.data.success) {
                setCompany(res.data.company || res.data.data);
            }
        } catch (err) {
            console.error('Fetch company error:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { fetchCompany(); }, [fetchCompany]);

    const fetchCategoryProducts = async (categoryId, pageNum = 1) => {
        setLoadingProducts(true);
        try {
            const res = await api.get(`/companies/${companyId}/products/${categoryId}?page=${pageNum}&limit=12`);
            if (res.data.success) {
                const payload = res.data.data || {};
                const prods = payload.products || [];
                if (pageNum === 1) setCategoryProducts(prods);
                else setCategoryProducts(prev => [...prev, ...prods]);
                const pag = payload.pagination || {};
                setHasMore(pageNum < (pag.totalPages || 1));
                setPage(pageNum);
            }
        } catch (err) {
            console.error('Fetch category products error:', err);
        } finally {
            setLoadingProducts(false);
        }
    };

    const handleCategoryClick = (category) => {
        setActiveCategory(category);
        setCategoryProducts([]);
        setPage(1);
        fetchCategoryProducts(category.id, 1);
    };

    const handleBackToCategories = () => {
        setActiveCategory(null);
        setCategoryProducts([]);
    };

    const handleLoadMore = () => {
        if (activeCategory && hasMore) fetchCategoryProducts(activeCategory.id, page + 1);
    };

    const handleFollow = async () => {
        if (!user) return;
        try {
            const res = await api.post('/companies/follow', { company_id: companyId });
            if (res.data.success) {
                const { isFollowing, notificationsEnabled } = res.data.data;
                setCompany(prev => ({
                    ...prev,
                    isFollowing,
                    notificationsEnabled: notificationsEnabled || false,
                    follower_count: isFollowing
                        ? (prev.follower_count || 0) + 1
                        : Math.max((prev.follower_count || 0) - 1, 0)
                }));
            }
        } catch (err) { console.error('Follow error:', err); }
    };

    const handleToggleNotifications = async () => {
        if (!user || !company?.isFollowing || togglingNotif) return;
        setTogglingNotif(true);
        try {
            const res = await companyService.toggleNotifications(companyId);
            if (res.data.success) {
                setCompany(prev => ({ ...prev, notificationsEnabled: res.data.notificationsEnabled }));
            }
        } catch (err) { console.error('Toggle notifications error:', err); }
        finally { setTogglingNotif(false); }
    };

    const getCategoryIcon = (icon) => {
        const icons = {
            laptop: <Laptop size={24} />, shirt: <ShoppingBag size={24} />, home: <Home size={24} />, book: <BookOpen size={24} />,
            dumbbell: <ShoppingBag size={24} />, sparkles: <ShoppingBag size={24} />, gamepad: <ShoppingBag size={24} />,
            car: <Car size={24} />, heart: <ShoppingBag size={24} />, couch: <Home size={24} />
        };
        return icons[icon] || <ShoppingBag size={24} />;
    };

    if (loading) return <div className="company-profile-loading"><div className="spinner"></div><p>Loading company...</p></div>;
    if (!company) return <div className="company-profile-error"><h2>Company not found</h2><button onClick={onClose}>Close</button></div>;

    return (
        <div className="company-profile">
            <div className="company-profile__header">
                <div className="company-profile__banner" style={company.cover_image ? { backgroundImage: `url(${getImageUrl(company.cover_image)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}><div className="company-profile__banner-overlay"></div></div>
                <div className="company-profile__header-content">
                    <div className="company-profile__logo-section">
                        <img
                            src={company.company_logo ? getImageUrl(company.company_logo) : '/assets/images/default-company.svg'}
                            alt={company.company_name}
                            className="company-profile__logo"
                            onError={(e) => { e.target.src = '/assets/images/default-company.svg'; }}
                        />
                        <div className="company-profile__info">
                            <h1>
                                {company.company_name}
                                {company.company_rank && (
                                    <span className="company-rank-circle" title={`Leaderboard rank #${company.company_rank}`}>#{company.company_rank}</span>
                                )}
                            </h1>
                            <p className="company-profile__category">{company.category || 'General'}</p>
                            <div className="company-profile__stats">
                                <div className="stat"><span className="stat-value"><Star size={13} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle' }} /> {parseFloat(company.rating || 0).toFixed(1)}</span><span className="stat-label">Rating</span></div>
                                <div className="stat"><span className="stat-value"> {Number(company.follower_count || 0)}</span><span className="stat-label">Followers</span></div>
                                <div className="stat"><span className="stat-value"> {Number(company.totalProducts || 0)}</span><span className="stat-label">Products</span></div>
                                <div className="stat"><span className="stat-value"> {Number(company.total_sales || 0)}</span><span className="stat-label">Sales</span></div>
                                <div className="stat cp-stat--reviews" onClick={() => document.getElementById('company-reviews-section')?.scrollIntoView({ behavior: 'smooth' })} style={{ cursor: 'pointer' }}>
                                    <span className="stat-value"><FileText size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> {Number(company.reviewCount ?? company.total_ratings ?? 0)}</span>
                                    <span className="stat-label">Reviews</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="company-profile__actions">
                        {user && (
                            <>
                                <button className={`company-profile__follow-btn ${company.isFollowing ? 'following' : ''}`} onClick={handleFollow}>
                                {company.isFollowing ? <><UserCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Following</> : <><UserPlus size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Follow</>}
                                </button>
                                {company.isFollowing && (
                                    <button
                                        className={`company-profile__notif-btn ${company.notificationsEnabled ? 'notif-on' : 'notif-off'}`}
                                        onClick={handleToggleNotifications}
                                        disabled={togglingNotif}
                                        title={company.notificationsEnabled ? 'Notifications on – click to mute' : 'Notifications off – click to enable'}
                                    >
                                        {company.notificationsEnabled ? <FiBell size={16} /> : <FiBellOff size={16} />}
                                    </button>
                                )}
                                <button className="company-profile__share-btn" onClick={() => {
                                    const url = `${window.location.origin}?openCompany=${companyId}`;
                                    navigator.clipboard.writeText(url).then(() => {
                                        setShareCopied(true);
                                        setTimeout(() => setShareCopied(false), 2500);
                                    });
                                }} title="Share company link">
                                    <FiShare2 size={15} />
                                    {shareCopied ? <><Check size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Copied!</> : 'Share'}
                                </button>

                            </>
                        )}
                    </div>
                </div>
            </div>

            {(company.description || company.contact_email || company.contact_phone || company.address || company.city || company.country) && (
                <div className="company-profile__info-card">
                    {company.description && (
                        <p className="company-profile__desc-text">
                            {company.description.length > 50
                                ? company.description.slice(0, 50) + '…'
                                : company.description}
                        </p>
                    )}
                    <div className="company-profile__contact-grid">
                        {company.contact_email && (
                            <div className="company-profile__contact-item">
                                <FiMail size={16} className="contact-icon" />
                                <div className="contact-text">
                                    <span className="contact-label">Email</span>
                                    <span className="contact-value">{company.contact_email}</span>
                                </div>
                            </div>
                        )}
                        {company.contact_phone && (
                            <div className="company-profile__contact-item">
                                <FiPhone size={16} className="contact-icon" />
                                <div className="contact-text">
                                    <span className="contact-label">Phone</span>
                                    <span className="contact-value">{company.contact_phone}</span>
                                </div>
                            </div>
                        )}
                        {(company.address || company.city || company.country) && (
                            <div className="company-profile__contact-item">
                                <FiMapPin size={16} className="contact-icon" />
                                <div className="contact-text">
                                    <span className="contact-label">Address</span>
                                    <span className="contact-value">
                                        {[company.address, company.city, company.country].filter(Boolean).join(', ')}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {company.promo_banner && (
                <div className="company-profile__promo-banner">
                    <img
                        src={getImageUrl(company.promo_banner)}
                        alt="Promotional banner"
                        className="company-profile__promo-banner-img"
                    />
                </div>
            )}

            <div className="company-profile__products-section">
                {!activeCategory ? (
                    <>
                        <h2 className="section-title"> Product Categories</h2>
                        {!company.categories || company.categories.length === 0 ? (
                            <p className="no-categories">No products available yet.</p>
                        ) : (
                            <div className="company-profile__categories-grid">
                                {company.categories.map(cat => (
                                    <div key={cat.id} className="category-folder" onClick={() => handleCategoryClick(cat)}>
                                        <div className="category-folder__icon">{getCategoryIcon(cat.icon)}</div>
                                        <div className="category-folder__info">
                                            <h3>{cat.name}</h3>
                                            <span>{cat.product_count} product{cat.product_count !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="company-profile__category-header">
                            <button className="back-btn" onClick={handleBackToCategories}> Back to Categories</button>
                            <div className="category-header-title">
                                <h2>{getCategoryIcon(activeCategory.icon)} {activeCategory.name}</h2>
                                <span className="category-product-count">
                                    {activeCategory.product_count} product{activeCategory.product_count !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                        {loadingProducts && categoryProducts.length === 0 ? (
                            <div className="products-loading"><div className="spinner"></div></div>
                        ) : categoryProducts.length === 0 ? (
                            <p className="no-products">No products in this category.</p>
                        ) : (
                            <>
                                <div className="company-profile__products-grid">
                                    {categoryProducts.map(product => (
                                        <div key={product.id} className="company-product-card" onClick={() => { if (onViewProduct) onViewProduct(product); else setSelectedProduct(product); }}>
                                            <div className="company-product-card__image">
                                                <img
                                                    src={(product.image_url || product.primary_image) ? getImageUrl(product.image_url || product.primary_image) : '/placeholder.png'}
                                                    alt={product.name}
                                                    onError={(e) => { e.target.src = '/placeholder.png'; }}
                                                />
                                                {product.discount_percentage > 0 && <span className="product-discount">-{product.discount_percentage}%</span>}
                                            </div>
                                            <div className="company-product-card__info">
                                                <h4>{product.name}</h4>
                                                <div className="company-product-card__price">
                                                    <span className="current">৳{parseFloat(product.current_price || 0).toFixed(2)}</span>
                                                    {product.discount_percentage > 0 && <span className="old">৳{parseFloat(product.old_price || 0).toFixed(2)}</span>}
                                                </div>
                                                <div className="company-product-card__meta">
                                                    <span> {parseFloat(product.rating || 0).toFixed(1)}</span>
                                                    <span>{product.total_sold || 0} sold</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {hasMore && (
                                    <div className="load-more-section">
                                        <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingProducts}>
                                            {loadingProducts ? 'Loading...' : 'Load More Products'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {!activeCategory && (
                <div className="company-profile__reviews" id="company-reviews-section">
                    <div className="company-profile__reviews-header">
                        <h2 className="section-title"><Star size={15} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Company Reviews</h2>
                        {user && (
                            <button className="company-profile__write-review-btn" onClick={() => setShowReview(true)}>
                                <PenLine size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Write a Company Review
                            </button>
                        )}
                    </div>
                    <p className="company-profile__company-review-note">
                        These reviews are for the <strong>company</strong> only (product reviews appear on each product page).
                    </p>
                    {!company.reviews || company.reviews.length === 0 ? (
                        <p className="no-reviews-msg">No reviews yet. Be the first to review this company!</p>
                    ) : (
                        company.reviews.map(review => (
                        <div key={review.id} className="company-review-item">
                            <div className="company-review-item__header">
                                <img src={review.profile_image ? getImageUrl(review.profile_image) : '/default-avatar.png'} alt={review.username} className="review-avatar" />
                                <div>
                                    <span className="reviewer-name">{review.username}</span>
                                    <div className="reviewer-stars">
                                        {[1,2,3,4,5].map(star => <span key={star} className={`star-sm ${star <= review.rating ? 'gold' : 'silver'}`}>&#9733;</span>)}
                                    </div>
                                </div>
                                <span className="review-date">{new Date(review.created_at).toLocaleDateString()}</span>
                            </div>
                            {review.review_text && <p className="company-review-text">{review.review_text}</p>}
                        </div>
                    ))
                    )}
                </div>
            )}

            {showReview && (
                <CompanyReview
                    companyId={company.id}
                    companyName={company.company_name}
                    onClose={() => setShowReview(false)}
                    onReviewSubmitted={fetchCompany}
                />
            )}

            {selectedProduct && (
                <ProductDetail
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                />
            )}
        </div>
    );
};

export default CompanyProfile;
