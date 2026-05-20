import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { CompanyContext } from '../../context/CompanyContext';
import CompanySwitcher from './CompanySwitcher';
import AddProductModal from './AddProductModal';
import EditProductModal from './EditProductModal';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlus, FiEdit2, FiTrash2, FiPackage, FiBell,
  FiUsers, FiShoppingCart, FiStar, FiSettings,
  FiChevronRight, FiRefreshCw, FiBriefcase, FiClock, FiXCircle, FiAlertCircle, FiSend
} from 'react-icons/fi';
import { Package, ShoppingCart, Star, Bell, Banknote, Target, Handshake, MessageSquare, User, Wallet } from 'lucide-react';
import './CompanyDashboard.css';
import { connectSocket } from '../../services/socketService';
import api from '../../services/api';
import { getImageUrl } from '../../utils/helpers';

const CompanyDashboard = ({ onRequireAuth }) => {
  const { isAuthenticated } = useContext(AuthContext);
  const {
    myCompanies, activeCompany, dashboardData, loading, fetchedOnce,
    companyNotifications, unreadCount,
    fetchMyCompanies, switchCompany, fetchCompanyDashboard,
    fetchCompanyNotifications, markNotificationRead, deleteProduct,
    updateCompany, deleteCompany, deletePromoBanner, getBranchOptionsForOrder, assignOrderToBranch
  } = useContext(CompanyContext);

  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [activeTab, setActiveTab] = useState('products');
  const [lastCompanyId, setLastCompanyId] = useState(null);
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [coverPhotoFile, setCoverPhotoFile] = useState(null);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverUploadMsg, setCoverUploadMsg] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadMsg, setLogoUploadMsg] = useState('');
  const [editInfo, setEditInfo] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaveMsg, setInfoSaveMsg] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerMsg, setBannerMsg] = useState('');
  const [orderActionMsg, setOrderActionMsg] = useState('');
  const [assigningOrderNumber, setAssigningOrderNumber] = useState('');
  const [branchPickerOrderNumber, setBranchPickerOrderNumber] = useState('');
  const [branchOptions, setBranchOptions] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [negRules, setNegRules] = useState([]);
  const [negRulesMsg, setNegRulesMsg] = useState('');
  const [savingNegRules, setSavingNegRules] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchMyCompanies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Poll every 10s while any company is still pending so UI updates without manual refresh.
  // Stops automatically once all companies are approved/rejected.
  useEffect(() => {
    const hasPending = myCompanies.some(c => c.verification_status === 'pending');
    if (!isAuthenticated || !hasPending) return;
    const interval = setInterval(() => { fetchMyCompanies(); }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, myCompanies]);

  useEffect(() => {
    if (activeCompany) {
      if (activeCompany.id !== lastCompanyId) {
        setActiveTab('products');
        setLastCompanyId(activeCompany.id);
      }
      // Only load dashboard data for approved companies
      if (activeCompany.verification_status === 'approved') {
        fetchCompanyDashboard(activeCompany.id);
        fetchCompanyNotifications(activeCompany.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, activeCompany?.verification_status]);

  useEffect(() => {
    if (!activeCompany?.id || activeCompany.verification_status !== 'approved') return;
    const interval = setInterval(() => {
      fetchCompanyDashboard(activeCompany.id, { silent: true });
      fetchCompanyNotifications(activeCompany.id);
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, activeCompany?.verification_status]);

  useEffect(() => {
    if (!isAuthenticated || !activeCompany?.id || activeCompany.verification_status !== 'approved') return;

    const socket = connectSocket();
    if (!socket) return;

    socket.emit('subscribe:company', activeCompany.id);

    const onDashboardRefresh = (payload) => {
      if (Number(payload?.companyId) !== Number(activeCompany.id)) return;
      fetchCompanyDashboard(activeCompany.id);
      fetchCompanyNotifications(activeCompany.id);
    };

    socket.on('company:dashboard:refresh', onDashboardRefresh);
    return () => {
      socket.off('company:dashboard:refresh', onDashboardRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeCompany?.id, activeCompany?.verification_status]);

  useEffect(() => {
    if (activeCompany) {
      setEditInfo({
        company_name: activeCompany.company_name || '',
        description: activeCompany.description || '',
        contact_email: activeCompany.contact_email || '',
        contact_phone: activeCompany.contact_phone || '',
        address: activeCompany.address || '',
        city: activeCompany.city || '',
        country: activeCompany.country || '',
      });
      setInfoSaveMsg('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!activeCompany?.id || activeCompany.verification_status !== 'approved') return;
    api.get('/negotiations/seller/rules')
      .then(res => { if (res.data.success) setNegRules(res.data.rules); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id]);

  const handleSaveNegRules = async () => {
    setSavingNegRules(true);
    setNegRulesMsg('');
    try {
      const res = await api.post('/negotiations/seller/rules', { rules: negRules });
      setNegRulesMsg(res.data.success ? '✓ Rules saved successfully' : (res.data.message || 'Failed'));
    } catch (e) {
      setNegRulesMsg(e.response?.data?.message || 'Failed to save rules');
    } finally {
      setSavingNegRules(false);
    }
  };

  const handleAddNegRule = () => {
    setNegRules(prev => [...prev, { min_orders: 1, max_orders: null, discount_percent: 5 }]);
  };

  const handleRemoveNegRule = (idx) => {
    setNegRules(prev => prev.filter((_, i) => i !== idx));
  };

  const handleNegRuleChange = (idx, field, value) => {
    setNegRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleDeleteProduct = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      const result = await deleteProduct(productId);
      if (result.success) {
        // Dashboard will auto-refresh
      }
    }
  };

  const handleCoverPhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverPhotoFile(file);
    setCoverPhotoPreview(URL.createObjectURL(file));
    setCoverUploadMsg('');
  };

  const handleCoverPhotoUpload = async () => {
    if (!coverPhotoFile || !activeCompany) return;
    setUploadingCover(true);
    setCoverUploadMsg('');
    const formData = new FormData();
    formData.append('company_id', activeCompany.id);
    formData.append('cover_image', coverPhotoFile);
    const result = await updateCompany(formData);
    setUploadingCover(false);
    if (result.success) {
      setCoverUploadMsg('Cover photo updated!');
      setCoverPhotoFile(null);
      setCoverPhotoPreview(null);
    } else {
      setCoverUploadMsg(result.message || 'Upload failed');
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploadMsg('');
  };

  const handleLogoUpload = async () => {
    if (!logoFile || !activeCompany) return;
    setUploadingLogo(true);
    setLogoUploadMsg('');
    const formData = new FormData();
    formData.append('company_id', activeCompany.id);
    formData.append('company_logo', logoFile);
    const result = await updateCompany(formData);
    setUploadingLogo(false);
    if (result.success) {
      setLogoUploadMsg('Company logo updated!');
      setLogoFile(null);
      setLogoPreview(null);
    } else {
      setLogoUploadMsg(result.message || 'Upload failed');
    }
  };

  const handleBannerChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setBannerMsg('');
  };

  const handleBannerUpload = async () => {
    if (!bannerFile || !activeCompany) return;
    setUploadingBanner(true);
    setBannerMsg('');
    const formData = new FormData();
    formData.append('company_id', activeCompany.id);
    formData.append('promo_banner', bannerFile);
    const result = await updateCompany(formData);
    setUploadingBanner(false);
    if (result.success) {
      setBannerMsg('Promotional banner updated!');
      setBannerFile(null);
      setBannerPreview(null);
    } else {
      setBannerMsg(result.message || 'Upload failed');
    }
  };

  const handleDeleteBanner = async () => {
    if (!activeCompany) return;
    if (!window.confirm('Remove the promotional banner?')) return;
    setUploadingBanner(true);
    setBannerMsg('');
    const result = await deletePromoBanner(activeCompany.id);
    setUploadingBanner(false);
    if (result.success) {
      setBannerMsg('Banner removed.');
    } else {
      setBannerMsg(result.message || 'Failed to remove banner');
    }
  };

  const handleDeleteCompany = async () => {
    if (!activeCompany) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${activeCompany.company_name}"? This action cannot be undone.`
    );
    if (!confirmed) return;
    const result = await deleteCompany(activeCompany.id);
    if (!result.success) {
      alert(result.message || 'Failed to delete company');
    }
  };

  const handleOpenBranchPicker = async (orderNumber) => {
    if (!activeCompany?.id || !orderNumber) return;
    setOrderActionMsg('');
    setAssigningOrderNumber(orderNumber);
    const result = await getBranchOptionsForOrder(activeCompany.id, orderNumber);
    if (result.success) {
      const options = result.data || [];
      setBranchOptions(options);
      setSelectedBranchId(options.length > 0 ? String(options[0].id) : '');
      setBranchPickerOrderNumber(orderNumber);
    } else {
      setOrderActionMsg(result.message || 'Failed to load branch list');
    }
    setAssigningOrderNumber('');
  };

  const handleAssignOrderToBranch = async (orderNumber) => {
    if (!activeCompany?.id || !orderNumber || !selectedBranchId) return;
    setAssigningOrderNumber(orderNumber);
    setOrderActionMsg('');
    const result = await assignOrderToBranch(activeCompany.id, orderNumber, Number(selectedBranchId));
    if (result.success) {
      setOrderActionMsg(result.message || 'Order assigned to selected branch');
      setBranchPickerOrderNumber('');
      setBranchOptions([]);
      setSelectedBranchId('');
    } else {
      setOrderActionMsg(result.message || 'Failed to assign order');
    }
    setAssigningOrderNumber('');
  };

  const handleInfoSave = async () => {
    if (!activeCompany) return;
    const { company_name, description, contact_email, contact_phone, address, city, country } = editInfo;
    if (!company_name.trim() || !description.trim() || !contact_email.trim() ||
        !contact_phone.trim() || !address.trim() || !city.trim() || !country.trim()) {
      setInfoSaveMsg('All fields are required');
      return;
    }
    if (!activeCompany.cover_image && !coverPhotoFile) {
      setInfoSaveMsg('Cover photo is required. Please upload a cover photo first.');
      return;
    }
    if (!activeCompany.company_logo && !logoFile) {
      setInfoSaveMsg('Company logo is required. Please upload a logo first.');
      return;
    }
    setSavingInfo(true);
    setInfoSaveMsg('');
    const formData = new FormData();
    formData.append('company_id', activeCompany.id);
    Object.entries(editInfo).forEach(([k, v]) => formData.append(k, v));
    const result = await updateCompany(formData);
    setSavingInfo(false);
    if (result.success) {
      setInfoSaveMsg('Company info saved!');
    } else {
      setInfoSaveMsg(result.message || 'Save failed');
    }
  };

  const handleNotificationClick = (notif) => {
    markNotificationRead(activeCompany.id, notif.id);
    setShowNotifications(false);
    if (notif.reference_type === 'product' && notif.reference_id) {
      setActiveTab('products');
      setHighlightedProductId(notif.reference_id);
      // Expand all categories so the product is visible
      const allExpanded = {};
      dashboardData?.productsByCategory?.forEach(cat => {
        allExpanded[cat.category_name] = true;
      });
      setExpandedCategories(allExpanded);
      setTimeout(() => {
        const el = document.getElementById(`product-card-${notif.reference_id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }
  };

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  const getCategoryIcon = (icon) => {
    const icons = {
      laptop: '💻', shirt: '👕', home: '🏠', book: '📚',
      dumbbell: '🏋️', sparkles: '✨', gamepad: '🎮',
      car: '🚗', heart: '❤️', couch: '🛋️'
    };
    return icons[icon] || '📦';
  };

  if (!isAuthenticated) {
    return (
      <div className="cd-empty">
        <FiBriefcase size={48} />
        <h2>Company Dashboard</h2>
        <p>Please login to access your company dashboard</p>
        <button className="cd-login-btn" onClick={onRequireAuth}>Login</button>
      </div>
    );
  }

  // Still waiting for the first fetch to complete — don't show empty state prematurely
  if (!fetchedOnce || (loading && myCompanies.length === 0)) {
    return (
      <div className="cd-loading">
        <div className="cd-spinner"></div>
        <p>Loading your companies...</p>
      </div>
    );
  }

  // No companies yet - show create option
  if (!loading && myCompanies.length === 0) {
    return (
      <div className="cd-empty">
        <FiBriefcase size={48} />
        <h2>No Companies Yet</h2>
        <p>Create your first company to start selling products</p>
        <p className="cd-hint">You can create a company from your Profile → Create Company</p>
        <button
          className="cd-status-refresh-btn"
          style={{ marginTop: '16px' }}
          onClick={() => fetchMyCompanies()}
        >
          <FiRefreshCw size={15} /> Refresh
        </button>
      </div>
    );
  }

  // First load – no active company yet
  if (!activeCompany && myCompanies.length > 0) {
    return (
      <div className="cd-loading">
        <div className="cd-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // ── Approval gate ─────────────────────────────────────────────
  if (activeCompany && activeCompany.verification_status === 'pending') {
    return (
      <div className="cd-status-screen cd-status-screen--pending">
        <div className="cd-status-icon"><FiClock size={52} /></div>
        <h2>Application Under Review</h2>
        <p>
          Your company <strong>"{activeCompany.company_name}"</strong> has been submitted
          and is currently being reviewed by our staff team.
        </p>
        <p className="cd-status-sub">You will be notified once the review is complete. This usually takes 1–2 business days.</p>
        <button
          className="cd-status-refresh-btn"
          onClick={() => fetchMyCompanies()}
        >
          <FiRefreshCw size={15} /> Check Approval Status
        </button>
        <div className="cd-status-badge cd-status-badge--pending">Pending Review</div>
      </div>
    );
  }

  if (activeCompany && activeCompany.verification_status === 'rejected') {
    return (
      <div className="cd-status-screen cd-status-screen--rejected">
        <div className="cd-status-icon"><FiXCircle size={52} /></div>
        <h2>Application Rejected</h2>
        <p>
          Your company application for <strong>"{activeCompany.company_name}"</strong> was not approved.
        </p>
        {activeCompany.rejection_reason && (
          <div className="cd-status-reason">
            <FiAlertCircle size={16} />
            <span><strong>Reason:</strong> {activeCompany.rejection_reason}</span>
          </div>
        )}
        <p className="cd-status-sub">Please contact support or submit a new application addressing the issues mentioned above.</p>
        <div className="cd-status-badge cd-status-badge--rejected">Rejected</div>
      </div>
    );
  }
  // ─────────────────────────────────────────────────────────────

  if (loading && !dashboardData) {
    return (
      <div className="cd-loading">
        <div className="cd-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="company-dashboard">
      {/* Dashboard Header */}
      <div className="cd-header">
        <div className="cd-header__left">
          <div className="cd-header__company" onClick={() => setShowSwitcher(true)}>
            <img
              src={activeCompany?.company_logo ? getImageUrl(activeCompany.company_logo) : '/assets/images/default-company.svg'}
              alt={activeCompany?.company_name}
              className="cd-header__logo"
              onError={(e) => { e.target.src = '/assets/images/default-company.svg'; }}
            />
            <div className="cd-header__info">
              <h1>
                {activeCompany?.company_name}
                {activeCompany?.company_rank && (
                  <span className="cd-rank-circle">
                    #{activeCompany.company_rank}
                  </span>
                )}
              </h1>
              <span className="cd-header__switch">
                {myCompanies.length > 1 ? 'Click to switch company ▾' : activeCompany?.category || 'Dashboard'}
              </span>
            </div>
          </div>
        </div>

        <div className="cd-header__right">
          <div className="cd-header__stats">
            <div className="cd-stat">
              <FiPackage size={16} />
              <span>{dashboardData?.totalProducts || 0}</span>
              <label>Products</label>
            </div>
            <div className="cd-stat">
              <FiShoppingCart size={16} />
              <span>{activeCompany?.total_sales || 0}</span>
              <label>Sales</label>
            </div>
            <div className="cd-stat">
              <FiStar size={16} />
              <span>{parseFloat(activeCompany?.rating || 0).toFixed(1)}</span>
              <label>Rating</label>
            </div>
            <div className="cd-stat">
              <FiUsers size={16} />
              <span>{activeCompany?.follower_count || 0}</span>
              <label>Followers</label>
            </div>
          </div>

          {/* Notification Bell */}
          <div className="cd-notif-wrapper">
            <button
              className="cd-notif-btn"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <FiBell size={20} />
              {unreadCount > 0 && (
                <span className="cd-notif-badge">{unreadCount}</span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  className="cd-notif-dropdown"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <h4>Notifications</h4>
                  {companyNotifications.length === 0 ? (
                    <p className="cd-notif-empty">No notifications</p>
                  ) : (
                    <div className="cd-notif-list">
                      {companyNotifications.slice(0, 10).map(notif => (
                        <div
                          key={notif.id}
                          className={`cd-notif-item ${!notif.is_read ? 'unread' : ''}`}
                          onClick={() => handleNotificationClick(notif)}
                        >
                          <span className="cd-notif-icon">
                            {notif.type === 'new_comment' ? <MessageSquare size={14} /> :
                             notif.type === 'new_order' ? <ShoppingCart size={14} /> :
                             notif.type === 'new_review' ? <Star size={14} fill="currentColor" /> :
                             notif.type === 'new_follower' ? <User size={14} /> :
                             notif.type === 'product_sold' ? <Wallet size={14} /> :
                             notif.reference_type === 'product' ? <Package size={14} /> : <Bell size={14} />}
                          </span>
                          <div className="cd-notif-content">
                            <p className="cd-notif-title">{notif.title}</p>
                            <p className="cd-notif-msg" title={notif.message}>{notif.message}</p>
                            <span className="cd-notif-time">
                              {new Date(notif.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            className="cd-refresh-btn"
            onClick={() => fetchCompanyDashboard(activeCompany.id)}
            title="Refresh"
          >
            <FiRefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="cd-tabs">
        <button
          className={`cd-tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <FiPackage size={16} /> Products
        </button>
        <button
          className={`cd-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <FiShoppingCart size={16} /> Recent Orders
        </button>
        <button
          className={`cd-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <FiSettings size={16} /> Settings
        </button>
        <button
          className={`cd-tab ${activeTab === 'negotiation' ? 'active' : ''}`}
          onClick={() => setActiveTab('negotiation')}
        >
          <Handshake size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Negotiation Rules
        </button>
      </div>

      {/* Tab Content */}
      <div className="cd-content">
        {activeTab === 'products' && (
          <div className="cd-products">
            <div className="cd-products__header">
              <h2><Package size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Products by Category</h2>
              <button
                className="cd-add-product-btn"
                onClick={() => setShowAddProduct(true)}
              >
                <FiPlus size={18} /> Add Product
              </button>
            </div>

            {!dashboardData?.productsByCategory || dashboardData.productsByCategory.length === 0 ? (
              <div className="cd-products__empty">
                <FiPackage size={40} />
                <h3>No Products Yet</h3>
                <p>Add your first product to start selling</p>
                <button
                  className="cd-add-product-btn"
                  onClick={() => setShowAddProduct(true)}
                >
                  <FiPlus size={16} /> Add First Product
                </button>
              </div>
            ) : (
              <div className="cd-categories">
                {dashboardData.productsByCategory.map((cat, idx) => (
                  <div key={idx} className="cd-category">
                    <div
                      className="cd-category__header"
                      onClick={() => toggleCategory(cat.category_name)}
                    >
                      <div className="cd-category__left">
                        <span className="cd-category__icon">
                          {getCategoryIcon(cat.category_icon)}
                        </span>
                        <h3>{cat.category_name}</h3>
                        <span className="cd-category__count">
                          ({cat.products.length} product{cat.products.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: expandedCategories[cat.category_name] ? 90 : 0 }}
                      >
                        <FiChevronRight size={20} />
                      </motion.div>
                    </div>

                    <AnimatePresence>
                      {expandedCategories[cat.category_name] && (
                        <motion.div
                          className="cd-category__products"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="cd-product-grid">
                            {cat.products.map(product => (
                              <div
                                key={product.id}
                                id={`product-card-${product.id}`}
                                className={`cd-product-card${highlightedProductId === product.id ? ' cd-product-card--highlighted' : ''}`}
                                onAnimationEnd={() => setHighlightedProductId(null)}
                              >
                                <div className="cd-product-card__image">
                                  <img
                                    src={getImageUrl(product.image_url)}
                                    alt={product.name}
                                    onError={(e) => { e.target.src = '/placeholder.png'; }}
                                  />
                                  {product.discount_percentage > 0 && (
                                    <span className="cd-product-discount">
                                      -{product.discount_percentage}%
                                    </span>
                                  )}
                                  <div className="cd-product-card__status">
                                    <span className={product.is_in_stock ? 'in-stock' : 'out-stock'}>
                                      {product.is_in_stock ? 'In Stock' : 'Out of Stock'}
                                    </span>
                                  </div>
                                </div>

                                <div className="cd-product-card__info">
                                  <h4>{product.name}</h4>
                                  <div className="cd-product-card__prices">
                                    <span className="cd-price-max">৳{parseFloat(product.max_price || product.current_price).toFixed(2)}</span>
                                    <span className="cd-price-min">Min: ৳{parseFloat(product.min_price || 0).toFixed(2)}</span>
                                    <span className="cd-price-current">Display: ৳{parseFloat(product.current_price).toFixed(2)}</span>
                                  </div>
                                  {product.promo_code && (
                                    <span className="cd-product-promo">🎫 {product.promo_code}</span>
                                  )}
                                  <div className="cd-product-card__meta">
                                    {!(product.is_in_stock === false && Number(product.stock_quantity || 0) === 0) && (
                                      <span><Package size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{product.stock_quantity || 0} qty</span>
                                    )}
                                    {!(product.is_in_stock === false && Number(product.total_sold || 0) === 0) && (
                                      <span><ShoppingCart size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{product.total_sold || 0} sold</span>
                                    )}
                                    <span><Star size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{parseFloat(product.rating || 0).toFixed(1)}</span>
                                    {product.request_count > 0 && (
                                      <span className="cd-product-requests" title="Customers waiting for restock">
                                        <Bell size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{product.request_count} waiting
                                      </span>
                                    )}
                                  </div>
                                  <div className="cd-product-badge">
                                    <span className="cd-rank-circle">
                                      #{activeCompany?.company_rank || '—'}
                                    </span>
                                  </div>
                                </div>

                                <div className="cd-product-card__actions">
                                  <button
                                    className="cd-edit-btn"
                                    onClick={() => setEditingProduct(product)}
                                    title="Edit"
                                  >
                                    <FiEdit2 size={14} /> Edit
                                  </button>
                                  <button
                                    className="cd-delete-btn"
                                    onClick={() => handleDeleteProduct(product.id)}
                                    title="Delete"
                                  >
                                    <FiTrash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="cd-orders">
            <h2><ShoppingCart size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Recent Orders</h2>
            {orderActionMsg && <p className="cd-cover-msg">{orderActionMsg}</p>}
            {!dashboardData?.recentOrders || dashboardData.recentOrders.length === 0 ? (
              <div className="cd-orders__empty">
                <FiShoppingCart size={40} />
                <p>No orders yet</p>
              </div>
            ) : (
              <div className="cd-orders__list">
                {dashboardData.recentOrders.map((order, idx) => (
                  <div key={idx} className="cd-order-item">
                    <div className="cd-order-item__info">
                      <span className="cd-order-number">#{order.order_number}</span>
                      <span className="cd-order-product">{order.product_name}</span>
                      <span className="cd-order-customer">by {order.customer_name}</span>
                    </div>
                    <div className="cd-order-item__right">
                      <span className={`cd-order-status ${order.order_status}`}>
                        {order.delivery_status_text || order.order_status}
                      </span>
                      {order.payment_method === 'cash_on_delivery' && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 5px' }}>
                            <Banknote size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />COD
                          </span>
                          {order.payment_status === 'paid' ? (
                            <span style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', padding: '1px 5px' }}>Fully Paid</span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 5px' }}>
                              Del: ৳{Number(order.delivery_charge||0).toFixed(0)} paid · ৳{(Number(order.total_amount||0) - Number(order.delivery_charge||0)).toFixed(0)} due
                            </span>
                          )}
                        </div>
                      )}
                      <span className="cd-order-date">
                        {new Date(order.order_date).toLocaleDateString()}
                      </span>
                      {['pending', 'processing'].includes(order.order_status) && !order.assigned_branch_name && (
                        <>
                          <button
                            type="button"
                            className="cd-add-btn"
                            disabled={assigningOrderNumber === order.order_number}
                            onClick={() => handleOpenBranchPicker(order.order_number)}
                            style={{ marginTop: 8 }}
                          >
                            <FiSend size={14} /> {assigningOrderNumber === order.order_number ? 'Loading Branches...' : 'Assign to Branch'}
                          </button>
                          {branchPickerOrderNumber === order.order_number && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <select
                                value={selectedBranchId}
                                onChange={(e) => setSelectedBranchId(e.target.value)}
                                style={{ minWidth: 220 }}
                              >
                                {branchOptions.map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name} ({branch.address || 'No address'})
                                    {Number(branch.usage_count || 0) > 0 ? ` - Used ${branch.usage_count}x` : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="cd-add-btn"
                                disabled={!selectedBranchId || assigningOrderNumber === order.order_number}
                                onClick={() => handleAssignOrderToBranch(order.order_number)}
                              >
                                <FiSend size={14} /> {assigningOrderNumber === order.order_number ? 'Assigning...' : 'Confirm Branch'}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="cd-settings">
            <h2>⚙️ Company Settings</h2>

            {/* Cover Photo Upload */}
            <div className={`cd-settings__cover-section${!activeCompany?.cover_image && !coverPhotoFile ? ' cd-settings__required-missing' : ''}`}>
              <h3>🖼️ Cover Photo <span className="cd-required-badge">* Required</span></h3>
              <div className="cd-settings__cover-preview">
                {coverPhotoPreview ? (
                  <img src={coverPhotoPreview} alt="Cover preview" className="cd-cover-preview-img" />
                ) : activeCompany?.cover_image ? (
                  <img src={getImageUrl(activeCompany.cover_image)} alt="Current cover" className="cd-cover-preview-img" />
                ) : (
                  <div className="cd-cover-placeholder cd-cover-placeholder--required">No cover photo set — required</div>
                )}
              </div>
              <div className="cd-settings__cover-actions">
                <label className="cd-cover-upload-label">
                  📷 Choose Photo
                  <input type="file" accept="image/*" onChange={handleCoverPhotoChange} style={{ display: 'none' }} />
                </label>
                {coverPhotoFile && (
                  <button
                    className="cd-cover-save-btn"
                    onClick={handleCoverPhotoUpload}
                    disabled={uploadingCover}
                  >
                    {uploadingCover ? 'Uploading...' : 'Save Cover Photo'}
                  </button>
                )}
              </div>
              {coverUploadMsg && (
                <p className={`cd-cover-msg ${coverUploadMsg.includes('updated') ? 'success' : 'error'}`}>
                  {coverUploadMsg}
                </p>
              )}
            </div>

            {/* Company Logo Upload */}
            <div className={`cd-settings__cover-section${!activeCompany?.company_logo && !logoFile ? ' cd-settings__required-missing' : ''}`}>
              <h3>🏢 Company Logo <span className="cd-required-badge">* Required</span></h3>
              <div className="cd-settings__cover-preview">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="cd-logo-preview-img" />
                ) : activeCompany?.company_logo ? (
                  <img src={getImageUrl(activeCompany.company_logo)} alt="Current logo" className="cd-logo-preview-img" />
                ) : (
                  <div className="cd-cover-placeholder cd-cover-placeholder--required">No logo set — required</div>
                )}
              </div>
              <div className="cd-settings__cover-actions">
                <label className="cd-cover-upload-label">
                  🖼️ Choose Logo
                  <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                </label>
                {logoFile && (
                  <button
                    className="cd-cover-save-btn"
                    onClick={handleLogoUpload}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? 'Uploading...' : 'Save Logo'}
                  </button>
                )}
              </div>
              {logoUploadMsg && (
                <p className={`cd-cover-msg ${logoUploadMsg.includes('updated') ? 'success' : 'error'}`}>
                  {logoUploadMsg}
                </p>
              )}
            </div>

            {/* Promotional Banner */}
            <div className="cd-settings__cover-section">
              <h3><Target size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Promotional Banner</h3>
              <p className="cd-banner-hint">Upload a flash sale or discount season banner. It will appear on your company page.</p>
              <div className="cd-settings__cover-preview">
                {bannerPreview ? (
                  <img src={bannerPreview} alt="Banner preview" className="cd-banner-preview-img" />
                ) : activeCompany?.promo_banner ? (
                  <img src={getImageUrl(activeCompany.promo_banner)} alt="Current banner" className="cd-banner-preview-img" />
                ) : (
                  <div className="cd-cover-placeholder">No promotional banner set</div>
                )}
              </div>
              <div className="cd-settings__cover-actions">
                <label className="cd-cover-upload-label">
                  🖼️ Choose Banner
                  <input type="file" accept="image/*" onChange={handleBannerChange} style={{ display: 'none' }} />
                </label>
                {bannerFile && (
                  <button className="cd-cover-save-btn" onClick={handleBannerUpload} disabled={uploadingBanner}>
                    {uploadingBanner ? 'Uploading...' : 'Save Banner'}
                  </button>
                )}
                {!bannerFile && activeCompany?.promo_banner && (
                  <button className="cd-delete-banner-btn" onClick={handleDeleteBanner} disabled={uploadingBanner}>
                    🗑️ Remove Banner
                  </button>
                )}
              </div>
              {bannerMsg && (
                <p className={`cd-cover-msg ${bannerMsg.includes('updated') || bannerMsg.includes('removed') ? 'success' : 'error'}`}>
                  {bannerMsg}
                </p>
              )}
            </div>

            <div className="cd-settings__info">
              <h3>✏️ Company Information</h3>
              <div className="cd-settings__edit-grid">
                <div className="cd-settings__field">
                  <label>Company Name * <span className="cd-char-hint">({(editInfo.company_name || '').length}/20)</span></label>
                  <input
                    className="cd-settings__input"
                    value={editInfo.company_name || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, company_name: e.target.value }))}
                    placeholder="Company name"
                    maxLength={20}
                  />
                </div>
                <div className="cd-settings__field">
                  <label>Category</label>
                  <p className="cd-settings__readonly">{activeCompany?.category || 'Not set'}</p>
                </div>
                <div className="cd-settings__field">
                  <label>Leaderboard Rank</label>
                  <p className="cd-settings__readonly">
                    <span className="cd-rank-circle" style={{ display: 'inline-flex', marginRight: 6 }}>
                      #{activeCompany?.company_rank || '—'}
                    </span>
                  </p>
                </div>
                <div className="cd-settings__field">
                  <label>Total Revenue</label>
                  <p className="cd-settings__readonly">৳{parseFloat(activeCompany?.total_revenue || 0).toFixed(2)}</p>
                </div>
                <div className="cd-settings__field cd-settings__field--full">
                  <label>Description * <span className="cd-char-hint">({(editInfo.description || '').length}/50)</span></label>
                  <textarea
                    className="cd-settings__input cd-settings__textarea"
                    value={editInfo.description || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Company description"
                    rows={3}
                    maxLength={50}
                  />
                </div>
                <div className="cd-settings__field">
                  <label>Contact Email *</label>
                  <input
                    className="cd-settings__input"
                    type="email"
                    value={editInfo.contact_email || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, contact_email: e.target.value }))}
                    placeholder="company@email.com"
                  />
                </div>
                <div className="cd-settings__field">
                  <label>Contact Phone *</label>
                  <input
                    className="cd-settings__input"
                    value={editInfo.contact_phone || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, contact_phone: e.target.value }))}
                    placeholder="+1 234 567 8900"
                  />
                </div>
                <div className="cd-settings__field">
                  <label>City *</label>
                  <input
                    className="cd-settings__input"
                    value={editInfo.city || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="City"
                  />
                </div>
                <div className="cd-settings__field">
                  <label>Country *</label>
                  <input
                    className="cd-settings__input"
                    value={editInfo.country || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="Country"
                  />
                </div>
                <div className="cd-settings__field cd-settings__field--full">
                  <label>Address *</label>
                  <input
                    className="cd-settings__input"
                    value={editInfo.address || ''}
                    onChange={e => setEditInfo(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Street address"
                  />
                </div>
              </div>
              <div className="cd-settings__save-row">
                <button
                  className="cd-cover-save-btn"
                  onClick={handleInfoSave}
                  disabled={savingInfo}
                >
                  {savingInfo ? 'Saving...' : '💾 Save Changes'}
                </button>
                {infoSaveMsg && (
                  <p className={`cd-cover-msg ${infoSaveMsg.includes('saved') ? 'success' : 'error'}`}>
                    {infoSaveMsg}
                  </p>
                )}
              </div>
            </div>

            {/* Delete Company */}
            <div className="cd-settings__danger-zone">
              <p>Deleting your company is permanent and cannot be undone. All products and data will be removed.</p>
              <button className="cd-delete-company-btn" onClick={handleDeleteCompany}>
                🗑️ Delete Company
              </button>
            </div>
          </div>
        )}

        {activeTab === 'negotiation' && (
          <div className="cd-neg-rules">
            <h2><Handshake size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />AI Negotiation Rules</h2>
            <p className="cd-neg-rules__desc">
              Define loyalty discount tiers for customers who have previously purchased from your company.
              The AI will automatically apply the matching rule during price negotiation.
              If no rules are set, system defaults (3% / 7% / 12%) are used.
            </p>

            <div className="cd-neg-rules__table">
              <div className="cd-neg-rules__header">
                <span>Min Orders</span>
                <span>Max Orders (blank = unlimited)</span>
                <span>Discount %</span>
                <span></span>
              </div>
              {negRules.map((rule, idx) => (
                <div className="cd-neg-rules__row" key={idx}>
                  <input
                    type="number" min="0" className="cd-neg-rules__input"
                    value={rule.min_orders}
                    onChange={e => handleNegRuleChange(idx, 'min_orders', parseInt(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <input
                    type="number" min="0" className="cd-neg-rules__input"
                    value={rule.max_orders === null || rule.max_orders === undefined ? '' : rule.max_orders}
                    onChange={e => handleNegRuleChange(idx, 'max_orders', e.target.value === '' ? null : parseInt(e.target.value) || null)}
                    placeholder="unlimited"
                  />
                  <input
                    type="number" min="0" max="100" step="0.5" className="cd-neg-rules__input"
                    value={rule.discount_percent}
                    onChange={e => handleNegRuleChange(idx, 'discount_percent', parseFloat(e.target.value) || 0)}
                    placeholder="5"
                  />
                  <button className="cd-neg-rules__remove" onClick={() => handleRemoveNegRule(idx)}>✕</button>
                </div>
              ))}
            </div>

            <div className="cd-neg-rules__actions">
              <button className="cd-neg-rules__add-btn" onClick={handleAddNegRule}>+ Add Tier</button>
              <button className="cd-cover-save-btn" onClick={handleSaveNegRules} disabled={savingNegRules}>
                {savingNegRules ? 'Saving...' : '💾 Save Rules'}
              </button>
            </div>
            {negRulesMsg && (
              <p className={`cd-cover-msg ${negRulesMsg.startsWith('✓') ? 'success' : 'error'}`}>{negRulesMsg}</p>
            )}
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <AddProductModal
          companyId={activeCompany.id}
          categories={dashboardData?.categories || []}
          onClose={() => setShowAddProduct(false)}
          onProductAdded={() => {
            setShowAddProduct(false);
            fetchCompanyDashboard(activeCompany.id);
          }}
        />
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          companyId={activeCompany.id}
          categories={dashboardData?.categories || []}
          onClose={() => setEditingProduct(null)}
          onProductUpdated={() => {
            setEditingProduct(null);
            fetchCompanyDashboard(activeCompany.id);
          }}
        />
      )}

      {/* Company Switcher Overlay */}
      <AnimatePresence>
        {showSwitcher && (
          <motion.div
            className="cd-switcher-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSwitcher(false)}
          >
            <motion.div
              className="cd-switcher-modal"
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cd-switcher-modal__header">
                <h2>🏢 Switch Company</h2>
                <button className="cd-switcher-close" onClick={() => setShowSwitcher(false)}>✕</button>
              </div>
              <CompanySwitcher
                companies={myCompanies}
                activeCompany={activeCompany}
                onSelect={(company) => {
                  switchCompany(company);
                  setShowSwitcher(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompanyDashboard;