import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiBox, FiTag, FiBriefcase, FiCamera } from 'react-icons/fi';
import productService from '../../services/productService';
import { debounce, formatPrice, getImageUrl } from '../../utils/helpers';
import { useNavigation } from '../../context/NavigationContext';
import ImageSearchModal from './ImageSearchModal';
import './SearchBar.css';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ products: [], suggestions: [] });
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const { setActiveSection, setFilters, setPendingProductId } = useNavigation();

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(
    debounce(async (searchTerm) => {
      if (searchTerm.length < 2) {
        setResults({ products: [], suggestions: [] });
        setShowResults(false);
        return;
      }

      setLoading(true);
      try {
        const response = await productService.searchProducts(searchTerm);
        if (response.data.success) {
          setResults(response.data.data);
          setShowResults(true);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    performSearch(value);
  };

  const handleClear = () => {
    setQuery('');
    setResults({ products: [], suggestions: [] });
    setShowResults(false);
    inputRef.current?.focus();
  };

  const closeAndReset = () => {
    setShowResults(false);
    setQuery('');
    setResults({ products: [], suggestions: [] });
  };

  // Enter key → navigate home with search filter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim().length >= 2) {
      setFilters({ search: query.trim() });
      setActiveSection('home');
      closeAndReset();
      inputRef.current?.blur();
    }
  };

  // Product click → open product detail directly
  const handleProductClick = (product) => {
    setPendingProductId(product.id);
    setActiveSection('home');
    closeAndReset();
  };

  // Suggestion click → filter home by suggestion text
  const handleSuggestionClick = (text) => {
    setFilters({ search: text });
    setActiveSection('home');
    closeAndReset();
  };

  const typeIcons = {
    product: <FiBox size={14} />,
    brand: <FiTag size={14} />,
    company: <FiBriefcase size={14} />
  };

  return (
    <div className="search-bar-container" ref={containerRef}>
      <div className="search-input-wrapper">
        <FiSearch className="search-icon" size={18} />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search products, brands, companies..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          onFocus={() => {
            if (results.products.length > 0 || results.suggestions.length > 0) {
              setShowResults(true);
            }
          }}
        />
        {query && (
          <button className="search-clear" onClick={handleClear}>
            <FiX size={16} />
          </button>
        )}
        <button
          className="search-camera-btn"
          onClick={() => setShowImageSearch(true)}
          title="Visual image search"
          type="button"
        >
          <FiCamera size={17} />
        </button>
        {loading && (
          <motion.div
            className="search-loading"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <div className="search-spinner" />
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showResults && (results.suggestions.length > 0 || results.products.length > 0) && (
          <motion.div
            className="search-results-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            {/* Suggestions */}
            {results.suggestions.length > 0 && (
              <div className="search-section">
                <h4 className="search-section-title">Suggestions</h4>
                {results.suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="search-suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion.text)}
                  >
                    {typeIcons[suggestion.type] || <FiSearch size={14} />}
                    <span>{suggestion.text}</span>
                    <span className="suggestion-type">{suggestion.type}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Product Results */}
            {results.products.length > 0 && (
              <div className="search-section">
                <h4 className="search-section-title">
                  Products ({results.products.length})
                </h4>
                {results.products.slice(0, 6).map((product) => (
                  <div
                    key={product.id}
                    className="search-product-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleProductClick(product)}
                  >
                    <div className="search-product-img">
                      {product.image_url ? (
                        <img src={getImageUrl(product.image_url)} alt={product.name} />
                      ) : (
                        <FiBox size={20} />
                      )}
                    </div>
                    <div className="search-product-info">
                      <p className="search-product-name">{product.name}</p>
                      <p className="search-product-company">{product.company_name}</p>
                    </div>
                    <div className="search-product-price">
                      <span className="price-current">{formatPrice(product.current_price)}</span>
                      {!product.is_in_stock && (
                        <span className="out-of-stock-tag">Out of Stock</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {results.products.length === 0 && results.suggestions.length === 0 && query.length >= 2 && (
              <div className="search-empty">
                <p>No results found for "{query}"</p>
                <p className="search-empty-hint">Try different keywords or check spelling</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImageSearch && (
          <ImageSearchModal onClose={() => setShowImageSearch(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;