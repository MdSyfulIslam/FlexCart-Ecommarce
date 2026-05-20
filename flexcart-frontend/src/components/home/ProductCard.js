import React, { useState, useContext, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { FiHeart, FiShoppingCart, FiStar, FiEye, FiZap } from 'react-icons/fi';
import { Zap, Package, Banknote } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import favouriteService from '../../services/favouriteService';
import { formatPrice, getImageUrl, calculateDiscount } from '../../utils/helpers';
import { addFavoritedProduct, removeFavoritedProduct } from '../../utils/searchHistory';
import { toast } from 'react-toastify';
import './ProductCard.css';

const ProductCard = ({ product, onAddToCart, onBuyNow, onViewDetail, onLongPressStart, onDragEnd, onRequireAuth, isOwnProduct = false }) => {
  const { isAuthenticated } = useContext(AuthContext);
  const [isFavourite, setIsFavourite] = useState(() => Boolean(product.isFavourite));
  const [isPressed, setIsPressed] = useState(false);
  const longPressTimer = useRef(null);

  const discountFromField = Math.round(parseFloat(product.discount_percentage || 0)) || 0;
  const discountFromPrices = calculateDiscount(product.old_price, product.current_price);
  const discount = discountFromField > 0 ? discountFromField : discountFromPrices;
  const showOldPrice = parseFloat(product.old_price) > parseFloat(product.current_price);
  const pointsReward = Number(product.points_reward || 0);
  const starsReward = Number(product.stars_reward || 0);
  const showRewards = pointsReward > 0 || starsReward > 0;
  const numericRating = Number(product.rating || 0);
  const totalRatings = Number(product.total_ratings || 0);
  const showRating = !(!product.is_in_stock && numericRating === 0 && totalRatings === 0);

  const safeToFixed = (value, decimals = 1) => {
    const num = Number(value);
    if (isNaN(num)) return '0.0';
    return num.toFixed(decimals);
  };

  const handleToggleFavourite = async (e) => {
    e.stopPropagation();
    if (!isAuthenticated) { onRequireAuth(); return; }
    try {
      const response = await favouriteService.toggleFavourite(product.id);
      if (response.data.success) {
        const nowFavourite = Boolean(response.data.data.isFavourite);
        setIsFavourite(nowFavourite);
        if (nowFavourite) addFavoritedProduct(product.id);
        else removeFavoritedProduct(product.id);
        toast.success(nowFavourite ? 'Added to favourites' : 'Removed from favourites');
      }
    } catch {
      toast.error('Failed to update favourite');
    }
  };

  const handleMouseDown = () => {
    longPressTimer.current = setTimeout(() => {
      setIsPressed(true);
      if (onLongPressStart) onLongPressStart();
    }, 500);
  };

  const handleMouseUp = () => {
    clearTimeout(longPressTimer.current);
    if (isPressed) {
      if (onDragEnd) onDragEnd();
      setIsPressed(false);
    }
  };

  return (
    <motion.div
      className={'product-card' + (!product.is_in_stock ? ' out-of-stock' : '')}
      whileHover={{ y: -6, boxShadow: '0 12px 30px rgba(0,0,0,0.12)' }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      layout
    >
      {/* Image */}
      <div className="product-card-image" onClick={onViewDetail}>
        {product.image_url ? (
          <img src={getImageUrl(product.image_url)} alt={product.name} loading="lazy" />
        ) : (
          <Package size={48} />
        )}

        {/* Badges */}
        <div className="product-badges">
          {discount > 0 && <span className="badge-discount">-{discount}%</span>}
          {!product.is_in_stock && <span className="badge-out-of-stock">Out of Stock</span>}
          {product.is_cod_allowed && product.is_in_stock && <span className="badge-cod"><Banknote size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Cash on Delivery</span>}
        </div>

        {/* Quick Actions */}
        <div className="product-quick-actions">
          <motion.button
            className={'quick-action-btn favourite-btn' + (isFavourite ? ' active' : '')}
            onClick={handleToggleFavourite}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <FiHeart size={16} fill={isFavourite ? 'currentColor' : 'none'} />
          </motion.button>
          <motion.button
            className="quick-action-btn view-btn"
            onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <FiEye size={16} />
          </motion.button>
        </div>
      </div>

      {/* Info */}
      <div className="product-card-info">
        <div className="product-company">
          {product.company_logo && (
            <img src={getImageUrl(product.company_logo)} alt="" className="company-mini-logo" />
          )}
          <span className="company-name">{product.company_name || 'Unknown'}</span>
        </div>

        <h3 className="product-name" onClick={onViewDetail}>{product.name}</h3>

        {showRating && (
          <div className="product-rating">
            <FiStar size={13} fill="#F59E0B" stroke="#F59E0B" />
            <span className="rating-value">{safeToFixed(product.rating)}</span>
            <span className="rating-count">({product.total_ratings || 0})</span>
          </div>
        )}

        <div className="product-price-row">
          <div className="product-prices">
            <span className="price-current">{formatPrice(product.current_price)}</span>
            {showOldPrice && <span className="price-old">{formatPrice(product.old_price)}</span>}
          </div>
        </div>

        {showRewards && (
          <div className="product-rewards">
            {pointsReward > 0 && (
              <span className="reward-item"><FiZap size={12} /> +{pointsReward} pts</span>
            )}
            {starsReward > 0 && (
              <span className="reward-item"><FiStar size={12} /> +{safeToFixed(starsReward)} ★</span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="product-actions">
          <motion.button
            className="add-cart-btn"
            onClick={(e) => { e.stopPropagation(); if (!isOwnProduct) onAddToCart(); }}
            disabled={!product.is_in_stock || isOwnProduct}
            title={isOwnProduct ? 'You cannot add your own product to cart' : undefined}
            whileHover={{ scale: isOwnProduct ? 1 : 1.02 }}
            whileTap={{ scale: isOwnProduct ? 1 : 0.98 }}
          >
            <FiShoppingCart size={15} />
            {isOwnProduct ? 'Your Product' : product.is_in_stock ? 'Add to Cart' : 'Out of Stock'}
          </motion.button>

          {!isOwnProduct && product.is_in_stock && (
            <motion.button
              className="buy-now-btn"
              onClick={(e) => { e.stopPropagation(); if (onBuyNow) onBuyNow(); }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Zap size={15} />
              Buy Now
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default memo(ProductCard);
