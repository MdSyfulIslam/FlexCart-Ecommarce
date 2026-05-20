import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../../../context/AuthContext';
import adminService from '../../../services/adminService';
import api from '../../../services/api';
import { getImageUrl } from '../../../utils/helpers';
import {
  LayoutDashboard, Shield, Users, DollarSign, TrendingUp, Megaphone,
  ClipboardList, LogOut, Menu, X, Plus, Pencil, Trash2, PauseCircle,
  PlayCircle, Search, RefreshCcw, Save, Printer,
  Lock, Package, Truck, GitBranch, AlertCircle, CheckCircle, XCircle,
  CreditCard, BarChart2, Settings, Sun, Moon, User, Users2, Building2, Eye, EyeOff
} from 'lucide-react';
import './SuperAdminPanel.css';

/* ─── Bar chart ─── */
const BarChart = ({ data, xKey, yKey, color = '#3b82f6', prefix = '' }) => {
  if (!data?.length) return <p className="sp-chart-empty">No data available</p>;
  const max = Math.max(...data.map(d => Number(d[yKey]) || 0), 1);
  return (
    <div className="sp-chart">
      {data.map((item, i) => {
        const pct = Math.round((Number(item[yKey]) / max) * 100);
        return (
          <div key={i} className="sp-chart-col">
            <div className="sp-chart-bar-wrap">
              <div className="sp-chart-bar" style={{ height: `${pct}%`, background: color }} />
            </div>
            <div className="sp-chart-val">{prefix}{Number(item[yKey]||0).toFixed(0)}</div>
            <div className="sp-chart-lbl">{String(item[xKey]).slice(-5)}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── KPI card ─── */
const KPI = ({ label, value, icon: Icon, color }) => (
  <div className="sp-kpi">
    <div className="sp-kpi-icon" style={{ background: color + '20', color }}>
      <Icon size={20} />
    </div>
    <div>
      <div className="sp-kpi-val">{value ?? '—'}</div>
      <div className="sp-kpi-lbl">{label}</div>
    </div>
  </div>
);

/* ─── Status badge ─── */
const Badge = ({ status }) => {
  const map = {
    active:   'sp-badge--green', inactive: 'sp-badge--gray',
    suspended:'sp-badge--red',   pending:  'sp-badge--yellow',
  };
  return <span className={`sp-badge ${map[status] || 'sp-badge--gray'}`}>{status}</span>;
};

const SETTING_META = {
  commission_rate:          { label: 'Commission Rate (%)',                    desc: 'Default commission earned on every product purchase' },
  delivery_inside_dhaka:    { label: 'Delivery Charge – Inside Dhaka (৳)',     desc: 'Base delivery fee for Dhaka district orders' },
  delivery_outside_dhaka:   { label: 'Delivery Charge – Outside Dhaka (৳)',    desc: 'Base delivery fee for orders outside Dhaka' },
  delivery_extra_per_item:  { label: 'Extra Charge per Additional Item (৳)',   desc: 'Added per item beyond the first in an order' },
};

const TABS = [
  { id: 'dashboard', label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'branches',  label: 'Branches',         icon: GitBranch },
  { id: 'staff',     label: 'Staff Admins',    icon: Shield },
  { id: 'all_staff', label: 'All Staff',        icon: Users2 },
  { id: 'users',     label: 'Users',           icon: Users },
  { id: 'settings',  label: 'Earning Settings',icon: DollarSign },
  { id: 'revenue',   label: 'Revenue',         icon: TrendingUp },
  { id: 'ads',       label: 'Ad Promotions',   icon: Megaphone },
  { id: 'audit',     label: 'Audit Log',       icon: ClipboardList },
];

/* ─── Theme hook ─── */
const useAdminTheme = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin_theme') || 'dark');
  const toggle = () => setTheme(t => { const n = t === 'dark' ? 'light' : 'dark'; localStorage.setItem('admin_theme', n); return n; });
  return [theme, toggle];
};

/* ══════════════════════════════════════════════════════════════ */
const SuperAdminPanel = ({ onRequireAuth }) => {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  const [theme, toggleTheme] = useAdminTheme();
  const [tab, setTab]           = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast]       = useState({ msg: '', type: '' });
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [changePwForm, setChangePwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [cpShowOld, setCpShowOld] = useState(false);
  const [cpShowNew, setCpShowNew] = useState(false);
  const profileRef              = useRef();
  const printRef                = useRef();

  useEffect(() => {
    const handler = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* State */
  const [stats, setStats]       = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [staffForm, setStaffForm] = useState({ username:'', email:'', password:'', phone:'', salary:'' });
  const [editingStaff, setEditingStaff] = useState(null);

  const [users, setUsers]       = useState([]);
  const [userSearch, setUserSearch] = useState('');

  const [settings, setSettings] = useState([]);
  const [editValues, setEditValues] = useState({});

  const [revenue, setRevenue]   = useState(null);
  const [revPeriod, setRevPeriod] = useState('monthly');
  const [revFromDate, setRevFromDate] = useState('');
  const [revToDate, setRevToDate] = useState('');
  const [revHistory, setRevHistory] = useState([]);
  const [revHistorySummary, setRevHistorySummary] = useState(null);
  const [revHistoryType, setRevHistoryType] = useState('all');
  const [revHistoryPage, setRevHistoryPage] = useState(1);
  const [revHistoryTotal, setRevHistoryTotal] = useState(0);

  const [categoryCommissions, setCategoryCommissions] = useState([]);
  const [catComEditValues, setCatComEditValues] = useState({});

  const [ads, setAds]           = useState([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adForm, setAdForm]     = useState({ advertiserName:'', bannerUrl:'', linkUrl:'', feeAmount:'', startDate:'', endDate:'' });
  const [adFile, setAdFile]     = useState(null);
  const [editingAd, setEditingAd] = useState(null);

  const [auditLog, setAuditLog] = useState([]);
  const [reindexStatus, setReindexStatus] = useState(null); // null | { loading, msg, ok }

  /* Branches */
  const [branches, setBranches]       = useState([]);
  const [branchForm, setBranchForm]   = useState({ name: '', address: '' });
  const [editBranch, setEditBranch]   = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchDetails, setBranchDetails]   = useState(null);
  const [branchDetailsLoading, setBranchDetailsLoading] = useState(false);

  /* All Staff */
  const [allStaff, setAllStaff]           = useState([]);
  const [allStaffSearch, setAllStaffSearch] = useState('');
  const [allStaffRoleFilter, setAllStaffRoleFilter] = useState('all');
  const [editStaffModal, setEditStaffModal] = useState(null);
  const [editStaffForm, setEditStaffForm]   = useState({ username:'', email:'', phone:'', salary:'', password:'' });
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const canAccess = user?.role === 'super_admin';

  const notify = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:'', type:'' }), 4000);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const { old_password, new_password, confirm_password } = changePwForm;
    if (new_password !== confirm_password) { notify('New passwords do not match', 'error'); return; }
    if (new_password.length < 6) { notify('Password must be at least 6 characters', 'error'); return; }
    setChangePwLoading(true);
    try {
      const res = await api.put('/settings/change-password', { old_password, new_password });
      if (res.data.success) {
        notify('Password updated successfully');
        setChangePwOpen(false);
        setChangePwForm({ old_password: '', new_password: '', confirm_password: '' });
      } else {
        notify(res.data.message || 'Failed to update password', 'error');
      }
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to update password', 'error');
    }
    setChangePwLoading(false);
  };

  const handleReindex = async () => {
    setReindexStatus({ loading: true, msg: 'Starting bulk reindex...', ok: null });
    try {
      const res = await api.post('/ai/reindex');
      if (res.data.success) {
        setReindexStatus({ loading: false, msg: res.data.message, ok: true });
      } else {
        setReindexStatus({ loading: false, msg: res.data.message || 'Reindex failed', ok: false });
      }
    } catch (err) {
      setReindexStatus({ loading: false, msg: err.response?.data?.message || 'Could not reach visual search service. Make sure Python service is running.', ok: false });
    }
  };

  const load = useCallback(async (section) => {
    try {
      if (section === 'dashboard') {
        const r = await adminService.getSuperDashboard();
        setStats(r.data.success ? r.data.data : {});
      } else if (section === 'branches') {
        const r = await adminService.superGetBranches();
        if (r.data.success) setBranches(r.data.data);
      } else if (section === 'staff') {
        const r = await adminService.listStaffAdmins();
        if (r.data.success) setStaffList(r.data.data);
      } else if (section === 'users') {
        const r = await adminService.getSuperUsers({ search: userSearch });
        if (r.data.success) setUsers(r.data.data);
      } else if (section === 'settings') {
        const r = await adminService.getSettings();
        if (r.data.success) {
          setSettings(r.data.data);
          const v = {};
          r.data.data.forEach(s => { v[s.setting_key] = s.setting_value; });
          setEditValues(v);
        }
      } else if (section === 'revenue') {
        const params = { period: revPeriod };
        if (revPeriod === 'custom' && revFromDate && revToDate) { params.from_date = revFromDate; params.to_date = revToDate; }
        const r = await adminService.getRevenueAnalytics(params);
        setRevenue(r.data.success ? r.data.data : { orders: [], delivery: [], ads: [] });
      } else if (section === 'revenue_history') {
        const params = { period: revPeriod, type: revHistoryType, page: revHistoryPage, limit: 20 };
        if (revPeriod === 'custom' && revFromDate && revToDate) { params.from_date = revFromDate; params.to_date = revToDate; }
        const r = await adminService.getRevenueHistory(params);
        if (r.data.success) {
          setRevHistory(r.data.data || []);
          setRevHistoryTotal(r.data.total || 0);
          setRevHistorySummary(r.data.summary || null);
        }
      } else if (section === 'commissions') {
        const r = await adminService.getCategoryCommissions();
        if (r.data.success) {
          setCategoryCommissions(r.data.data || []);
          const v = {};
          (r.data.data || []).forEach(c => { v[c.category_id] = c.commission_rate; });
          setCatComEditValues(v);
        }
      } else if (section === 'ads') {
        setAdsLoading(true);
        const r = await adminService.getAdPromotions();
        setAdsLoading(false);
        if (r.data.success) setAds(r.data.data);
        else setAds([]);
      } else if (section === 'audit') {
        const r = await adminService.getAuditLog({ limit: 100 });
        if (r.data.success) setAuditLog(r.data.data);
      } else if (section === 'all_staff') {
        const params = {};
        if (allStaffSearch) params.search = allStaffSearch;
        if (allStaffRoleFilter !== 'all') params.role = allStaffRoleFilter;
        const r = await adminService.getAllStaff(params);
        if (r.data.success) setAllStaff(r.data.data || []);
      }
    } catch (err) {
      const msg = err?.response?.data?.message
        || (err?.code === 'ERR_NETWORK' ? 'Cannot reach server — is the backend running?' : err?.message || 'Unknown error');
      console.error(`[SuperAdmin] load error [${section}]:`, msg);
      // Silently handle optional supplementary sections — don't toast the user
      if (section === 'revenue_history') { setRevHistory([]); return; }
      if (section === 'commissions')     { setCategoryCommissions([]); return; }
      if (section === 'all_staff')       { setAllStaff([]); return; }
      // Skip toast if 401 (interceptor already handles redirect)
      if (err?.response?.status === 401) return;
      // Reset state for failed sections
      if (section === 'dashboard') setStats({});
      else if (section === 'revenue') setRevenue({ orders: [], delivery: [], ads: [] });
      else if (section === 'ads') { setAdsLoading(false); setAds([]); }
      notify(`${section}: ${msg}`, 'error');
    }
  }, [userSearch, revPeriod, revFromDate, revToDate, revHistoryType, revHistoryPage, allStaffSearch, allStaffRoleFilter]);

  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    load('dashboard');
  }, [isAuthenticated, canAccess]);  // eslint-disable-line

  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    const map = { branches:'branches', staff:'staff', users:'users', settings:'settings', revenue:'revenue', ads:'ads', audit:'audit', all_staff:'all_staff' };
    if (tab === 'settings') { load('settings'); load('commissions'); return; }
    if (tab === 'revenue')  { load('revenue'); load('revenue_history'); return; }
    load(map[tab] || 'dashboard');
  }, [tab]);  // eslint-disable-line

  /* Branch actions */
  const saveBranch = async () => {
    if (!branchForm.name.trim()) return notify('Branch name is required', 'error');
    try {
      if (editBranch) {
        const r = await adminService.superUpdateBranch(editBranch.id, branchForm);
        if (r.data.success) { notify('Branch updated'); setEditBranch(null); }
        else { notify(r.data.message || 'Failed', 'error'); return; }
      } else {
        const r = await adminService.superCreateBranch(branchForm);
        if (r.data.success) notify('Branch created successfully');
        else { notify(r.data.message || 'Failed', 'error'); return; }
      }
      setBranchForm({ name: '', address: '' });
      load('branches');
    } catch (e) { notify(e.response?.data?.message || 'Failed to save branch', 'error'); }
  };

  const deleteBranch = async (id, name) => {
    if (!window.confirm(`Delete branch "${name}"? All assigned staff will be unlinked.`)) return;
    try {
      const r = await adminService.superDeleteBranch(id);
      if (r.data.success) { notify('Branch deleted'); load('branches'); load('dashboard'); }
      else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed to delete branch', 'error'); }
  };

  const openBranchDetails = async (branch) => {
    setSelectedBranch(branch);
    setBranchDetails(null);
    setBranchDetailsLoading(true);
    try {
      const r = await adminService.getBranchDetails(branch.id);
      if (r.data.success) setBranchDetails(r.data.data);
    } catch (e) { notify('Failed to load branch details', 'error'); }
    finally { setBranchDetailsLoading(false); }
  };

  /* All Staff actions */
  const openEditStaff = (s) => {
    setEditStaffModal(s);
    setEditStaffForm({ username: s.username, email: s.email, phone: s.phone || '', salary: s.salary || '', password: '' });
  };

  const saveEditStaff = async () => {
    if (!editStaffForm.username || !editStaffForm.email) return notify('Username and email are required', 'error');
    try {
      const r = await adminService.updateAnyStaff(editStaffModal.id, editStaffForm);
      if (r.data.success) {
        notify('Staff member updated');
        setEditStaffModal(null);
        load('all_staff');
      } else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const toggleAnyStaff = async (id) => {
    try {
      const r = await adminService.toggleAnyStaffStatus(id);
      if (r.data.success) { notify(r.data.message); load('all_staff'); }
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  /* Actions */
  const saveStaff = async () => {
    if (!staffForm.username || !staffForm.email || (!editingStaff && !staffForm.password))
      return notify('Username, email, and password are required', 'error');
    try {
      const r = editingStaff
        ? await adminService.updateStaffAdmin(editingStaff, staffForm)
        : await adminService.createStaffAdmin(staffForm);
      if (r.data.success) {
        notify(r.data.message || (editingStaff ? 'Updated' : 'Created'));
        setStaffForm({ username:'', email:'', password:'', phone:'', salary:'' });
        setEditingStaff(null);
        load('staff'); load('dashboard');
      } else notify(r.data.message, 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const toggleStaff = async (id) => {
    try { const r = await adminService.toggleStaffAdminStatus(id); if (r.data.success) { notify(r.data.message); load('staff'); } }
    catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const deleteStaff = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { const r = await adminService.deleteStaffAdmin(id); if (r.data.success) { notify('Deleted'); load('staff'); load('dashboard'); } }
    catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const saveSetting = async (key) => {
    try {
      const r = await adminService.updateSetting(key, editValues[key]);
      if (r.data.success) notify(`${SETTING_META[key]?.label || key} updated`);
      else notify(r.data.message, 'error');
    } catch (e) { notify('Failed', 'error'); }
  };

  const saveCategoryCommission = async (categoryId) => {
    const rate = parseFloat(catComEditValues[categoryId]);
    if (isNaN(rate) || rate < 0 || rate > 100) return notify('Rate must be 0–100', 'error');
    try {
      const r = await adminService.updateCategoryCommission(categoryId, rate);
      if (r.data.success) { notify('Commission rate updated'); load('commissions'); }
      else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const toggleUser = async (id) => {
    try { const r = await adminService.toggleUserStatus(id); if (r.data.success) { notify(r.data.message); load('users'); } }
    catch (e) { notify('Failed', 'error'); }
  };

  const saveAd = async () => {
    if (!adForm.advertiserName || !adForm.startDate || !adForm.endDate)
      return notify('Advertiser name, start and end dates are required', 'error');
    try {
      const fd = new FormData();
      Object.entries(adForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (adFile) fd.append('banner', adFile);
      const r = editingAd ? await adminService.updateAdPromotion(editingAd, fd) : await adminService.createAdPromotion(fd);
      if (r.data.success) {
        notify(r.data.message || (editingAd ? 'Updated' : 'Created'));
        setAdForm({ advertiserName:'', bannerUrl:'', linkUrl:'', feeAmount:'', startDate:'', endDate:'' });
        setAdFile(null); setEditingAd(null); load('ads');
      } else notify(r.data.message, 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const deleteAd = async (id) => {
    if (!window.confirm('Delete this ad?')) return;
    try { const r = await adminService.deleteAdPromotion(id); if (r.data.success) { notify('Deleted'); load('ads'); } }
    catch (e) { notify('Failed', 'error'); }
  };

  /* Guards */
  if (!isAuthenticated) return (
    <div className="sp-gate">
      <Lock size={44} />
      <h2>Super Admin Panel</h2>
      <p>Please sign in to continue.</p>
      <button className="sp-btn sp-btn--primary" onClick={onRequireAuth}>Sign In</button>
    </div>
  );

  if (!canAccess) return (
    <div className="sp-gate">
      <XCircle size={44} style={{ color: '#ef4444' }} />
      <h2>Access Denied</h2>
      <p>Only the Super Admin can access this panel.</p>
    </div>
  );

  /* ══════════ RENDER ══════════ */
  return (
    <div className="sp-root" data-theme={theme} ref={printRef}>
      {/* Toast */}
      {toast.msg && (
        <div className={`sp-toast ${toast.type === 'error' ? 'sp-toast--err' : ''}`}>
          {toast.type === 'error' ? <XCircle size={16}/> : <CheckCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sp-sidebar ${sidebarOpen ? 'sp-sidebar--open' : ''}`}>
        <div className="sp-sidebar-brand">
          <div className="sp-brand-logo">FC</div>
          <div>
            <div className="sp-brand-name">FlexCart</div>
            <div className="sp-brand-role">Super Admin</div>
          </div>
        </div>

        <nav className="sp-nav">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id}
                className={`sp-nav-item ${tab === t.id ? 'sp-nav-item--active' : ''}`}
                onClick={() => { setTab(t.id); setSidebarOpen(false); }}>
                <Icon size={18} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sp-sidebar-bottom">
          <button className="sp-nav-item" onClick={() => window.print()}>
            <Printer size={16} /> Print / PDF
          </button>
          <button className="sp-logout" onClick={logout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="sp-main">
        <header className="sp-topbar">
          <button className="sp-menu-toggle" onClick={() => setSidebarOpen(s => !s)}>
            {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
          <h1 className="sp-page-title">{TABS.find(t => t.id === tab)?.label}</h1>
          <div className="sp-topbar-user" ref={profileRef}>
            <button className="sp-profile-btn" onClick={() => setProfileOpen(o => !o)}>
              <div className="sp-avatar">{user?.username?.[0]?.toUpperCase()}</div>
              <div>
                <div className="sp-topbar-name">{user?.username}</div>
                <div className="sp-topbar-role">Super Admin</div>
              </div>
            </button>
            {profileOpen && (
              <div className="sp-profile-dropdown">
                <div className="sp-dd-header">
                  <div className="sp-dd-name">{user?.username}</div>
                  <div className="sp-dd-role">Super Admin</div>
                </div>
                <button className="sp-dd-item" onClick={() => { setTab('dashboard'); setProfileOpen(false); }}>
                  <User size={14}/> View Profile
                </button>
                <button className="sp-dd-item" onClick={() => { toggleTheme(); setProfileOpen(false); }}>
                  {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
                <button className="sp-dd-item" onClick={() => { setChangePwOpen(true); setProfileOpen(false); }}>
                  <Lock size={14}/> Change Password
                </button>
                <hr className="sp-dd-divider"/>
                <button className="sp-dd-item danger" onClick={() => { setProfileOpen(false); logout(); }}>
                  <LogOut size={14}/> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="sp-content">

          {/* ─── DASHBOARD ─── */}
          {tab === 'dashboard' && (
            <div className="sp-section">
              {stats ? (
                <div className="sp-kpi-grid">
                  <KPI label="Customers"     value={stats.totalCustomers}                              icon={Users}       color="#6366f1"/>
                  <KPI label="Sellers"       value={stats.totalSellers}                                icon={Shield}      color="#0ea5e9"/>
                  <KPI label="Products"      value={stats.totalProducts}                               icon={Package}     color="#8b5cf6"/>
                  <KPI label="Total Orders"  value={stats.totalOrders}                                 icon={BarChart2}   color="#f59e0b"/>
                  <KPI label="Order Revenue" value={`৳${Number(stats.totalRevenue||0).toFixed(0)}`}    icon={DollarSign}  color="#10b981"/>
                  <KPI label="Deliveries"    value={stats.totalDeliveries}                             icon={Truck}       color="#06b6d4"/>
                  <KPI label="Delivery Rate" value={`${stats.successRate}%`}                           icon={CheckCircle} color="#10b981"/>
                  <KPI label="Del. Revenue"  value={`৳${Number(stats.totalDeliveryCost||0).toFixed(0)}`} icon={CreditCard} color="#f97316"/>
                  <KPI label="Ad Revenue"    value={`৳${Number(stats.totalAdProfit||0).toFixed(0)}`}   icon={Megaphone}   color="#ec4899"/>
                  <KPI label="Branches"      value={stats.totalBranches}                               icon={GitBranch}   color="#a78bfa"/>
                  <KPI label="Staff Admins"  value={stats.totalStaff}                                  icon={Shield}      color="#34d399"/>
                  <KPI label="Commission"    value={`${stats.settings?.commission_rate || 5}%`}        icon={Settings}    color="#94a3b8"/>
                </div>
              ) : <div className="sp-loading"><RefreshCcw size={20} className="sp-spin"/> Loading…</div>}
            </div>
          )}

          {/* ─── BRANCHES ─── */}
          {tab === 'branches' && (
            <div className="sp-section">
              <div className="sp-card">
                <h3 className="sp-card-title">
                  <GitBranch size={17}/> {editBranch ? 'Edit Branch' : 'Create New Branch'}
                </h3>
                <p className="sp-card-desc">Only the Super Admin can create or manage branches.</p>
                <div className="sp-form-grid">
                  <div className="sp-field">
                    <label>Branch Name *</label>
                    <input className="sp-input" placeholder="e.g. Dhaka Central"
                      value={branchForm.name} onChange={e => setBranchForm(f => ({...f, name: e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Address (optional)</label>
                    <input className="sp-input" placeholder="Full address"
                      value={branchForm.address} onChange={e => setBranchForm(f => ({...f, address: e.target.value}))}/>
                  </div>
                </div>
                <div className="sp-form-actions">
                  <button className="sp-btn sp-btn--primary" onClick={saveBranch}>
                    {editBranch ? <><Save size={15}/> Update Branch</> : <><Plus size={15}/> Create Branch</>}
                  </button>
                  {editBranch && (
                    <button className="sp-btn sp-btn--secondary" onClick={() => { setEditBranch(null); setBranchForm({ name: '', address: '' }); }}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="sp-toolbar">
                <button className="sp-btn sp-btn--secondary" onClick={() => load('branches')}>
                  <RefreshCcw size={15}/> Refresh
                </button>
              </div>

              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Address</th><th>Staff</th><th>Vehicles</th><th>Deliveries</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {branches.map(b => (
                      <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => openBranchDetails(b)}>
                        <td className="sp-td-muted">{b.id}</td>
                        <td className="sp-td-strong">{b.name}</td>
                        <td>{b.address || <span className="sp-td-muted">—</span>}</td>
                        <td><span className="sp-count-chip">{(b.admin_count || 0) + (b.driver_count || 0)}</span></td>
                        <td><span className="sp-count-chip">{b.vehicle_count || 0}</span></td>
                        <td><span className="sp-count-chip">{b.delivery_count || 0}</span></td>
                        <td>
                          <div className="sp-action-row" onClick={e => e.stopPropagation()}>
                            <button className="sp-icon-btn sp-icon-btn--edit" title="Edit"
                              onClick={() => { setEditBranch(b); setBranchForm({ name: b.name, address: b.address || '' }); }}>
                              <Pencil size={14}/>
                            </button>
                            <button className="sp-icon-btn sp-icon-btn--danger" title="Delete"
                              onClick={() => deleteBranch(b.id, b.name)}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {branches.length === 0 && (
                      <tr><td colSpan={7} className="sp-empty-row">No branches created yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Branch Detail Panel */}
              {selectedBranch && (
                <div className="sp-modal-overlay" onClick={() => setSelectedBranch(null)}>
                  <div className="sp-modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
                    <div className="sp-modal-header">
                      <h3><Building2 size={18}/> {selectedBranch.name} — Details</h3>
                      <button className="sp-icon-btn" onClick={() => setSelectedBranch(null)}><X size={16}/></button>
                    </div>
                    {branchDetailsLoading ? (
                      <div className="sp-loading"><RefreshCcw size={18} className="sp-spin"/> Loading…</div>
                    ) : branchDetails ? (
                      <div>
                        <div className="sp-kpi-grid" style={{ marginBottom: '1rem' }}>
                          <KPI label="Completed" value={branchDetails.branch?.completed_deliveries || 0} icon={CheckCircle} color="#10b981"/>
                          <KPI label="Pending"   value={branchDetails.branch?.pending_deliveries || 0}   icon={AlertCircle} color="#f59e0b"/>
                          <KPI label="Failed"    value={branchDetails.branch?.failed_deliveries || 0}    icon={XCircle}     color="#ef4444"/>
                          <KPI label="Employees" value={branchDetails.branch?.employee_count || 0}       icon={Users2}      color="#6366f1"/>
                        </div>
                        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--sp-text-muted)' }}>Employees</h4>
                        <div className="sp-table-wrap">
                          <table className="sp-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Salary</th><th>Status</th></tr></thead>
                            <tbody>
                              {(branchDetails.employees || []).map(e => (
                                <tr key={e.id}>
                                  <td className="sp-td-strong">{e.username}</td>
                                  <td>{e.email}</td>
                                  <td>{e.phone || '—'}</td>
                                  <td><span className="sp-role-chip">{e.role}</span></td>
                                  <td>৳{Number(e.salary||0).toFixed(0)}</td>
                                  <td><Badge status={e.status}/></td>
                                </tr>
                              ))}
                              {(branchDetails.employees || []).length === 0 && (
                                <tr><td colSpan={6} className="sp-empty-row">No employees assigned</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ─── STAFF ADMINS ─── */}
          {tab === 'staff' && (
            <div className="sp-section">
              <div className="sp-card">
                <h3 className="sp-card-title">{editingStaff ? 'Edit Staff Admin' : 'Create Staff Admin Account'}</h3>
                <p className="sp-card-desc">Only the Super Admin can create or manage Staff Admin accounts.</p>
                <div className="sp-form-grid">
                  <div className="sp-field">
                    <label>Username *</label>
                    <input className="sp-input" placeholder="staffadmin_01"
                      value={staffForm.username} onChange={e => setStaffForm(f=>({...f, username:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Email *</label>
                    <input className="sp-input" type="email" placeholder="staff@flexcart.com"
                      value={staffForm.email} onChange={e => setStaffForm(f=>({...f, email:e.target.value}))} disabled={!!editingStaff}/>
                  </div>
                  <div className="sp-field">
                    <label>Password {editingStaff ? '(leave blank to keep)' : '*'}</label>
                    <input className="sp-input" type="password" placeholder="Min. 8 characters"
                      value={staffForm.password} onChange={e => setStaffForm(f=>({...f, password:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Phone</label>
                    <input className="sp-input" placeholder="+880..."
                      value={staffForm.phone} onChange={e => setStaffForm(f=>({...f, phone:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Salary (৳)</label>
                    <input className="sp-input" type="number" placeholder="0"
                      value={staffForm.salary} onChange={e => setStaffForm(f=>({...f, salary:e.target.value}))}/>
                  </div>
                </div>
                <div className="sp-form-actions">
                  <button className="sp-btn sp-btn--primary" onClick={saveStaff}>
                    {editingStaff ? <><Save size={15}/> Update</> : <><Plus size={15}/> Create Staff Admin</>}
                  </button>
                  {editingStaff && (
                    <button className="sp-btn sp-btn--secondary" onClick={() => { setEditingStaff(null); setStaffForm({ username:'', email:'', password:'', phone:'', salary:'' }); }}>Cancel</button>
                  )}
                </div>
              </div>

              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead><tr><th>Username</th><th>Email</th><th>Phone</th><th>Salary</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                  <tbody>
                    {staffList.map(s => (
                      <tr key={s.id}>
                        <td className="sp-td-strong">{s.username}</td>
                        <td>{s.email}</td>
                        <td>{s.phone || '—'}</td>
                        <td>৳{Number(s.salary||0).toFixed(0)}</td>
                        <td><Badge status={s.status}/></td>
                        <td className="sp-td-muted">{new Date(s.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="sp-action-row">
                            <button className="sp-icon-btn sp-icon-btn--edit" title="Edit" onClick={() => { setEditingStaff(s.id); setStaffForm({ username:s.username, email:s.email, password:'', phone:s.phone||'', salary:s.salary||'' }); }}>
                              <Pencil size={14}/>
                            </button>
                            <button className="sp-icon-btn sp-icon-btn--warn" title={s.status==='active'?'Pause':'Activate'} onClick={() => toggleStaff(s.id)}>
                              {s.status === 'active' ? <PauseCircle size={14}/> : <PlayCircle size={14}/>}
                            </button>
                            <button className="sp-icon-btn sp-icon-btn--danger" onClick={() => deleteStaff(s.id, s.username)}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {staffList.length === 0 && (
                      <tr><td colSpan={7} className="sp-empty-row">No Staff Admin accounts yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── USERS ─── */}
          {tab === 'users' && (
            <div className="sp-section">
              <div className="sp-toolbar">
                <div className="sp-search-wrap">
                  <Search size={15} className="sp-search-icon"/>
                  <input className="sp-input sp-input--sm sp-input--search" placeholder="Search name or email..."
                    value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && load('users')}/>
                </div>
                <button className="sp-btn sp-btn--primary" onClick={() => load('users')}><Search size={14}/> Search</button>
              </div>
              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead><tr><th>Username</th><th>Email</th><th>Phone</th><th>Seller</th><th>Points</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="sp-td-strong">{u.username}</td>
                        <td>{u.email}</td>
                        <td>{u.phone || '—'}</td>
                        <td>{u.is_seller ? <CheckCircle size={14} color="#10b981"/> : '—'}</td>
                        <td>{u.points || 0}</td>
                        <td><Badge status={u.status}/></td>
                        <td className="sp-td-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td>
                          <button className={`sp-btn sp-btn--xs ${u.status==='active'?'sp-btn--danger':'sp-btn--primary'}`} onClick={() => toggleUser(u.id)}>
                            {u.status==='active' ? <><PauseCircle size={12}/> Suspend</> : <><PlayCircle size={12}/> Activate</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && <tr><td colSpan={8} className="sp-empty-row">No users found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── SETTINGS ─── */}
          {tab === 'settings' && (
            <div className="sp-section">
              <div className="sp-card">
                <h3 className="sp-card-title">Platform Earning Settings</h3>
                <p className="sp-card-desc">
                  FlexCart earns through: <strong>product commissions</strong>, <strong>delivery charges</strong>, and <strong>ad promotions</strong>.
                  Only the Super Admin can modify these values.
                </p>
                <div className="sp-settings-grid">
                  {settings.filter(s => SETTING_META[s.setting_key]).map(s => {
                    const meta = SETTING_META[s.setting_key];
                    return (
                      <div key={s.setting_key} className="sp-setting-card">
                        <div className="sp-setting-label">{meta.label}</div>
                        <div className="sp-setting-desc">{meta.desc}</div>
                        <div className="sp-setting-row">
                          <input className="sp-input" type="number" step="0.01" min="0"
                            value={editValues[s.setting_key] || ''}
                            onChange={e => setEditValues(v => ({...v, [s.setting_key]: e.target.value}))}/>
                          <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={() => saveSetting(s.setting_key)}>
                            <Save size={13}/> Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category-wise Commission Overrides */}
              <div className="sp-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="sp-card-title"><DollarSign size={16}/> Category Commission Rates</h3>
                <p className="sp-card-desc">
                  Override the default commission rate per product category. Leave at default to use the global rate above.
                </p>
                <div className="sp-toolbar" style={{ marginBottom: '0.75rem' }}>
                  <button className="sp-btn sp-btn--secondary" onClick={() => load('commissions')}>
                    <RefreshCcw size={15}/> Refresh
                  </button>
                </div>
                {categoryCommissions.length === 0 ? (
                  <p className="sp-td-muted" style={{ padding: '0.75rem 0' }}>No categories found.</p>
                ) : (
                  <div className="sp-table-wrap">
                    <table className="sp-table">
                      <thead><tr><th>Category</th><th>Commission Rate (%)</th><th>Type</th><th>Action</th></tr></thead>
                      <tbody>
                        {categoryCommissions.map(c => (
                          <tr key={c.category_id}>
                            <td className="sp-td-strong">{c.category_name}</td>
                            <td>
                              <input
                                className="sp-input"
                                type="number" step="0.01" min="0" max="100"
                                style={{ width: '100px' }}
                                value={catComEditValues[c.category_id] ?? c.commission_rate}
                                onChange={e => setCatComEditValues(v => ({...v, [c.category_id]: e.target.value}))}
                              />
                            </td>
                            <td>
                              {c.is_custom
                                ? <span className="sp-badge sp-badge--green" style={{ fontSize: '0.7rem' }}>Custom</span>
                                : <span className="sp-td-muted" style={{ fontSize: '0.75rem' }}>(default)</span>
                              }
                            </td>
                            <td>
                              <button className="sp-btn sp-btn--primary sp-btn--sm"
                                onClick={() => saveCategoryCommission(c.category_id)}>
                                <Save size={13}/> Save
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* AI Visual Search Reindex */}
              <div className="sp-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="sp-card-title"><Package size={16}/> AI Visual Search Index</h3>
                <p className="sp-card-desc">
                  Re-index all active product images into the visual search engine.
                  Run this after adding new products or if image search returns no results.
                  Requires the Python service to be running: <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>python ai/visual_search.py</code>
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    className="sp-btn sp-btn--primary"
                    onClick={handleReindex}
                    disabled={reindexStatus?.loading}
                  >
                    <RefreshCcw size={15} style={reindexStatus?.loading ? { animation: 'spin 1s linear infinite' } : {}}/>
                    {reindexStatus?.loading ? 'Indexing…' : 'Re-index All Products'}
                  </button>
                  {reindexStatus && !reindexStatus.loading && (
                    <span style={{ fontSize: '0.875rem', color: reindexStatus.ok ? '#059669' : '#dc2626', fontWeight: 500 }}>
                      {reindexStatus.ok ? '✓' : '✗'} {reindexStatus.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── ALL STAFF ─── */}
          {tab === 'all_staff' && (
            <div className="sp-section">
              <div className="sp-toolbar">
                {['all','staff_admin','delivery_admin','delivery_boy'].map(r => (
                  <button key={r} className={`sp-filter-tab ${allStaffRoleFilter===r?'active':''}`}
                    onClick={() => { setAllStaffRoleFilter(r); setTimeout(() => load('all_staff'), 50); }}>
                    {r === 'all' ? 'All Roles' : r === 'staff_admin' ? 'Staff Admins' : r === 'delivery_admin' ? 'Delivery Admins' : 'Delivery Boys'}
                  </button>
                ))}
                <div className="sp-search-wrap" style={{ marginLeft: 'auto' }}>
                  <Search size={15} className="sp-search-icon"/>
                  <input className="sp-input sp-input--sm sp-input--search" placeholder="Search name or email…"
                    value={allStaffSearch} onChange={e => setAllStaffSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && load('all_staff')}/>
                </div>
                <button className="sp-btn sp-btn--primary" onClick={() => load('all_staff')}><Search size={14}/> Search</button>
                <button className="sp-btn sp-btn--secondary" onClick={() => load('all_staff')}><RefreshCcw size={14}/></button>
              </div>
              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead><tr><th>Role</th><th>Name</th><th>Email</th><th>Phone</th><th>Password</th><th>Branch</th><th>Salary</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {allStaff.map(s => (
                      <tr key={s.id}>
                        <td><span className="sp-role-chip">{s.role}</span></td>
                        <td className="sp-td-strong">{s.username}</td>
                        <td>{s.email}</td>
                        <td>{s.phone || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151' }}>
                              {visiblePasswords[s.id] ? (s.plain_password || '—') : (s.plain_password ? '••••••••' : '—')}
                            </span>
                            {s.plain_password && (
                              <button
                                onClick={() => setVisiblePasswords(p => ({ ...p, [s.id]: !p[s.id] }))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px' }}
                                title={visiblePasswords[s.id] ? 'Hide password' : 'Show password'}
                              >
                                {visiblePasswords[s.id] ? <EyeOff size={14}/> : <Eye size={14}/>}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{s.branch_name || <span className="sp-td-muted">Unassigned</span>}</td>
                        <td>৳{Number(s.salary||0).toFixed(0)}</td>
                        <td><Badge status={s.status}/></td>
                        <td>
                          <div className="sp-action-row">
                            <button className="sp-icon-btn sp-icon-btn--edit" title="Edit" onClick={() => openEditStaff(s)}>
                              <Pencil size={14}/>
                            </button>
                            <button className="sp-icon-btn sp-icon-btn--warn" title={s.status==='active'?'Suspend':'Activate'}
                              onClick={() => toggleAnyStaff(s.id)}>
                              {s.status === 'active' ? <PauseCircle size={14}/> : <PlayCircle size={14}/>}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {allStaff.length === 0 && (
                      <tr><td colSpan={8} className="sp-empty-row">No staff members found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Edit Staff Modal */}
              {editStaffModal && (
                <div className="sp-modal-overlay" onClick={() => setEditStaffModal(null)}>
                  <div className="sp-modal" onClick={e => e.stopPropagation()}>
                    <div className="sp-modal-header">
                      <h3><Pencil size={16}/> Edit Staff — {editStaffModal.username}</h3>
                      <button className="sp-icon-btn" onClick={() => setEditStaffModal(null)}><X size={16}/></button>
                    </div>
                    <div className="sp-form-grid">
                      <div className="sp-field">
                        <label>Username *</label>
                        <input className="sp-input" value={editStaffForm.username}
                          onChange={e => setEditStaffForm(f=>({...f, username: e.target.value}))}/>
                      </div>
                      <div className="sp-field">
                        <label>Email *</label>
                        <input className="sp-input" type="email" value={editStaffForm.email}
                          onChange={e => setEditStaffForm(f=>({...f, email: e.target.value}))}/>
                      </div>
                      <div className="sp-field">
                        <label>Phone</label>
                        <input className="sp-input" value={editStaffForm.phone}
                          onChange={e => setEditStaffForm(f=>({...f, phone: e.target.value}))}/>
                      </div>
                      <div className="sp-field">
                        <label>Salary (৳)</label>
                        <input className="sp-input" type="number" value={editStaffForm.salary}
                          onChange={e => setEditStaffForm(f=>({...f, salary: e.target.value}))}/>
                      </div>
                      <div className="sp-field">
                        <label>New Password (leave blank to keep)</label>
                        <input className="sp-input" type="password" placeholder="Min. 8 characters"
                          value={editStaffForm.password}
                          onChange={e => setEditStaffForm(f=>({...f, password: e.target.value}))}/>
                      </div>
                    </div>
                    <div className="sp-form-actions">
                      <button className="sp-btn sp-btn--primary" onClick={saveEditStaff}><Save size={14}/> Save Changes</button>
                      <button className="sp-btn sp-btn--secondary" onClick={() => setEditStaffModal(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── REVENUE ─── */}
          {tab === 'revenue' && (
            <div className="sp-section">
              <div className="sp-toolbar">
                {['daily','monthly','yearly','custom'].map(p => (
                  <button key={p} className={`sp-filter-tab ${revPeriod===p?'active':''}`}
                    onClick={() => { setRevPeriod(p); setRevHistoryPage(1); if (p !== 'custom') setTimeout(() => { load('revenue'); load('revenue_history'); }, 50); }}>
                    {p.charAt(0).toUpperCase()+p.slice(1)}
                  </button>
                ))}
                {revPeriod === 'custom' && (
                  <>
                    <input className="sp-input sp-input--sm" type="date" value={revFromDate}
                      onChange={e => setRevFromDate(e.target.value)} style={{ width: '140px' }}/>
                    <span style={{ padding: '0 0.25rem', fontSize: '0.8rem', color: 'var(--sp-text-muted)' }}>to</span>
                    <input className="sp-input sp-input--sm" type="date" value={revToDate}
                      onChange={e => setRevToDate(e.target.value)} style={{ width: '140px' }}/>
                    <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={() => { setRevHistoryPage(1); load('revenue'); load('revenue_history'); }}>
                      Apply
                    </button>
                  </>
                )}
              </div>
              {revenue ? (
                <>
                  <div className="sp-charts-grid">
                    <div className="sp-chart-card">
                      <div className="sp-chart-header"><CreditCard size={16}/> Order Revenue</div>
                      <BarChart data={revenue.orders} xKey="label" yKey="amount" color="#3b82f6" prefix="৳"/>
                    </div>
                    <div className="sp-chart-card">
                      <div className="sp-chart-header"><Truck size={16}/> Delivery Revenue</div>
                      <BarChart data={revenue.delivery} xKey="label" yKey="amount" color="#10b981" prefix="৳"/>
                    </div>
                    <div className="sp-chart-card">
                      <div className="sp-chart-header"><Megaphone size={16}/> Ad Revenue</div>
                      <BarChart data={revenue.ads} xKey="label" yKey="amount" color="#f59e0b" prefix="৳"/>
                    </div>
                  </div>
                </>
              ) : <div className="sp-loading"><RefreshCcw size={20} className="sp-spin"/> Loading…</div>}

              {/* Revenue Transaction History */}
              <div className="sp-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="sp-card-title"><ClipboardList size={16}/> Revenue History</h3>
                {revHistorySummary && (
                  <div className="sp-kpi-grid" style={{ marginBottom: '1rem' }}>
                    <KPI label="Orders"           value={revHistorySummary.order_count}                                        icon={BarChart2}  color="#6366f1"/>
                    <KPI label="Product Revenue"  value={`৳${Number(revHistorySummary.net_product_revenue||0).toFixed(2)}`}    icon={DollarSign} color="#3b82f6"/>
                    <KPI label="Commission"       value={`৳${Number(revHistorySummary.total_commission||0).toFixed(2)}`}        icon={TrendingUp} color="#10b981"/>
                    <KPI label="Delivery Revenue" value={`৳${Number(revHistorySummary.total_delivery_revenue||0).toFixed(2)}`}  icon={Truck}      color="#f59e0b"/>
                  </div>
                )}
                <div className="sp-toolbar" style={{ marginBottom: '0.75rem' }}>
                  {['all','cart','buy_now'].map(t => (
                    <button key={t} className={`sp-filter-tab ${revHistoryType===t?'active':''}`}
                      onClick={() => { setRevHistoryType(t); setRevHistoryPage(1); setTimeout(() => load('revenue_history'), 50); }}>
                      {t === 'all' ? 'All' : t === 'cart' ? 'Cart Orders' : 'Buy Now'}
                    </button>
                  ))}
                  <button className="sp-btn sp-btn--secondary" style={{ marginLeft: 'auto' }} onClick={() => load('revenue_history')}>
                    <RefreshCcw size={14}/> Refresh
                  </button>
                </div>
                <div className="sp-table-wrap">
                  <table className="sp-table">
                    <thead>
                      <tr>
                        <th>Order #</th><th>Date</th><th>Product Total</th><th>Discount</th>
                        <th>Delivery</th><th>Commission</th><th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revHistory.map((row, i) => (
                        <tr key={i}>
                          <td className="sp-td-strong">{row.order_number}</td>
                          <td className="sp-td-muted">{new Date(row.sale_date).toLocaleString()}</td>
                          <td>৳{Number(row.product_total||0).toFixed(2)}</td>
                          <td className="sp-td-muted">{row.discount_amount > 0 ? `-৳${Number(row.discount_amount).toFixed(2)}` : '—'}</td>
                          <td>৳{Number(row.delivery_charge||0).toFixed(2)}</td>
                          <td style={{ color: '#10b981' }}>৳{Number(row.commission_amount||0).toFixed(2)}</td>
                          <td><span className="sp-role-chip">{row.source_type}</span></td>
                        </tr>
                      ))}
                      {revHistory.length === 0 && (
                        <tr><td colSpan={7} className="sp-empty-row">No revenue records found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {revHistoryTotal > 20 && (
                  <div className="sp-toolbar" style={{ marginTop: '0.75rem' }}>
                    <button className="sp-btn sp-btn--secondary" disabled={revHistoryPage <= 1}
                      onClick={() => { setRevHistoryPage(p => p - 1); setTimeout(() => load('revenue_history'), 50); }}>
                      ← Prev
                    </button>
                    <span style={{ padding: '0 0.75rem', fontSize: '0.875rem' }}>
                      Page {revHistoryPage} / {Math.ceil(revHistoryTotal / 20)}
                    </span>
                    <button className="sp-btn sp-btn--secondary" disabled={revHistoryPage >= Math.ceil(revHistoryTotal / 20)}
                      onClick={() => { setRevHistoryPage(p => p + 1); setTimeout(() => load('revenue_history'), 50); }}>
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── ADS ─── */}
          {tab === 'ads' && (
            <div className="sp-section">
              <div className="sp-card">
                <h3 className="sp-card-title">{editingAd ? 'Edit Ad Promotion' : 'Create Ad Promotion'}</h3>
                <div className="sp-form-grid">
                  <div className="sp-field">
                    <label>Advertiser Name *</label>
                    <input className="sp-input" placeholder="Company / Brand name"
                      value={adForm.advertiserName} onChange={e => setAdForm(f=>({...f, advertiserName:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Banner Image URL</label>
                    <input className="sp-input" placeholder="https://..."
                      value={adForm.bannerUrl} onChange={e => setAdForm(f=>({...f, bannerUrl:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Upload Banner</label>
                    <input className="sp-input" type="file" accept="image/*"
                      onChange={e => setAdFile(e.target.files[0] || null)}/>
                  </div>
                  <div className="sp-field">
                    <label>Click URL</label>
                    <input className="sp-input" placeholder="https://..."
                      value={adForm.linkUrl} onChange={e => setAdForm(f=>({...f, linkUrl:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Fee Amount (৳)</label>
                    <input className="sp-input" type="number" placeholder="0"
                      value={adForm.feeAmount} onChange={e => setAdForm(f=>({...f, feeAmount:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>Start Date *</label>
                    <input className="sp-input" type="date"
                      value={adForm.startDate} onChange={e => setAdForm(f=>({...f, startDate:e.target.value}))}/>
                  </div>
                  <div className="sp-field">
                    <label>End Date *</label>
                    <input className="sp-input" type="date"
                      value={adForm.endDate} onChange={e => setAdForm(f=>({...f, endDate:e.target.value}))}/>
                  </div>
                </div>
                <div className="sp-form-actions">
                  <button className="sp-btn sp-btn--primary" onClick={saveAd}>
                    {editingAd ? <><Save size={15}/> Update Ad</> : <><Plus size={15}/> Create Ad</>}
                  </button>
                  {editingAd && (
                    <button className="sp-btn sp-btn--secondary" onClick={() => { setEditingAd(null); setAdForm({ advertiserName:'', bannerUrl:'', linkUrl:'', feeAmount:'', startDate:'', endDate:'' }); }}>Cancel</button>
                  )}
                </div>
              </div>

              <div className="sp-toolbar">
                <button className="sp-btn sp-btn--secondary" onClick={() => load('ads')}>
                  <RefreshCcw size={15}/> Refresh
                </button>
              </div>

              <div className="sp-table-wrap">
                {adsLoading ? (
                  <div className="sp-loading"><RefreshCcw size={20} className="sp-spin"/> Loading ads…</div>
                ) : (
                <table className="sp-table">
                  <thead><tr><th>Advertiser</th><th>Banner</th><th>Fee</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {ads.map(a => (
                      <tr key={a.id}>
                        <td className="sp-td-strong">{a.advertiser_name}</td>
                        <td>
                          {a.banner_image
                            ? <img src={getImageUrl(a.banner_image)} alt="banner" style={{height:40,borderRadius:4,objectFit:'cover',maxWidth:80}}/>
                            : <span className="sp-td-muted">—</span>}
                        </td>
                        <td>৳{Number(a.fee_amount||0).toFixed(2)}</td>
                        <td className="sp-td-muted">{new Date(a.start_date).toLocaleDateString()}</td>
                        <td className="sp-td-muted">{new Date(a.end_date).toLocaleDateString()}</td>
                        <td><Badge status={a.is_active ? 'active' : 'inactive'}/></td>
                        <td>
                          <div className="sp-action-row">
                            <button className="sp-icon-btn" onClick={() => { setEditingAd(a.id); setAdForm({ advertiserName:a.advertiser_name, bannerUrl:a.banner_image||'', linkUrl:a.link_url||'', feeAmount:a.fee_amount, startDate:a.start_date?.split('T')[0]||'', endDate:a.end_date?.split('T')[0]||'' }); }}>
                              <Pencil size={14}/>
                            </button>
                            <button className="sp-icon-btn sp-icon-btn--danger" onClick={() => deleteAd(a.id)}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {ads.length === 0 && <tr><td colSpan={6} className="sp-empty-row">No ad promotions yet</td></tr>}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          )}

          {/* ─── AUDIT LOG ─── */}
          {tab === 'audit' && (
            <div className="sp-section">
              <div className="sp-toolbar">
                <button className="sp-btn sp-btn--secondary" onClick={() => load('audit')}>
                  <RefreshCcw size={15}/> Refresh
                </button>
              </div>
              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead><tr><th>Admin</th><th>Role</th><th>Action</th><th>Target</th><th>Date</th></tr></thead>
                  <tbody>
                    {auditLog.map(log => (
                      <tr key={log.id}>
                        <td>
                          <div className="sp-td-strong">{log.admin_username}</div>
                          <div className="sp-td-muted" style={{fontSize:'0.75rem'}}>{log.admin_email}</div>
                        </td>
                        <td><span className="sp-role-chip">{log.admin_role}</span></td>
                        <td><code className="sp-code">{log.action}</code></td>
                        <td className="sp-td-muted">{log.target_type ? `${log.target_type} #${log.target_id||'—'}` : '—'}</td>
                        <td className="sp-td-muted">{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                    {auditLog.length === 0 && <tr><td colSpan={5} className="sp-empty-row">No audit records yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Change Password Modal ── */}
      {changePwOpen && (
        <div className="sp-modal-overlay" onClick={() => setChangePwOpen(false)}>
          <div className="sp-modal sp-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="sp-modal-head">
              <Lock size={18}/>
              <h3>Change Password</h3>
              <button className="sp-modal-close" onClick={() => setChangePwOpen(false)}><X size={18}/></button>
            </div>
            <form className="sp-modal-body" onSubmit={handleChangePassword}>
              <div className="sp-cp-field">
                <label>Current Password</label>
                <div className="sp-cp-input-wrap">
                  <input
                    type={cpShowOld ? 'text' : 'password'}
                    placeholder="Current password"
                    value={changePwForm.old_password}
                    onChange={e => setChangePwForm(f => ({ ...f, old_password: e.target.value }))}
                    required
                  />
                  <button type="button" onClick={() => setCpShowOld(v => !v)}>
                    {cpShowOld ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
              <div className="sp-cp-field">
                <label>New Password</label>
                <div className="sp-cp-input-wrap">
                  <input
                    type={cpShowNew ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    value={changePwForm.new_password}
                    onChange={e => setChangePwForm(f => ({ ...f, new_password: e.target.value }))}
                    required
                    minLength={6}
                  />
                  <button type="button" onClick={() => setCpShowNew(v => !v)}>
                    {cpShowNew ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
              <div className="sp-cp-field">
                <label>Confirm New Password</label>
                <div className="sp-cp-input-wrap">
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={changePwForm.confirm_password}
                    onChange={e => setChangePwForm(f => ({ ...f, confirm_password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="sp-modal-actions">
                <button type="button" className="sp-btn sp-btn--ghost" onClick={() => setChangePwOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sp-btn sp-btn--primary" disabled={changePwLoading}>
                  {changePwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default SuperAdminPanel;
