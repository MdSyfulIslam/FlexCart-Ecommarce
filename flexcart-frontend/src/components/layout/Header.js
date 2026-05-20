import React, { useState, useEffect, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiShoppingCart, FiBell, FiUser, FiStar, FiZap,
  FiSearch, FiX, FiTrash2, FiMenu
} from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { CartContext } from '../../context/CartContext';
import { NotificationContext } from '../../context/NotificationContext';
import CartDropdown from '../cart/CartDropdown';
import NotificationDropdown from '../notification/NotificationDropdown';
import ProfileDropdown from '../profile/ProfileDropdown';
import AIProcess from '../ai/AIProcess';
import productService from '../../services/productService';
import { addSearchHistory, getSearchHistory, removeFromSearchHistory, clearSearchHistory } from '../../utils/searchHistory';
import { getImageUrl } from '../../utils/helpers';

import Modal from '../common/Modal';
import MyProfile from '../profile/MyProfile';
import SwitchAccount from '../profile/SwitchAccount';
import CreateCompany from '../company/CreateCompany';
import AppearanceSettings from '../appearance/AppearanceSettings';
import BackgroundTheme from '../appearance/BackgroundTheme';
import Settings from '../settings/Settings';
import LoginModal from '../auth/LoginModal';
import RegisterModal from '../auth/RegisterModal';
import { NavigationContext } from '../../context/NavigationContext';

import './Header.css';

// AIIcon
const AIIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="aiGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8" />
        <stop offset="50%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#6D28D9" />
      </linearGradient>
      <linearGradient id="aiGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
    </defs>
    {/* Main large 4-point star */}
    <path
      d="M10 2L12.5 8.5L19 11L12.5 13.5L10 20L7.5 13.5L1 11L7.5 8.5L10 2Z"
      stroke="url(#aiGrad1)"
      strokeWidth="1.6"
      strokeLinejoin="round"
      fill="none"
    >
      <animate attributeName="stroke-opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
    </path>
    {/* Top-right small star */}
    <path
      d="M18 1L19 4L22 5L19 6L18 9L17 6L14 5L17 4L18 1Z"
      fill="url(#aiGrad2)"
      opacity="0.9"
    >
      <animate attributeName="opacity" values="0.9;0.5;0.9" dur="1.8s" repeatCount="indefinite" />
    </path>
    {/* Bottom-right small star */}
    <path
      d="M19 16L20 18.5L22.5 19.5L20 20.5L19 23L18 20.5L15.5 19.5L18 18.5L19 16Z"
      fill="#7C3AED"
      opacity="0.7"
    >
      <animate attributeName="opacity" values="0.7;0.4;0.7" dur="2.2s" repeatCount="indefinite" />
    </path>
    {/* Small plus/cross accent */}
    <path
      d="M3.5 3V6M2 4.5H5"
      stroke="#818CF8"
      strokeWidth="1.3"
      strokeLinecap="round"
      opacity="0.6"
    >
      <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
    </path>
  </svg>
);
const Header = ({ onMobileMenuToggle, mobileMenuOpen }) => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const { cartCount } = useContext(CartContext);
  const { unreadCount } = useContext(NotificationContext);
  const { navigateTo, navigate } = useContext(NavigationContext);

  // Animation states
  const [cartArrived, setCartArrived] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [headerNarrow, setHeaderNarrow] = useState(false);

  // Dropdown states
  const [showCart, setShowCart] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAI, setShowAI] = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const originalQueryRef = useRef('');

  // Modal states
  const [activeModal, setActiveModal] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const headerRef = useRef(null);
  const searchRef = useRef(null);
  const aiRef = useRef(null);
  const searchTimerRef = useRef(null);

  // Cart animation: 300ms startup delay then 2.6s easeInOut slide
  useEffect(() => {
    // Brief pause so page fully renders before cart starts moving
    const cartTimer = setTimeout(() => {
      setCartArrived(true);
    }, 300);

    // Other options fade in after cart arrives
    const introTimer = setTimeout(() => {
      setIntroComplete(true);
      setTimeout(() => setHeaderNarrow(true), 200);
    }, 3100);

    return () => {
      clearTimeout(cartTimer);
      clearTimeout(introTimer);
    };
  }, []);

  // Cleanup search timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Scroll selected suggestion into view when navigating with arrow keys
  useEffect(() => {
    if (selectedIndex < 0 || !searchRef.current) return;
    const item = searchRef.current.querySelector(`[data-idx="${selectedIndex}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setShowCart(false);
        setShowNotifications(false);
        setShowProfile(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
        setSearchFocused(false);
      }
      if (aiRef.current && !aiRef.current.contains(e.target)) {
        setShowAI(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeAllDropdowns = (except) => {
    if (except !== 'cart') setShowCart(false);
    if (except !== 'notifications') setShowNotifications(false);
    if (except !== 'profile') setShowProfile(false);
    if (except !== 'ai') setShowAI(false);
    if (except !== 'search') { setShowSearchResults(false); setSearchFocused(false); }
  };

  // Profile modal handlers
  const handleOpenModal = (modalName) => {
    setShowProfile(false);
    if (modalName === 'companyDashboard') {
      navigateTo('company-dashboard');
      return;
    }
    setActiveModal(modalName);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
  };

  const handleRequireLogin = () => {
    setShowProfile(false);
    setShowLogin(true);
  };

  const handleRequireRegister = () => {
    setShowProfile(false);
    setShowLogin(false);
    setShowRegister(true);
  };

  // Search - products, brands, and companies
  const performSearch = (searchTerm) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (searchTerm.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await productService.searchProducts(searchTerm);
        if (response.data.success) {
          const data = response.data.data;
          const seen = new Set();
          const allNames = [];

          const add = (val) => {
            if (val && !seen.has(val.toLowerCase())) {
              seen.add(val.toLowerCase());
              allNames.push(val);
            }
          };

          const products = Array.isArray(data) ? data : (data.products || []);
          products.forEach(p => {
            add(p.name);
            if (p.brand) add(p.brand);
            if (p.company_name) add(p.company_name);
          });

          // Sort by relevance: starts-with > word-starts-with > contains
          const lower = searchTerm.toLowerCase();
          const rank = (s) => {
            const sl = s.toLowerCase();
            if (sl.startsWith(lower)) return 0;
            if (sl.split(/\s+/).some(w => w.startsWith(lower))) return 1;
            return 2;
          };
          allNames.sort((a, b) => {
            const diff = rank(a) - rank(b);
            return diff !== 0 ? diff : a.toLowerCase().localeCompare(b.toLowerCase());
          });

          setSearchResults(allNames.slice(0, 20));
          setShowSearchResults(allNames.length > 0);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSelectedIndex(-1);
    originalQueryRef.current = value;
    if (value.trim().length === 0) {
      setShowSearchHistory(true);
      setSearchHistory(getSearchHistory());
      setShowSearchResults(false);
      setSearchResults([]);
    } else {
      setShowSearchHistory(false);
      performSearch(value);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedIndex(-1);
    setShowSearchResults(false);
    setShowSearchHistory(false);
    originalQueryRef.current = '';
  };

  const handleSuggestionClick = (name) => {
    setSearchQuery(name);
    setSelectedIndex(-1);
    setShowSearchResults(false);
    setShowSearchHistory(false);
    addSearchHistory(name);
    navigate('home', { search: name });
  };

  const handleRemoveFromHistory = (e, query) => {
    e.stopPropagation();
    removeFromSearchHistory(query);
    setSearchHistory(getSearchHistory());
  };

  const handleClearAllHistory = (e) => {
    e.stopPropagation();
    clearSearchHistory();
    setSearchHistory([]);
  };

  const handleSearchKeyDown = (e) => {
    if (!showSearchResults || searchResults.length === 0) {
      if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
        navigate('home', { search: searchQuery.trim() });
        setShowSearchResults(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(selectedIndex + 1, searchResults.length - 1);
      setSelectedIndex(next);
      setSearchQuery(searchResults[next]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(selectedIndex - 1, -1);
      setSelectedIndex(prev);
      setSearchQuery(prev === -1 ? originalQueryRef.current : searchResults[prev]);
    } else if (e.key === 'Enter') {
      const query = searchQuery.trim();
      if (query.length >= 2) {
        setShowSearchResults(false);
        setSelectedIndex(-1);
        addSearchHistory(query);
        navigate('home', { search: query });
      }
    } else if (e.key === 'Escape') {
      setShowSearchResults(false);
      setSelectedIndex(-1);
      setSearchQuery(originalQueryRef.current);
    }
  };

  return (
    <>
      <motion.header
        ref={headerRef}
        className={`header ${headerNarrow ? 'header-narrow' : ''}`}
        initial={{ height: 72 }}
        animate={{ height: headerNarrow ? 60 : 72 }}
        transition={{ duration: 0.3 }}
      >
        <div className="header-inner">

          {/* ====== LEFT: Logo + Cart Animation ====== */}
          <div className="header-logo" onClick={() => navigateTo('home')} style={{ cursor: 'pointer' }}>
            <motion.span
              className="logo-text"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
            >
              FlexC
            </motion.span>
            <motion.div
              className="logo-cart-icon"
              initial={{ x: 1500, opacity: 0, scale: 0.85 }}
              animate={{
                x: cartArrived ? 0 : 1500,
                opacity: cartArrived ? 1 : 0,
                scale: cartArrived ? 1 : 0.85
              }}
              transition={{
                type: 'tween',
                duration: 2.6,
                ease: [0.42, 0, 0.58, 1],
              }}
            >
              <FiShoppingCart size={22} />
            </motion.div>
          </div>

          {/* ====== MOBILE: Hamburger Menu Button ====== */}
          <button
            className={`hamburger-btn${mobileMenuOpen ? ' hamburger-btn--open' : ''}`}
            onClick={onMobileMenuToggle}
            aria-label="Toggle navigation menu"
          >
            <FiMenu size={22} />
          </button>

          {/* ====== CENTER: AI + Search (appears after cart arrives) ====== */}
          <AnimatePresence>
            {introComplete && (
              <motion.div
                className="header-center"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <div className={`search-bar-container ${searchFocused ? 'focused' : ''}`}>
                  {/* AI Button */}
                  <div className="search-ai-wrapper" ref={aiRef}>
                    <button
                      className={`search-ai-btn ${showAI ? 'active' : ''}`}
                      onClick={() => {
                        closeAllDropdowns('ai');
                        setShowAI(!showAI);
                      }}
                      title="AI Image Search"
                    >
                      <AIIcon size={20} />
                    </button>

                    <AnimatePresence>
                      {showAI && (
                        <motion.div
                          className="ai-dropdown-panel"
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.2 }}
                        >
                          <AIProcess onClose={() => setShowAI(false)} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="search-divider" />

                  {/* Search Input */}
                  <div className="search-input-area" ref={searchRef}>
                    <FiSearch size={16} className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search products, brands, companies..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onKeyDown={handleSearchKeyDown}
                      onFocus={() => {
                        closeAllDropdowns('search');
                        setSearchFocused(true);
                        if (searchQuery.trim().length === 0) {
                          // Show search history when focused without active query
                          setSearchHistory(getSearchHistory());
                          setShowSearchHistory(true);
                          setShowSearchResults(false);
                        } else if (searchResults.length > 0) {
                          setShowSearchResults(true);
                          setShowSearchHistory(false);
                        }
                      }}
                    />
                    {searchLoading && (
                      <div className="search-loader">
                        <motion.div
                          className="search-loader-dot"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                        />
                      </div>
                    )}
                    {searchQuery && !searchLoading && (
                      <button className="search-clear-btn" onClick={handleClearSearch}>
                        <FiX size={14} />
                      </button>
                    )}

                    {/* Suggestions */}
                    <AnimatePresence>
                      {showSearchResults && searchResults.length > 0 && (
                        <motion.div
                          className="search-suggestions"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.15 }}
                        >
                          {searchResults.map((name, index) => (
                            <button
                              key={index}
                              data-idx={index}
                              className={`search-suggestion-item${index === selectedIndex ? ' suggestion-selected' : ''}`}
                              onClick={() => handleSuggestionClick(name)}
                            >
                              <FiSearch size={14} className="suggestion-icon" />
                              <span className="suggestion-text">{name}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Search History */}
                    <AnimatePresence>
                      {showSearchHistory && searchHistory.length > 0 && (
                        <motion.div
                          className="search-suggestions search-history-dropdown"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.15 }}
                        >
                          {searchHistory.map((item, index) => (
                            <div key={index} className="search-history-item">
                              <button
                                className="search-history-text"
                                onClick={() => handleSuggestionClick(item.query)}
                              >
                                <FiSearch size={14} className="suggestion-icon" />
                                <span className="suggestion-text">{item.query}</span>
                              </button>
                              <button
                                className="search-history-remove"
                                onClick={(e) => handleRemoveFromHistory(e, item.query)}
                                title="Remove from history"
                              >
                                <FiX size={12} />
                              </button>
                            </div>
                          ))}
                          <button
                            className="search-history-clear-all"
                            onClick={handleClearAllHistory}
                          >
                            <FiTrash2 size={12} />
                            <span>Clear all history</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ====== RIGHT: Stats + Actions (appears after cart arrives) ====== */}
          <AnimatePresence>
            {introComplete && (
              <motion.div
                className="header-right"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                {/* Points */}
                <motion.div className="header-stat" initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }} title="Your Points">
                  <FiZap size={15} className="stat-icon points-icon" />
                  <span className="stat-value">{Number(user?.points || 0)}</span>
                </motion.div>

                {/* Stars */}
                <motion.div className="header-stat" initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} title="Your Rating">
                  <FiStar size={15} className="stat-icon stars-icon" />
                  <span className="stat-value">{Number(user?.stars || 0).toFixed(1)}</span>
                </motion.div>

                {/* Cart */}
                <motion.div className="header-btn-wrapper" initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                  <button className="header-btn" onClick={() => { closeAllDropdowns('cart'); setShowCart(!showCart); }} title="Cart">
                    <FiShoppingCart size={19} />
                    {cartCount > 0 && (
                      <motion.span className="badge cart-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} key={cartCount}>
                        {cartCount > 99 ? '99+' : cartCount}
                      </motion.span>
                    )}
                  </button>
                  <AnimatePresence>
                    {showCart && <CartDropdown onClose={() => setShowCart(false)} />}
                  </AnimatePresence>
                </motion.div>

                {/* Notifications */}
                <motion.div className="header-btn-wrapper" initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                  <button className="header-btn" onClick={() => { closeAllDropdowns('notifications'); setShowNotifications(!showNotifications); }} title="Notifications">
                    <FiBell size={19} />
                    {unreadCount > 0 && (
                      <motion.span className="badge notification-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} key={unreadCount}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </motion.span>
                    )}
                  </button>
                  <AnimatePresence>
                    {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
                  </AnimatePresence>
                </motion.div>

                {/* Profile */}
                <motion.div className="header-btn-wrapper" initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
                  <button className="header-btn profile-btn" onClick={() => { closeAllDropdowns('profile'); setShowProfile(!showProfile); }} title="Profile">
                    {isAuthenticated && user?.profile_image ? (
                      <img src={getImageUrl(user.profile_image)} alt="Profile" className="profile-avatar-small" />
                    ) : (
                      <FiUser size={19} />
                    )}
                  </button>
                  <AnimatePresence>
                    {showProfile && (
                      <ProfileDropdown
                        onClose={() => setShowProfile(false)}
                        onOpenModal={handleOpenModal}
                        onRequireLogin={handleRequireLogin}
                        onRequireRegister={handleRequireRegister}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.header>

      {/* ====== MODALS ====== */}
      {activeModal === 'myProfile' && (
        <Modal isOpen={true} onClose={handleCloseModal} title="My Profile" size="medium">
          <MyProfile onClose={handleCloseModal} />
        </Modal>
      )}
      {activeModal === 'switchAccount' && (
        <Modal isOpen={true} onClose={handleCloseModal} title="Switch Account" size="small">
          <SwitchAccount onClose={handleCloseModal} />
        </Modal>
      )}
      {activeModal === 'createCompany' && (
        <Modal isOpen={true} onClose={handleCloseModal} title="Create Company" size="large">
          <CreateCompany onClose={handleCloseModal} />
        </Modal>
      )}
      {activeModal === 'appearance' && (
        <Modal isOpen={true} onClose={handleCloseModal} title="Appearance" size="small">
          <AppearanceSettings onClose={handleCloseModal} />
        </Modal>
      )}
      {activeModal === 'backgroundTheme' && (
        <Modal isOpen={true} onClose={handleCloseModal} title="Background Theme" size="medium">
          <BackgroundTheme onClose={handleCloseModal} />
        </Modal>
      )}
      {activeModal === 'settings' && (
        <Modal isOpen={true} onClose={handleCloseModal} title="Settings" size="medium">
          <Settings onClose={handleCloseModal} />
        </Modal>
      )}

      {showLogin && (
        <LoginModal
          isOpen={true}
          onClose={() => setShowLogin(false)}
          onSwitchToRegister={() => { setShowLogin(false); setShowRegister(true); }}
        />
      )}
      {showRegister && (
        <RegisterModal
          isOpen={true}
          onClose={() => setShowRegister(false)}
          onSwitchToLogin={() => { setShowRegister(false); setShowLogin(true); }}
        />
      )}
    </>
  );
};

export default Header;