import React, { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import AINegotiator from './AINegotiator';
import ProductComments from './ProductComments';
import ProductReviews from './ProductReviews';
import CompareProducts from './CompareProducts';
import BuyNowModal from '../cart/BuyNowModal';
import api from '../../services/api';
import requestProductService from '../../services/requestProductService';
import { toast } from 'react-toastify';
import { ShoppingCart, Zap, Bot, Heart, ArrowLeftRight, Bell, Star, MessageSquare, Truck, Users, UserCheck, UserPlus, Handshake, Gift, Banknote, Lock, Check, BarChart2, Package, Award, Crown, Gem } from 'lucide-react';
import './ProductDetail.css';

// productId — product to display; onClose — called to dismiss; onRequireAuth — called when login is needed
const ProductDetail = ({ productId, onClose, onRequireAuth }) => {
    const id = productId;
    const navigate = (path) => { if (path === '/login' || path === '/') { if (onClose) onClose(); } };
    const { user } = useContext(AuthContext);

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeImage, setActiveImage] = useState(0);
    const [showNegotiator, setShowNegotiator] = useState(false);
    const [showCompare, setShowCompare] = useState(false);
    const [showBuyNow, setShowBuyNow] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [isFavourite, setIsFavourite] = useState(false);
    const [activeTab, setActiveTab] = useState('reviews');
    const [negotiatedPrice, setNegotiatedPrice] = useState(null);
    const [requested, setRequested] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const [relatedProducts, setRelatedProducts] = useState([]);

    const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

    const fetchProduct = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/products/${id}`);
            if (res.data.success) {
                setProduct(res.data.product);
                setIsFavourite(res.data.product.isFavourite);
            }
        } catch (err) {
            console.error('Fetch product error:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    const fetchNegotiatedPrice = useCallback(async () => {
        if (!user) return;
        try {
            const res = await api.get(`/negotiations/price/${id}`);
            if (res.data.success && res.data.hasNegotiatedPrice) {
                setNegotiatedPrice(res.data.negotiatedPrice);
            }
        } catch (err) {
            console.error('Fetch negotiated price error:', err);
        }
    }, [id, user]);

    const fetchRelatedProducts = useCallback(async (categoryId, excludeId) => {
        try {
            const res = await api.get('/products', {
                params: { category: categoryId, limit: 6, exclude: excludeId }
            });
            if (res.data.success) {
                setRelatedProducts(res.data.products || []);
            }
        } catch (err) {
            console.error('Fetch related products error:', err);
        }
    }, []);

    useEffect(() => {
        fetchProduct();
        fetchNegotiatedPrice();
    }, [fetchProduct, fetchNegotiatedPrice]);

    useEffect(() => {
        if (product?.category_id && product?.id) {
            fetchRelatedProducts(product.category_id, product.id);
        }
    }, [product?.category_id, product?.id, fetchRelatedProducts]);

    const handleAddToCart = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        try {
            await api.post('/cart', {
                product_id: product.id,
                quantity
            });
            toast.success('Added to cart!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add to cart');
        }
    };

    const handleRequestProduct = async () => {
        if (!user) { navigate('/login'); return; }
        setRequesting(true);
        try {
            const res = await requestProductService.requestProduct(product.id);
            if (res.data.success) {
                setRequested(true);
                toast.success('📦 Request sent! You\'ll be notified when it\'s back in stock.');
            } else {
                toast.info(res.data.message || 'Could not send request');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send request');
        } finally {
            setRequesting(false);
        }
    };

    const toggleFavourite = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        try {
            const res = await api.post('/favourites', { product_id: product.id });
            if (res.data.success) {
                setIsFavourite(!isFavourite);
            }
        } catch (err) {
            console.error('Toggle favourite error:', err);
        }
    };

    const handleFollowCompany = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        try {
            const res = await api.post('/companies/follow', {
                company_id: product.company_id
            });
            if (res.data.success) {
                setProduct(prev => ({
                    ...prev,
                    isFollowingCompany: res.data.isFollowing
                }));
            }
        } catch (err) {
            console.error('Follow company error:', err);
        }
    };

    const getBadgeIcon = (badge) => {
        const badges = {
            bronze: <Award size={14} color="#cd7f32" />,
            silver: <Award size={14} color="#a8a9ad" />,
            gold: <Award size={14} color="#ffd700" />,
            crown: <Crown size={14} color="#ffd700" />,
            diamond: <Gem size={14} color="#b9f2ff" />
        };
        return badges[badge] || <Award size={14} color="#cd7f32" />;
    };

    if (loading) {
        return (
            <div className="product-detail-loading">
                <div className="spinner"></div>
                <p>Loading product...</p>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="product-detail-error">
                <h2>Product not found</h2>
                <button onClick={onClose}>Go Home</button>
            </div>
        );
    }

    const allImages = product.images?.length > 0
        ? product.images.map(img => img.image_url)
        : product.image_url ? [product.image_url] : ['/placeholder.png'];

    const displayPrice = negotiatedPrice || product.displayPrice || product.current_price;
    const hasDiscount = product.discount_percentage > 0;

    return (
        <div className="product-detail">
            {/* Company Header */}
            <div className="product-detail__company-bar">
                <div className="product-detail__company-info" onClick={() => { /* company navigation handled by parent */ }}>                    <img
                        src={product.company_logo ? `${API_BASE}${product.company_logo}` : '/assets/images/default-company.svg'}
                        alt={product.company_name}
                        className="product-detail__company-logo"
                    />
                    <div className="product-detail__company-text">
                        <h3 className="product-detail__company-name">
                            {product.company_name}
                            {product.company_rank && (
                                <span className="product-detail__company-rank" title={`Leaderboard rank #${product.company_rank}`}>#{product.company_rank}</span>
                            )}
                        </h3>
                        <div className="product-detail__company-stats">
                            <span><Star size={12} fill="currentColor" /> {product.company_rating?.toFixed(1) || '0.0'}</span>
                            <span><Users size={12} /> {product.follower_count || 0} followers</span>
                        </div>
                    </div>
                </div>
                {!product.isSeller && user && (
                    <button
                        className={`product-detail__follow-btn ${product.isFollowingCompany ? 'following' : ''}`}
                        onClick={handleFollowCompany}
                    >
                        {product.isFollowingCompany ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
                    </button>
                )}
            </div>

            {/* Main Content */}
            <div className="product-detail__main">
                {/* Image Gallery */}
                <div className="product-detail__gallery">
                    <div className="product-detail__main-image">
                        <img
                            src={allImages[activeImage]?.startsWith('/') ? `${API_BASE}${allImages[activeImage]}` : allImages[activeImage]}
                            alt={product.name}
                            onError={(e) => { e.target.src = '/placeholder.png'; }}
                        />
                        {hasDiscount && (
                            <span className="product-detail__discount-badge">-{product.discount_percentage}%</span>
                        )}
                    </div>
                    {allImages.length > 1 && (
                        <div className="product-detail__thumbnails">
                            {allImages.map((img, idx) => (
                                <img
                                    key={idx}
                                    src={img?.startsWith('/') ? `${API_BASE}${img}` : img}
                                    alt={`${product.name} ${idx + 1}`}
                                    className={`product-detail__thumbnail ${activeImage === idx ? 'active' : ''}`}
                                    onClick={() => setActiveImage(idx)}
                                    onError={(e) => { e.target.src = '/placeholder.png'; }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="product-detail__info">
                    <h1 className="product-detail__name">{product.name}</h1>

                    <div className="product-detail__rating">
                        <div className="product-detail__stars">
                            {[1, 2, 3, 4, 5].map(star => (
                                <span key={star} className={`star ${star <= Math.round(product.rating || 0) ? 'filled' : ''}`}>★</span>
                            ))}
                        </div>
                                                {!(
                                                    product.is_in_stock === false
                                                    && Number(product.rating || 0) === 0
                                                    && Number(product.total_ratings || 0) === 0
                                                ) && (
                                                    <span className="product-detail__rating-text">
                                                            {product.rating?.toFixed(1) || '0.0'} ({product.total_ratings || 0} reviews)
                                                    </span>
                                                )}
                                                {!(product.is_in_stock === false && Number(product.total_sold || 0) === 0) && (
                                                    <span className="product-detail__sold">{product.total_sold || 0} sold</span>
                                                )}
                    </div>

                    {/* Price Section */}
                    <div className="product-detail__price-section">
                        {negotiatedPrice ? (
                            <div className="product-detail__negotiated">
                                <span className="product-detail__negotiated-label"><Handshake size={14} /> Your Negotiated Price</span>
                                <span className="product-detail__negotiated-price">৳{negotiatedPrice.toFixed(2)}</span>
                                <span className="product-detail__original-price strikethrough">
                                    ৳{product.max_price?.toFixed(2) || product.current_price?.toFixed(2)}
                                </span>
                            </div>
                        ) : (
                            <div className="product-detail__prices">
                                <span className="product-detail__current-price">৳{displayPrice?.toFixed(2)}</span>
                                {hasDiscount && product.max_price && (
                                    <span className="product-detail__old-price strikethrough">৳{product.max_price.toFixed(2)}</span>
                                )}
                            </div>
                        )}
                        {product.points_reward > 0 && (
                            <span className="product-detail__points"><Gift size={13} /> Earn {product.points_reward} points</span>
                        )}
                        {product.is_cod_allowed ? (
                            <span className="product-detail__cod-badge"><Banknote size={13} /> Cash on Delivery Available</span>
                        ) : null}
                        {product.is_cod_allowed && product.cod_advance_amount != null && parseFloat(product.cod_advance_amount) > 0 ? (
                            <div className="product-detail__cod-advance">
                                <Lock size={13} /> To Confirm Order Pay: ৳{parseFloat(product.cod_advance_amount).toFixed(2)}
                            </div>
                        ) : null}
                    </div>

                    {/* Description */}
                    <div className="product-detail__description">
                        <h3>Description</h3>
                        <p>{product.description || 'No description available.'}</p>
                    </div>

                    {/* Specs */}
                    <div className="product-detail__specs">
                        {product.brand && <div className="spec-item"><span className="spec-label">Brand:</span><span className="spec-value">{product.brand}</span></div>}
                        {product.model && <div className="spec-item"><span className="spec-label">Model:</span><span className="spec-value">{product.model}</span></div>}
                        {product.color && <div className="spec-item"><span className="spec-label">Color:</span><span className="spec-value">{product.color}</span></div>}
                        {product.warranty && <div className="spec-item"><span className="spec-label">Warranty:</span><span className="spec-value">{product.warranty}</span></div>}
                        <div className="spec-item">
                            <span className="spec-label">Category:</span>
                            <span className="spec-value">{product.category_name || 'N/A'}</span>
                        </div>
                        <div className="spec-item">
                            <span className="spec-label">Stock:</span>
                            <span className={`spec-value ${product.is_in_stock ? 'in-stock' : 'out-of-stock'}`}>
                                {product.is_in_stock ? 'In Stock' : 'Out of Stock'}
                            </span>
                            {!product.is_in_stock && !product.isSeller && user && (
                                <button
                                    className={`product-detail__request-btn ${requested ? 'requested' : ''}`}
                                    onClick={handleRequestProduct}
                                    disabled={requested || requesting}
                                >
                                    {requested ? <><Check size={13} /> Requested</> : requesting ? '...' : <><Bell size={13} /> Notify Me</>}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Actions - always visible; disabled for seller */}
                    <div className="product-detail__actions">
                        <div className="product-detail__quantity" style={product.isSeller ? { pointerEvents: 'none', opacity: 0.4 } : {}}>
                            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1 || product.isSeller}>−</button>
                            <span>{quantity}</span>
                            <button onClick={() => setQuantity(quantity + 1)} disabled={quantity >= (product.stock_quantity || 99) || product.isSeller}>+</button>
                        </div>

                        <div className="product-detail__buttons">
                            <button
                                className="product-detail__add-cart"
                                onClick={product.isSeller ? undefined : handleAddToCart}
                                disabled={!product.is_in_stock || !!product.isSeller}
                                title={product.isSeller ? 'You cannot add your own product to cart' : undefined}
                                style={product.isSeller ? { cursor: 'not-allowed' } : {}}
                            >
                                <ShoppingCart size={16} /> {product.isSeller ? 'Your Product' : 'Add to Cart'}
                            </button>
                            {!product.isSeller && product.is_in_stock && user && (
                                <button
                                    className="product-detail__buy-now-btn"
                                    onClick={() => setShowBuyNow(true)}
                                >
                                    <Zap size={16} /> Buy Now
                                </button>
                            )}
                            {user && !product.isSeller && (
                                <button className="product-detail__negotiate-btn" onClick={() => setShowNegotiator(true)} title="AI Cost Negotiator">
                                    <Bot size={18} />
                                </button>
                            )}
                            <button className={`product-detail__fav-btn ${isFavourite ? 'active' : ''}`} onClick={toggleFavourite}>
                                {isFavourite ? <Heart size={18} fill="currentColor" /> : <Heart size={18} />}
                            </button>
                        </div>

                        {!product.isSeller && (
                            <button className="product-detail__compare-btn" onClick={() => setShowCompare(true)}>
                                <ArrowLeftRight size={15} /> Compare with Similar Products
                            </button>
                        )}
                    </div>

                    {/* Seller View */}
                    {product.isSeller && (
                        <div className="product-detail__seller-info">
                            <h3><BarChart2 size={16} /> Seller Information</h3>
                            <div className="seller-price-info">
                                <div className="price-row"><span>Minimum Price (Hidden):</span><span className="min-price">৳{product.min_price?.toFixed(2)}</span></div>
                                <div className="price-row"><span>Maximum Price:</span><span>৳{product.max_price?.toFixed(2)}</span></div>
                                <div className="price-row"><span>Display Price:</span><span>৳{displayPrice?.toFixed(2)}</span></div>
                                <div className="price-row"><span>Discount:</span><span>{product.discount_percentage}%</span></div>
                                {product.promo_code && <div className="price-row"><span>Promo Code:</span><span className="promo-code">{product.promo_code}</span></div>}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="product-detail__tabs">
                <div className="product-detail__tab-headers">
                    <button className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                        <Star size={14} /> Reviews ({product.total_ratings || 0})
                    </button>
                    <button className={`tab-btn ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>
                        <MessageSquare size={14} /> Comments ({product.comments?.length || 0})
                    </button>
                </div>
                <div className="product-detail__tab-content">
                    {activeTab === 'reviews' && <ProductReviews productId={product.id} reviews={product.reviews} onReviewAdded={fetchProduct} />}
                    {activeTab === 'comments' && <ProductComments productId={product.id} comments={product.comments} onCommentAdded={fetchProduct} isSeller={!!user && product.company_owner_id === user.id} companyOwnerId={product.company_owner_id} companyLogo={product.company_logo} companyName={product.company_name} />}
                </div>
            </div>

            {/* Related Products */}
            {relatedProducts.length > 0 && (
                <div className="product-detail__related">
                    <h2 className="product-detail__related-title">Related Products</h2>
                    <div className="product-detail__related-grid">
                        {relatedProducts.map(p => (
                            <div
                                key={p.id}
                                className="related-product-card"
                                onClick={() => { if (onClose) onClose(); }}
                            >
                                <div className="related-product-card__image">
                                    {p.image_url ? (
                                        <img
                                            src={p.image_url.startsWith('/') ? `${API_BASE}${p.image_url}` : p.image_url}
                                            alt={p.name}
                                            onError={(e) => { e.target.src = '/placeholder.png'; }}
                                        />
                                    ) : (
                                        <div className="related-product-card__placeholder"><Package size={32} /></div>
                                    )}
                                    {p.is_cod_allowed && p.is_in_stock && (
                                        <span className="related-product-card__cod">COD</span>
                                    )}
                                    {!p.is_in_stock && (
                                        <span className="related-product-card__oos">Out of Stock</span>
                                    )}
                                </div>
                                <div className="related-product-card__info">
                                    <p className="related-product-card__name">{p.name}</p>
                                    <span className="related-product-card__price">৳{Number(p.current_price).toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modals */}
            {showBuyNow && (
                <BuyNowModal
                    product={{ ...product, current_price: displayPrice }}
                    onClose={() => setShowBuyNow(false)}
                    onSuccess={() => setShowBuyNow(false)}
                />
            )}
            {showNegotiator && (
                <AINegotiator
                    productId={product.id}
                    productName={product.name}
                    currentPrice={product.current_price}
                    onClose={() => setShowNegotiator(false)}
                    onPriceAccepted={(price) => { setNegotiatedPrice(price); setShowNegotiator(false); }}
                />
            )}
            {showCompare && <CompareProducts productId={product.id} onClose={() => setShowCompare(false)} />}
        </div>
    );
};

export default ProductDetail;