import React, { useState, useEffect, useContext } from 'react';
import Modal from '../common/Modal';
import {
  FiShoppingCart, FiStar, FiPackage, FiZap, FiMinus, FiPlus,
  FiChevronLeft, FiChevronRight, FiAlertCircle, FiMessageCircle, FiBell, FiCamera
} from 'react-icons/fi';
import { Bot, FileText, RefreshCw, FolderOpen, Banknote, Package, Star, Zap } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { CartContext } from '../../context/CartContext';
import productService from '../../services/productService';
import requestProductService from '../../services/requestProductService';
import { formatPrice, getImageUrl, generateStars } from '../../utils/helpers';
import { addViewedProduct, addRequestedProduct } from '../../utils/searchHistory';
import { motion, AnimatePresence } from 'framer-motion';
import AINegotiator from '../product/AINegotiator';
import ProductComments from '../product/ProductComment';
import ProductReviews from '../product/ProductReviews';
import CompanyProfile from '../company/CompanyProfile';
import api from '../../services/api';
import './ProductDetail.css';

const safeFixed = (value, decimals = 1) => {
  const num = parseFloat(value);
  return isNaN(num) ? (decimals === 2 ? '0.00' : '0.0') : num.toFixed(decimals);
};

const ProductDetail = ({ product, onClose, onAddToCart }) => {
  // eslint-disable-next-line no-unused-vars
 const { isAuthenticated, user } = useContext(AuthContext);
  const { addToCart } = useContext(CartContext);
  const [currentProductId, setCurrentProductId] = useState(product.id);
  const [detailedProduct, setDetailedProduct] = useState(product);
  const [addCartLoading, setAddCartLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [allImages, setAllImages] = useState([]);
  const [activeTab, setActiveTab] = useState('description');
  const [similarProducts, setSimilarProducts] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showNegotiator, setShowNegotiator] = useState(false);
  const [negotiatedPrice, setNegotiatedPrice] = useState(null);
  const [comments, setComments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showCompanyProfile, setShowCompanyProfile] = useState(false);
  const [requestRequested, setRequestRequested] = useState(false);
  const [requestingProduct, setRequestingProduct] = useState(false);
  const [compareHistory, setCompareHistory] = useState([]);
  const [showArScanner, setShowArScanner] = useState(false);

  // If parent re-opens modal for another product, reset state
  useEffect(() => {
    setCurrentProductId(product.id);
    setDetailedProduct(product);
    setQuantity(1);
    setActiveImageIndex(0);
    setAllImages([]);
    setActiveTab('description');
    setSimilarProducts([]);
    setNegotiatedPrice(null);
    setShowCompanyProfile(false);
    setRequestRequested(false);
    setShowArScanner(false);
  }, [product]);

  useEffect(() => {
    const loadProductDetail = async () => {
      try {
        const response = await productService.getProductById(currentProductId);
        if (response.data.success) {
          const data = response.data.data;
          setDetailedProduct(data);

          // Build image array
          const imgs = [];
          if (data.images && data.images.length > 0) {
            data.images.forEach(img => {
              imgs.push(img.image_url);
            });
          } else if (data.image_url) {
            imgs.push(data.image_url);
          }
          setAllImages(imgs.length > 0 ? imgs : []);

          // Use comments & reviews already returned by the product endpoint
          // — avoids 2 extra round trips
          if (data.comments) setComments(data.comments);
          if (data.reviews)  setReviews(data.reviews);
        }
      } catch (error) {
        console.error('Load product detail error:', error);
      }
    };

    loadProductDetail();

    // Track viewed product for recommendations
    addViewedProduct(currentProductId);
  }, [currentProductId]);

  // Load similar products when tab changes
  useEffect(() => {
    if (activeTab === 'compare' && similarProducts.length === 0) {
      loadSimilarProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadSimilarProducts = async () => {
    setLoadingSimilar(true);
    try {
      const response = await productService.compareSimilarProducts(currentProductId);
      if (response.data.success) {
        setSimilarProducts(response.data.data);
      }
    } catch (error) {
      console.error('Load similar products error:', error);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const handleOpenSimilarProduct = (id) => {
    if (!id || id === currentProductId) return;

    // Save current compare context so user can go back
    setCompareHistory(prev => ([
      ...prev,
      {
        productId: currentProductId,
        tab: 'compare',
        similar: similarProducts
      }
    ]));

    setCurrentProductId(id);
    setActiveTab('description');
    setSimilarProducts([]);
  };

  const handleBackToCompare = () => {
    setCompareHistory(prev => {
      if (!prev || prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setCurrentProductId(last.productId);
      setSimilarProducts(Array.isArray(last.similar) ? last.similar : []);
      setActiveTab(last.tab || 'compare');
      return prev.slice(0, -1);
    });
  };

  const stars = generateStars(parseFloat(detailedProduct.rating) || 0);

  const nextImage = () => {
    if (allImages.length > 0) {
      setActiveImageIndex(prev => (prev + 1) % allImages.length);
    }
  };

  const prevImage = () => {
    if (allImages.length > 0) {
      setActiveImageIndex(prev => (prev - 1 + allImages.length) % allImages.length);
    }
  };

  const isSeller = detailedProduct.isSeller === true || detailedProduct.isSeller === 1;
  const hasAr3d = (detailedProduct.is_ar_3d === 1 || detailedProduct.is_ar_3d === true)
    && (Boolean(detailedProduct.ar_qr_image) || Boolean(detailedProduct.ar_url));

  const headerRight = compareHistory.length > 0 ? (
    <button type="button" className="modal-back" onClick={handleBackToCompare}>
      Back <FiChevronRight size={18} />
    </button>
  ) : null;

  return (
    <>
    <Modal isOpen={true} onClose={onClose} title="" size="large" closePosition="left" headerRight={headerRight}>
      <div className="pd-container">

        {/* ===== TOP SECTION: Images + Info ===== */}
        <div className="pd-top">

          {/* LEFT: Image Gallery */}
          <div className="pd-gallery">
            {/* Main Image */}
            <div className="pd-main-image">
              {allImages.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={activeImageIndex}
                      src={getImageUrl(allImages[activeImageIndex])}
                      alt={detailedProduct.name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  </AnimatePresence>

                  {/* Navigation Arrows */}
                  {allImages.length > 1 && (
                    <>
                      <button className="pd-img-nav pd-img-prev" onClick={prevImage}>
                        <FiChevronLeft size={20} />
                      </button>
                      <button className="pd-img-nav pd-img-next" onClick={nextImage}>
                        <FiChevronRight size={20} />
                      </button>
                      <div className="pd-img-counter">
                        {activeImageIndex + 1} / {allImages.length}
                      </div>
                    </>
                  )}
                </>
              ) : detailedProduct.image_url ? (
                <img src={getImageUrl(detailedProduct.image_url)} alt={detailedProduct.name} />
              ) : (
                <Package size={48} className="pd-placeholder" />
              )}

              {parseFloat(detailedProduct.discount_percentage) > 0 && (
                <span className="pd-discount-badge">
                  -{Math.round(parseFloat(detailedProduct.discount_percentage))}%
                </span>
              )}
            </div>

            {/* AR 3D Scanner */}
            {hasAr3d && (
              <div className="pd-ar-wrap">
                <button
                  type="button"
                  className="pd-ar-btn"
                  onClick={() => setShowArScanner(v => !v)}
                  title="View AR QR and link"
                >
                  <FiCamera size={16} />
                  <span>Scan AR</span>
                </button>

                {showArScanner && (
                  <div className="pd-ar-panel">
                    {detailedProduct.ar_qr_image && (
                      <img
                        className="pd-ar-qr"
                        src={getImageUrl(detailedProduct.ar_qr_image)}
                        alt="AR QR code"
                      />
                    )}
                    {detailedProduct.ar_url && (
                      <a
                        className="pd-ar-link"
                        href={detailedProduct.ar_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {detailedProduct.ar_url}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="pd-thumbnails">
                {allImages.map((img, idx) => (
                  <div
                    key={idx}
                    className={`pd-thumb ${idx === activeImageIndex ? 'active' : ''}`}
                    onClick={() => setActiveImageIndex(idx)}
                  >
                    <img
                      src={getImageUrl(img)}
                      alt={`View ${idx + 1}`}
                      onError={(e) => { e.target.src = '/placeholder.png'; }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Product Info */}
          <div className="pd-info">
            {/* Company */}
            <div className="pd-company">
              {detailedProduct.company_logo && (
                <img
                  src={getImageUrl(detailedProduct.company_logo)}
                  alt=""
                  className="pd-company-logo"
                />
              )}
              <button
                className="pd-company-name-btn"
                onClick={() => setShowCompanyProfile(true)}
                title="View company profile"
              >
                {detailedProduct.company_name}
              </button>
              {detailedProduct.company_rank && (
                <span className="pd-company-rank" title={`Leaderboard rank #${detailedProduct.company_rank}`}>
                  #{detailedProduct.company_rank}
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="pd-title">{detailedProduct.name}</h2>

            {/* Rating */}
            <div className="pd-rating">
              <div className="pd-stars">
                {stars.map((star, i) => (
                  <FiStar key={i} size={16}
                    fill={star === 'full' ? '#F59E0B' : 'none'}
                    stroke="#F59E0B" />
                ))}
              </div>
              {!(
                detailedProduct.is_in_stock === false
                && Number(detailedProduct.rating || 0) === 0
                && Number(detailedProduct.total_ratings || 0) === 0
              ) && (
                <span className="pd-rating-text">
                  {safeFixed(detailedProduct.rating, 1)} ({detailedProduct.total_ratings || 0} reviews)
                </span>
              )}
            </div>

            {/* Price */}
            <div className="pd-price-section">
              <span className="pd-current-price">
                {formatPrice(detailedProduct.current_price)}
              </span>
              {parseFloat(detailedProduct.old_price) > parseFloat(detailedProduct.current_price) && (
                <span className="pd-old-price">
                  {formatPrice(detailedProduct.old_price)}
                </span>
              )}
            </div>

            {/* Rewards */}
            {(Number(detailedProduct.points_reward || 0) > 0 || Number(detailedProduct.stars_reward || 0) > 0) && (
              <div className="pd-rewards">
                {Number(detailedProduct.points_reward || 0) > 0 && (
                  <div className="pd-reward-item">
                    <FiZap size={15} />
                    <span>+{Number(detailedProduct.points_reward || 0)} pts</span>
                  </div>
                )}
                {Number(detailedProduct.stars_reward || 0) > 0 && (
                  <div className="pd-reward-item">
                    <FiStar size={15} />
                    <span>+{safeFixed(detailedProduct.stars_reward, 1)} ★</span>
                  </div>
                )}
              </div>
            )}

            {/* COD badge */}
            {detailedProduct.is_cod_allowed ? (
              <div className="pd-rewards">
                <div className="pd-reward-item" style={{ background: '#dcfce7', color: '#16a34a', borderColor: '#bbf7d0' }}>
                  <Banknote size={16} />
                  <span>COD Available</span>
                </div>
              </div>
            ) : null}

            {/* Stock */}
            <div className={`pd-stock ${detailedProduct.is_in_stock ? 'in-stock' : 'out-stock'}`}>
              <FiPackage size={16} />
              <span>
                {detailedProduct.is_in_stock
                  ? `In Stock (${detailedProduct.stock_quantity || 0} available)`
                  : 'Out of Stock'}
              </span>
            </div>

            {/* Specs (compact) */}
            <div className="pd-specs-compact">
              {detailedProduct.brand && (
                <div className="pd-spec"><span>Brand</span><span>{detailedProduct.brand}</span></div>
              )}
              {detailedProduct.model && (
                <div className="pd-spec"><span>Model/Size</span><span>{detailedProduct.model}</span></div>
              )}
              {detailedProduct.color && (
                <div className="pd-spec"><span>Color</span><span>{detailedProduct.color}</span></div>
              )}
              {detailedProduct.warranty && (
                <div className="pd-spec"><span>Warranty</span><span>{detailedProduct.warranty}</span></div>
              )}
            </div>

            {/* Owner Warning */}
            {isSeller && (
              <div className="pd-owner-warning">
                <FiAlertCircle size={16} />
                <span>You own this product. You cannot purchase or review it.</span>
              </div>
            )}

            {/* Quantity and Add to Cart — always visible; disabled for seller */}
            <div className="pd-actions">
                {detailedProduct.is_in_stock && !isSeller && (
                  <div className="pd-quantity">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                      <FiMinus size={16} />
                    </button>
                    <span>{quantity}</span>
                    <button onClick={() => setQuantity(Math.min(parseInt(detailedProduct.stock_quantity) || 10, quantity + 1))}>
                      <FiPlus size={16} />
                    </button>
                  </div>
                )}

                <motion.button
                  className="pd-add-cart-btn"
                  onClick={async () => {
                    if (isSeller) return;
                    if (!isAuthenticated) { onAddToCart(); return; }
                    setAddCartLoading(true);
                    const result = await addToCart(detailedProduct.id, quantity, negotiatedPrice ? parseFloat(negotiatedPrice) : null);
                    setAddCartLoading(false);
                    if (result.success) {
                      const { toast } = await import('react-toastify');
                      toast.success('Added to cart!');
                    } else {
                      const { toast } = await import('react-toastify');
                      toast.error(result.message);
                    }
                  }}
                  disabled={isSeller || !detailedProduct.is_in_stock || addCartLoading}
                  title={isSeller ? 'You cannot add your own product to cart' : undefined}
                  whileHover={{ scale: isSeller ? 1 : 1.02 }}
                  whileTap={{ scale: isSeller ? 1 : 0.98 }}
                >
                  <FiShoppingCart size={18} />
                  {isSeller
                    ? 'Your Product'
                    : addCartLoading
                      ? 'Adding...'
                      : detailedProduct.is_in_stock
                        ? `Add to Cart - ${formatPrice(parseFloat(negotiatedPrice || detailedProduct.current_price) * quantity)}`
                        : 'Out of Stock'}
                </motion.button>

                {!isSeller && detailedProduct.is_in_stock && isAuthenticated && (detailedProduct.is_negotiable === 1 || detailedProduct.is_negotiable === true) && (
                  <motion.button
                    className="pd-negotiate-btn"
                    onClick={() => setShowNegotiator(true)}
                    title="Negotiate price with AI"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Bot size={18} />
                  </motion.button>
                )}

                {!isSeller && !detailedProduct.is_in_stock && isAuthenticated && (
                  <motion.button
                    className={`pd-request-btn ${requestRequested ? 'requested' : ''}`}
                    onClick={async () => {
                      if (requestRequested || requestingProduct) return;
                      setRequestingProduct(true);
                      try {
                        await requestProductService.requestProduct(detailedProduct.id);
                        setRequestRequested(true);
                        addRequestedProduct(detailedProduct.id);
                      } catch (err) {
                        if (err.response?.data?.message) {
                          alert(err.response.data.message);
                        }
                      } finally {
                        setRequestingProduct(false);
                      }
                    }}
                    disabled={requestRequested || requestingProduct}
                    whileHover={{ scale: requestRequested ? 1 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="Notify me when back in stock"
                  >
                    <FiBell size={16} />
                    {requestingProduct ? 'Requesting...' : requestRequested ? '\u2713 Requested \u2013 You will be notified!' : 'Request Product'}
                  </motion.button>
                )}
              </div>
          </div>
        </div>

        {/* ===== BOTTOM SECTION: Tabs ===== */}
        <div className="pd-bottom">
          <div className="pd-tabs">
            <button
              className={`pd-tab ${activeTab === 'description' ? 'active' : ''}`}
              onClick={() => setActiveTab('description')}
            >
              <FileText size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Description
            </button>
            <button
              className={`pd-tab ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              <Star size={14} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Reviews ({reviews.length})
            </button>
            <button
              className={`pd-tab ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              <FiMessageCircle size={14} /> Comments ({comments.length})
            </button>
            {!isSeller && (
              <button
                className={`pd-tab ${activeTab === 'compare' ? 'active' : ''}`}
                onClick={() => setActiveTab('compare')}
              >
                <RefreshCw size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Compare Similar
              </button>
            )}
            <button
              className={`pd-tab ${activeTab === 'category' ? 'active' : ''}`}
              onClick={() => setActiveTab('category')}
            >
              <FolderOpen size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{detailedProduct.category_name || 'Category'}
            </button>
          </div>

          <div className="pd-tab-content">
            {/* Description Tab */}
            {activeTab === 'description' && (
              <div className="pd-description">
                {detailedProduct.description ? (
                  <div className="pd-description-text">
                    {detailedProduct.description.split('\n').map((line, idx) => (
                      <p key={idx}>{line || '\u00A0'}</p>
                    ))}
                  </div>
                ) : (
                  <p className="pd-no-content">No description available for this product.</p>
                )}
              </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <ProductReviews
                productId={detailedProduct.id}
                reviews={reviews}
                onReviewAdded={async () => {
                  try {
                    const res = await api.get(`/products/${detailedProduct.id}/reviews`);
                    if (res.data.success) setReviews(res.data.data || []);
                  } catch (e) { /* ignore */ }
                }}
              />
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <ProductComments
                productId={detailedProduct.id}
                comments={comments}
                isSeller={!!user && detailedProduct.company_owner_id === user.id}
                companyOwnerId={detailedProduct.company_owner_id}
                companyLogo={detailedProduct.company_logo}
                companyName={detailedProduct.company_name}
                onCommentAdded={async () => {
                  try {
                    const res = await api.get(`/products/${detailedProduct.id}/comments`);
                    if (res.data.success) setComments(res.data.data || []);
                  } catch (e) { /* ignore */ }
                }}
              />
            )}

            {/* Compare Similar Tab */}
            {activeTab === 'compare' && (
              <div className="pd-compare">
                {loadingSimilar ? (
                  <div className="pd-loading-similar">
                    <div className="pd-mini-spinner"></div>
                    <span>Finding similar products...</span>
                  </div>
                ) : similarProducts.length === 0 ? (
                  <p className="pd-no-content">No similar products found.</p>
                ) : (
                  <div className="pd-compare-grid">
                    {/* Current product as first card */}
                    <div className="pd-compare-card current">
                      <div className="pd-compare-badge">Current</div>
                      <div className="pd-compare-img">
                        {detailedProduct.image_url ? (
                          <img src={getImageUrl(detailedProduct.image_url)} alt={detailedProduct.name} />
                        ) : <Package size={32} />}
                      </div>
                    </div>

                    {/* Similar products */}
                    {similarProducts.slice(0, 5).map(sp => (
                      <div
                        key={sp.id}
                        className="pd-compare-card"
                        onClick={() => handleOpenSimilarProduct(sp.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleOpenSimilarProduct(sp.id);
                        }}
                        title="Open product"
                      >
                        <div className="pd-compare-img">
                          {sp.image_url ? (
                            <img src={getImageUrl(sp.image_url)} alt={sp.name} />
                          ) : <Package size={32} />}
                        </div>
                        <h4>{sp.name}</h4>
                        <span className="pd-compare-company">{sp.company_name}</span>
                        <span className="pd-compare-price">{formatPrice(sp.current_price)}</span>
                        <span className="pd-compare-rating"><Star size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{safeFixed(sp.rating, 1)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Category Tab */}
            {activeTab === 'category' && (
              <div className="pd-category-info">
                <div className="pd-category-header">
                  <span className="pd-category-icon"><FolderOpen size={20} /></span>
                  <div>
                    <h4>{detailedProduct.category_name || 'Unknown Category'}</h4>
                    <p>This product belongs to the {detailedProduct.category_name || 'general'} category</p>
                  </div>
                </div>

                <div className="pd-product-details-grid">
                  <div className="pd-detail-item">
                    <label>Product ID</label>
                    <span>#{detailedProduct.id}</span>
                  </div>
                  <div className="pd-detail-item">
                    <label>Category</label>
                    <span>{detailedProduct.category_name || 'N/A'}</span>
                  </div>
                  <div className="pd-detail-item">
                    <label>Company</label>
                    <span>{detailedProduct.company_name}</span>
                  </div>
                  <div className="pd-detail-item">
                    <label>Total Sold</label>
                    <span>{detailedProduct.total_sold || 0} units</span>
                  </div>
                  {Number(detailedProduct.points_reward || 0) > 0 && (
                    <div className="pd-detail-item">
                      <label>Points Reward</label>
                      <span><Zap size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />{Number(detailedProduct.points_reward || 0)} pts</span>
                    </div>
                  )}
                  {Number(detailedProduct.stars_reward || 0) > 0 && (
                    <div className="pd-detail-item">
                      <label>Stars Reward</label>
                      <span><Star size={14} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />{safeFixed(detailedProduct.stars_reward, 1)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Cost Negotiator */}
      {showNegotiator && (
        <AINegotiator
          productId={detailedProduct.id}
          productName={detailedProduct.name}
          currentPrice={parseFloat(detailedProduct.current_price)}
          onClose={() => setShowNegotiator(false)}
          onPriceAccepted={(price) => {
            setNegotiatedPrice(price);
            // Don't auto-close: user sees confirmation then clicks Close
          }}
        />
      )}
    </Modal>

    {/* Company Profile Modal */}
    {showCompanyProfile && detailedProduct.company_id && (
      <Modal
        isOpen={true}
        onClose={() => setShowCompanyProfile(false)}
        title={detailedProduct.company_name}
        size="large"
        closePosition="left"
      >
        <CompanyProfile
          companyId={detailedProduct.company_id}
          onClose={() => setShowCompanyProfile(false)}
        />
      </Modal>
    )}
    </>
  );
};

export default ProductDetail;