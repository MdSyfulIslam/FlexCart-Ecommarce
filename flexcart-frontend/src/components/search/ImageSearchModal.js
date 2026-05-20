import React, { useState, useRef, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUpload, FiX, FiCamera, FiSearch, FiStar } from 'react-icons/fi';
import { Target, Package } from 'lucide-react';
import api from '../../services/api';
import { formatPrice, getImageUrl } from '../../utils/helpers';
import { useNavigation } from '../../context/NavigationContext';
import './ImageSearchModal.css';

const ImageSearchModal = ({ onClose }) => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const { setActiveSection, setPendingProductId } = useNavigation();

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
    setResults(null);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleSearch = async () => {
    if (!imageFile) return;
    setLoading(true);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      if (description.trim()) formData.append('description', description.trim());

      const res = await api.post('/ai/process', formData);

      if (res.data.success) {
        const inStock = res.data.data?.inStock || [];
        const outOfStock = res.data.data?.outOfStock || [];
        setResults({ inStock, outOfStock });
      } else {
        setResults({ inStock: [], outOfStock: [], error: res.data.message });
      }
    } catch (err) {
      setResults({ inStock: [], outOfStock: [], error: 'Search failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleProductClick = (product) => {
    setPendingProductId(product.id);
    setActiveSection('home');
    onClose();
  };

  const totalResults = (results?.inStock?.length || 0) + (results?.outOfStock?.length || 0);
  const exactMatches = [...(results?.inStock || []), ...(results?.outOfStock || [])].filter(p => p.exact_match);

  return (
    <motion.div
      className="ism-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ism-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ism-header">
          <div className="ism-header-title">
            <FiCamera size={20} />
            <h2>Visual Image Search</h2>
          </div>
          <button className="ism-close" onClick={onClose}><FiX size={20} /></button>
        </div>

        <div className="ism-body">
          {/* Upload Zone */}
          <div
            className={`ism-upload-zone ${dragOver ? 'drag-over' : ''} ${imagePreview ? 'has-image' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !imagePreview && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {imagePreview ? (
              <div className="ism-preview-wrap">
                <img src={imagePreview} alt="Search query" className="ism-preview-img" />
                <button
                  className="ism-preview-remove"
                  onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setResults(null); }}
                >
                  <FiX size={16} />
                </button>
              </div>
            ) : (
              <div className="ism-upload-prompt">
                <FiUpload size={36} className="ism-upload-icon" />
                <p className="ism-upload-text">Drop an image here, or <span>browse</span></p>
                <p className="ism-upload-hint">Supports JPG, PNG, WebP — finds visually similar products</p>
              </div>
            )}
          </div>

          {/* Description hint */}
          <div className="ism-desc-row">
            <input
              type="text"
              className="ism-desc-input"
              placeholder='Optional hint: "red running shoes", "leather wallet"…'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <motion.button
              className="ism-search-btn"
              disabled={!imageFile || loading}
              onClick={handleSearch}
              whileTap={{ scale: 0.97 }}
            >
              {loading ? (
                <motion.span className="ism-spinner" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}>⟳</motion.span>
              ) : (
                <><FiSearch size={16} /> Search</>
              )}
            </motion.button>
          </div>

          {/* Tip */}
          {!imagePreview && !results && (
            <p className="ism-tip">
              📸 Tip: Upload a photo of any product to find it or similar items. Add keywords (e.g. "S20 Ultra") to combine image + text for more accurate results.
            </p>
          )}

          {/* Loading state */}
          {loading && (
            <div className="ism-loading">
              <div className="ism-loading-dots">
                <span /><span /><span />
              </div>
              <p>Analyzing image with AI visual search…</p>
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {results && !loading && (
              <motion.div
                className="ism-results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {results.error ? (
                  <p className="ism-error">{results.error}</p>
                ) : totalResults === 0 ? (
                  <div className="ism-no-results">
                    <p>No visually similar products found.</p>
                    <p className="ism-no-results-hint">Try a clearer photo or add a description hint above.</p>
                  </div>
                ) : (
                  <>
                    <div className="ism-results-header">
                      <span>{totalResults} similar product{totalResults !== 1 ? 's' : ''} found</span>
                      {exactMatches.length > 0 && (
                        <span className="ism-exact-badge"><Target size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{exactMatches.length} exact match{exactMatches.length !== 1 ? 'es' : ''}</span>
                      )}
                    </div>

                    {/* All results — exact matches first, then by similarity score.
                        Single unified list so the best match is always at the top
                        regardless of stock status. */}
                    {(() => {
                      const allResults = [
                        ...(results.inStock || []),
                        ...(results.outOfStock || [])
                      ].sort((a, b) => {
                        const aE = a.exact_match ? 1 : 0;
                        const bE = b.exact_match ? 1 : 0;
                        if (aE !== bE) return bE - aE;
                        return (b.score || 0) - (a.score || 0);
                      });
                      return (
                        <div className="ism-results-group">
                          <div className="ism-results-grid">
                            {allResults.map((product) => {
                              const isOos = !product.is_in_stock;
                              return (
                                <motion.div
                                  key={product.id}
                                  className={`ism-product-card ${product.exact_match ? 'exact-match' : ''} ${isOos ? 'ism-product-card--oos' : ''}`}
                                  onClick={() => handleProductClick(product)}
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.98 }}
                                >
                                  {product.exact_match && (
                                    <span className="ism-exact-label"><Target size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Exact Match</span>
                                  )}
                                  <div className="ism-product-img">
                                    {product.image_url ? (
                                      <img src={getImageUrl(product.image_url)} alt={product.name} onError={(e) => { e.target.style.display = 'none'; }} />
                                    ) : (
                                      <div className="ism-product-img-placeholder"><Package size={32} /></div>
                                    )}
                                  </div>
                                  <div className="ism-product-info">
                                    <p className="ism-product-name">{product.name}</p>
                                    <p className="ism-product-company">{product.company_name}</p>
                                    <div className="ism-product-footer">
                                      <span className={`ism-product-price${isOos ? ' ism-product-price--oos' : ''}`}>{formatPrice(product.current_price)}</span>
                                      {isOos ? (
                                        <span className="ism-oos-tag">Out of Stock</span>
                                      ) : product.rating > 0 && (
                                        <span className="ism-product-rating">
                                          <FiStar size={11} /> {parseFloat(product.rating).toFixed(1)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ImageSearchModal;
