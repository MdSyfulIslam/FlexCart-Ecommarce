import React, { useState, useEffect, useRef, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiGrid, FiSliders, FiChevronDown } from 'react-icons/fi';
import { ThemeContext } from '../../context/ThemeContext';
import productService from '../../services/productService';
import './CategoryBar.css';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_low_high', label: 'Price: Low to High' },
  { value: 'price_high_low', label: 'Price: High to Low' },
  { value: 'most_rated', label: 'Top Rated' },
  { value: 'most_sold', label: 'Most Popular' },
  { value: 'discount', label: 'Biggest Discount' },
];

const CategoryBar = ({ activeCategory, activeSort, onCategoryChange, onSortChange, onFilterChange, showRecommendations, onToggleRecommendations }) => {
  const { backgroundImage } = useContext(ThemeContext);
  const [categories, setCategories] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Scroll behavior states
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const hideTimerRef = useRef(null);
  const categoryRef = useRef(null);

  useEffect(() => {
    loadCategories();
  }, []);

  // Track if any dropdown is open
  useEffect(() => {
    setIsDropdownOpen(showCategoryDropdown || showSortDropdown);
  }, [showCategoryDropdown, showSortDropdown]);

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Never hide while dropdown is open
      if (isDropdownOpen) {
        setLastScrollY(currentScrollY);
        return;
      }

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling DOWN - hide
        setIsVisible(false);
        clearTimeout(hideTimerRef.current);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling UP - show temporarily
        setIsVisible(true);
        clearTimeout(hideTimerRef.current);

        // Auto-hide after 2 seconds
        hideTimerRef.current = setTimeout(() => {
          if (window.scrollY > 100 && !isDropdownOpen) {
            setIsVisible(false);
          }
        }, 2000);
      }

      // Always show at top of page
      if (currentScrollY < 50) {
        setIsVisible(true);
        clearTimeout(hideTimerRef.current);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(hideTimerRef.current);
    };
  }, [lastScrollY, isDropdownOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target)) {
        setShowCategoryDropdown(false);
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCategories = async () => {
    try {
      const response = await productService.getCategories();
      if (response.data.success) {
        setCategories(response.data.data);
      }
    } catch (error) {
      console.error('Load categories error:', error);
    }
  };

  const handleCategorySelect = (categoryId) => {
    onCategoryChange(categoryId === activeCategory ? null : categoryId);
    setShowCategoryDropdown(false);
  };

  const handleSortSelect = (sortValue) => {
    onSortChange(sortValue);
    setShowSortDropdown(false);
  };

  const handleToggleDropdown = (type) => {
    if (type === 'category') {
      setShowCategoryDropdown(prev => !prev);
      setShowSortDropdown(false);
    } else {
      setShowSortDropdown(prev => !prev);
      setShowCategoryDropdown(false);
    }

    // Keep bar visible and clear any hide timer
    setIsVisible(true);
    clearTimeout(hideTimerRef.current);
  };

  const activeCategoryName = activeCategory
    ? categories.find(c => c.id === activeCategory)?.name || 'Category'
    : 'All Categories';

  const activeSortLabel = SORT_OPTIONS.find(s => s.value === activeSort)?.label || 'Sort & Filter';

  return (
    <div
      ref={categoryRef}
      className={`category-bar ${isVisible ? 'cb-visible' : 'cb-hidden'} ${backgroundImage ? 'cb-transparent' : ''}`}
    >
      <div className="cb-inner">
        {/* Recommendations Toggle Button */}
        <button
          className={`cb-btn cb-recommendations-btn ${showRecommendations ? 'active' : ''}`}
          onClick={() => onToggleRecommendations && onToggleRecommendations(!showRecommendations)}
          title="Toggle Recommendations"
        >
          <span>Recommendations</span>
          <FiChevronDown size={14} className={`cb-arrow ${showRecommendations ? 'rotated' : ''}`} />
        </button>
        {/* Category Dropdown */}
        <div className="cb-dropdown-wrapper">
          <button
            className={`cb-btn ${showCategoryDropdown ? 'active' : ''} ${activeCategory ? 'has-selection' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleDropdown('category');
            }}
          >
            <FiGrid size={15} />
            <span>{activeCategoryName}</span>
            <FiChevronDown size={14} className={`cb-arrow ${showCategoryDropdown ? 'rotated' : ''}`} />
          </button>

          <AnimatePresence>
            {showCategoryDropdown && (
              <motion.div
                className="cb-dropdown"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={`cb-dropdown-item ${!activeCategory ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCategorySelect(null);
                  }}
                >
                  All Categories
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`cb-dropdown-item ${activeCategory === cat.id ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCategorySelect(cat.id);
                    }}
                  >
                    {cat.name}
                    {cat.product_count && (
                      <span className="cb-count">{cat.product_count}</span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sort & Filter Dropdown */}
        <div className="cb-dropdown-wrapper">
          <button
            className={`cb-btn ${showSortDropdown ? 'active' : ''} ${activeSort !== 'newest' ? 'has-selection' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleDropdown('sort');
            }}
          >
            <FiSliders size={15} />
            <span>{activeSortLabel}</span>
            <FiChevronDown size={14} className={`cb-arrow ${showSortDropdown ? 'rotated' : ''}`} />
          </button>

          <AnimatePresence>
            {showSortDropdown && (
              <motion.div
                className="cb-dropdown"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
              >
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`cb-dropdown-item ${activeSort === opt.value ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSortSelect(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default CategoryBar;