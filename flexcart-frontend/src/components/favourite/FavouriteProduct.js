import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHeart, FiShoppingCart, FiTrash2 } from 'react-icons/fi';
import { Heart, Package } from 'lucide-react';
import { CartContext } from '../../context/CartContext';
import favouriteService from '../../services/favouriteService';
import LoadingSpinner from '../common/LoadingSpinner';
import ProductDetail from '../home/ProductDetail';
import { formatPrice, getImageUrl } from '../../utils/helpers';
import { toast } from 'react-toastify';
import './FavouriteProduct.css';

const FavouriteProduct = ({ onRequireAuth }) => {
  const { addToCart } = useContext(CartContext);
  const [favourites, setFavourites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(function () {
    loadFavourites();
  }, []);

  var loadFavourites = function () {
    setLoading(true);
    favouriteService.getFavourites()
      .then(function (response) {
        if (response.data.success) {
          setFavourites(response.data.data || []);
        }
      })
      .catch(function (error) {
        console.error('Load favourites error:', error);
        setFavourites([]);
      })
      .finally(function () {
        setLoading(false);
      });
  };

  var handleRemove = function (productId) {
    setRemovingId(productId);
    favouriteService.toggleFavourite(productId)
      .then(function () {
        setFavourites(function (prev) {
          return prev.filter(function (f) { return f.id !== productId; });
        });
        toast.success('Removed from favourites');
      })
      .catch(function () {
        toast.error('Failed to remove');
      })
      .finally(function () {
        setRemovingId(null);
      });
  };

  var handleAddToCart = function (product) {
    if (!product.is_in_stock) return;
    addToCart(product.id, 1)
      .then(function () {
        toast.success('Added to cart');
      })
      .catch(function () {
        toast.error('Failed to add to cart');
      });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <div className="favourite-product">
        <div className="fp-header">
          <div className="fp-header-left">
            <FiHeart size={22} className="fp-header-icon" />
            <div>
              <h2 className="fp-title">Favourite Products</h2>
              <p className="fp-count">
                {favourites.length} item{favourites.length !== 1 ? 's' : ''} saved
              </p>
            </div>
          </div>
        </div>

        {favourites.length === 0 ? (
          <div className="fp-empty">
            <Heart size={48} fill="currentColor" />
            <h3>No favourites yet</h3>
            <p>Products you love will appear here</p>
          </div>
        ) : (
          <div className="fp-grid">
            <AnimatePresence>
              {favourites.map(function (fav, index) {
                return (
                  <motion.div
                    key={fav.id}
                    className="fp-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.04, duration: 0.25 }}
                    style={{ cursor: 'pointer' }}
                    onClick={function () { setSelectedProduct(fav); }}
                  >
                    <div className="fp-card-img">
                      {fav.image_url ? (
                        <img src={getImageUrl(fav.image_url)} alt={fav.name} />
                      ) : (
                        <Package size={32} />
                      )}
                      {fav.discount_percentage > 0 && (
                        <span className="fp-discount-badge">
                          -{Math.round(fav.discount_percentage)}%
                        </span>
                      )}
                      {!fav.is_in_stock && (
                        <span className="fp-oos-badge">Out of Stock</span>
                      )}
                      <button
                        className={'fp-remove-btn' + (removingId === fav.id ? ' removing' : '')}
                        onClick={function (e) { e.stopPropagation(); handleRemove(fav.id); }}
                        disabled={removingId === fav.id}
                        title="Remove from favourites"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>

                    <div className="fp-card-info">
                      <p className="fp-company">{fav.company_name}</p>
                      <h4 className="fp-name">{fav.name}</h4>
                      <div className="fp-price-row">
                        <span className="fp-price">{formatPrice(fav.current_price)}</span>
                        {fav.original_price && fav.original_price > fav.current_price && (
                          <span className="fp-original-price">{formatPrice(fav.original_price)}</span>
                        )}
                      </div>
                      <button
                        className={'fp-cart-btn' + (!fav.is_in_stock ? ' disabled' : '')}
                        onClick={function (e) { e.stopPropagation(); handleAddToCart(fav); }}
                        disabled={!fav.is_in_stock}
                      >
                        <FiShoppingCart size={14} />
                        <span>{fav.is_in_stock ? 'Add to Cart' : 'Out of Stock'}</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={function () { setSelectedProduct(null); }}
        />
      )}
    </>
  );
};

export default FavouriteProduct;