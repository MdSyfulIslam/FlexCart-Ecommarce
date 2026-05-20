import React, { useState, useContext, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import CategoryBar from './CategoryBar';
import AnimatedBackground from '../appearance/AnimatedBackground';
import Home from '../home/Home';
import OrderHistory from '../order/OrderHistory';
import RequestProduct from '../request/RequestProduct';
import FavouriteProduct from '../favourite/FavouriteProduct';
import FollowingCompanies from '../company/FollowingCompanies';
import CompanyDashboard from '../company/CompanyDashboard';
import CompanyLeaderboard from '../company/CompanyLeaderboard';
import SpinReward from '../spin/SpinReward';
import ReviewGraph from '../review/ReviewGraph';
import SupportHelp from '../support/SupportHelp';
import Feedback from '../feedback/Feedback';
import LoginModal from '../auth/LoginModal';
import RegisterModal from '../auth/RegisterModal';
import CompanyProfile from '../company/CompanyProfile';
import Modal from '../common/Modal';
import { ThemeContext } from '../../context/ThemeContext';
import { NavigationContext } from '../../context/NavigationContext';
import { motion, AnimatePresence } from 'framer-motion';
import './MainLayout.css';

const MainLayout = () => {
  const { backgroundImage } = useContext(ThemeContext);
  const {
    activeSection,
    activeCategory,
    setActiveCategory,
    activeSort,
    setActiveSort,
    setFilters,
    filters,
    navigateTo
  } = useContext(NavigationContext);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [sharedCompanyId, setSharedCompanyId] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Open company from shared link (?openCompany=id)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get('openCompany');
    if (companyId) {
      setSharedCompanyId(companyId);
      // Clean the URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleRequireAuth = () => {
    setShowLoginModal(true);
  };

  const renderSection = () => {
    const props = { onRequireAuth: handleRequireAuth };

    switch (activeSection) {
      case 'home':
        return <Home category={activeCategory} sort={activeSort} filters={filters} onRequireAuth={handleRequireAuth} showRecommendations={showRecommendations} />;
      case 'order-history':
        return <OrderHistory {...props} />;
      case 'request-product':
        return <RequestProduct {...props} />;
      case 'favourite-product':
        return <FavouriteProduct {...props} />;
      case 'following-companies':
        return <FollowingCompanies {...props} />;
      case 'company-dashboard':
        return <CompanyDashboard {...props} />;
      case 'company-leaderboard':
        return <CompanyLeaderboard {...props} />;
      case 'spin-reward':
        return <SpinReward {...props} />;
      case 'review-graph':
        return <ReviewGraph {...props} />;
      case 'support-help':
        return <SupportHelp />;
      case 'feedback':
        return <Feedback {...props} />;
      default:
        return <Home category={activeCategory} sort={activeSort} filters={filters} onRequireAuth={handleRequireAuth} showRecommendations={showRecommendations} />;
    }
  };

  const handleMobileNavChange = (section) => {
    navigateTo(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className={'main-layout' + (backgroundImage ? ' has-bg-layout' : '')}>
      {backgroundImage && <AnimatedBackground theme={backgroundImage} />}

      <Header onMobileMenuToggle={() => setMobileMenuOpen(prev => !prev)} mobileMenuOpen={mobileMenuOpen} />
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleMobileNavChange}
        onRequireAuth={handleRequireAuth}
        isMobileOpen={mobileMenuOpen}
      />

      {activeSection === 'home' && (
        <CategoryBar
          activeCategory={activeCategory}
          activeSort={activeSort}
          onCategoryChange={setActiveCategory}
          onSortChange={setActiveSort}
          onFilterChange={(f) => setFilters(prev => ({ ...prev, ...f }))}
          showRecommendations={showRecommendations}
          onToggleRecommendations={setShowRecommendations}
        />
      )}

      <main className={
        'main-content'
        + (backgroundImage ? ' has-bg' : '')
        + (activeSection !== 'home' ? ' no-category-bar' : '')
      }>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="section-animate-wrapper"
          >
            {renderSection()}
          </motion.div>
        </AnimatePresence>
      </main>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSwitchToRegister={() => {
          setShowLoginModal(false);
          setShowRegisterModal(true);
        }}
      />
      <RegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSwitchToLogin={() => {
          setShowRegisterModal(false);
          setShowLoginModal(true);
        }}
      />

      {/* Shared company link */}
      {sharedCompanyId && (
        <Modal isOpen onClose={() => setSharedCompanyId(null)} size="large" closePosition="left">
          <CompanyProfile
            companyId={sharedCompanyId}
            onClose={() => setSharedCompanyId(null)}
          />
        </Modal>
      )}
    </div>
  );
};

export default MainLayout;