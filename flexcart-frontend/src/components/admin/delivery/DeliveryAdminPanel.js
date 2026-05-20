import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck, RefreshCw, AlertCircle, MapPin, Package,
  DollarSign, User, Clock, History, CheckCircle, LogOut,
  X, Bell, GitBranch, Route, Send,
  Phone, ChevronDown, Sun, Moon, Calendar, TrendingUp,
  XCircle, Activity, Lock, Eye, EyeOff, Banknote
} from 'lucide-react';
import { AuthContext } from '../../../context/AuthContext';
import deliveryService from '../../../services/deliveryService';
import api from '../../../services/api';
import { connectSocket } from '../../../services/socketService';
import RouteManagementPanel from './RouteManagementPanel';
import './DeliveryAdminPanel.css';

/* ─── Theme hook ────────────────────────────────────────────── */
function useAdminTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin_theme') || 'dark');
  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('admin_theme', next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

/* ─── Date helpers ──────────────────────────────────────────── */
function buildDateParams(dateFilter, customFrom, customTo) {
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (dateFilter === 'today')  return { from_date: ymd(today), to_date: ymd(today) };
  if (dateFilter === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from_date: ymd(first), to_date: ymd(today) };
  }
  if (dateFilter === 'custom' && customFrom) return { from_date: customFrom, to_date: customTo || ymd(today) };
  return {};
}


function fmtDate(str) {
  if (!str) return '-';
  return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function joinAddr(...parts) {
  return parts.filter(Boolean).join(', ') || '-';
}

/* ─── Status Badge ─────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    assigned:         { cls: 'dap-badge-assigned',  label: 'Assigned' },
    in_transit:       { cls: 'dap-badge-transit',   label: 'In Transit' },
    out_for_delivery: { cls: 'dap-badge-transit',   label: 'Out for Delivery' },
    delivered:        { cls: 'dap-badge-delivered', label: 'Delivered' },
    rejected:         { cls: 'dap-badge-rejected',  label: 'Rejected / Return' },
    returned:         { cls: 'dap-badge-returned',  label: 'Returned' },
    pending:          { cls: 'dap-badge-pending',   label: 'Pending' },
    at_hub:           { cls: 'dap-badge-accepted',  label: 'At Hub' },
  };
  const b = map[status] || { cls: 'dap-badge-pending', label: status || '-' };
  return <span className={`dap-badge ${b.cls}`}>{b.label}</span>;
}

/* ─── Toast ────────────────────────────────────────────────── */
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`dap-toast ${type || 'info'}`}>
      {type === 'success' && <CheckCircle size={14}/>}
      {type === 'error'   && <AlertCircle size={14}/>}
      {type === 'info'    && <Clock size={14}/>}
      <span>{msg}</span>
      <button className="dap-toast-close" onClick={onClose}><X size={12}/></button>
    </div>
  );
}

/* ─── Order Info Card ──────────────────────────────────────── */
function OrderInfoCard({ item }) {
  const addr = joinAddr(item.shipping_address, item.shipping_city, item.shipping_country);
  const isCOD = item.payment_method === 'cash_on_delivery';
  return (
    <div className="dap-oi-grid">
      <div className="dap-oi-row"><User size={12}/><span><strong>{item.customer_name || '—'}</strong></span></div>
      {(item.customer_phone || item.receiver_mobile) && (
        <div className="dap-oi-row">
          <Phone size={12}/>
          <span>
            {item.customer_phone}{item.receiver_mobile && item.receiver_mobile !== item.customer_phone ? ` / রিসিভ: ${item.receiver_mobile}` : ''}
          </span>
        </div>
      )}
      {(item.district || item.upazila) && (
        <div className="dap-oi-row">
          <MapPin size={12}/>
          <span>
            {item.district && <><strong>জেলা:</strong> {item.district}</>}
            {item.district && item.upazila && ' • '}
            {item.upazila && <><strong>থানা:</strong> {item.upazila}</>}
          </span>
        </div>
      )}
      {item.receiver_location && (
        <div className="dap-oi-row"><MapPin size={12}/><span><strong>প্রাপ্তি লোকেশন:</strong> {item.receiver_location}</span></div>
      )}
      <div className="dap-oi-row"><MapPin size={12}/><span>{addr}</span></div>
      {item.company_names && <div className="dap-oi-row"><Package size={12}/><span>{item.company_names}</span></div>}
      {item.order_total != null && (
        <div className="dap-oi-row"><DollarSign size={12}/><span><strong>৳{Number(item.order_total).toFixed(2)}</strong></span></div>
      )}
      {isCOD && (
        <div className="dap-oi-row">
          <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 6px' }}>
            <Banknote size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />COD
          </span>
          {item.payment_status !== 'paid' && (() => {
            const totalAmt = Number(item.total_amount || item.order_total || 0);
            const advance = Number(item.cod_advance_paid || 0);
            const remaining = Math.max(0, totalAmt - advance);
            return (
              <span style={{ fontSize: '0.72rem', color: '#92400e', marginLeft: '4px' }}>
                {advance > 0 ? `৳${advance.toFixed(0)} paid · ` : ''}৳{remaining.toFixed(0)} due
              </span>
            );
          })()}
        </div>
      )}
      <div className="dap-oi-row"><Clock size={12}/><span>{fmtDate(item.assigned_branch_at || item.assigned_at)}</span></div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const DeliveryAdminPanel = ({ onRequireAuth }) => {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('queue');
  const [theme, toggleTheme] = useAdminTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [changePwForm, setChangePwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [cpShowOld, setCpShowOld] = useState(false);
  const [cpShowNew, setCpShowNew] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');
  const profileRef = useRef();

  useEffect(() => {
    const h = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ─── Toast ── */
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'info') => setToast({ msg, type }), []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setCpError(''); setCpSuccess('');
    const { old_password, new_password, confirm_password } = changePwForm;
    if (new_password !== confirm_password) { setCpError('New passwords do not match'); return; }
    if (new_password.length < 6) { setCpError('Password must be at least 6 characters'); return; }
    setChangePwLoading(true);
    try {
      const res = await api.put('/settings/change-password', { old_password, new_password });
      if (res.data.success) {
        setCpSuccess('Password updated successfully!');
        setChangePwForm({ old_password: '', new_password: '', confirm_password: '' });
        setTimeout(() => { setChangePwOpen(false); setCpSuccess(''); }, 1800);
      } else {
        setCpError(res.data.message || 'Failed to update password');
      }
    } catch (err) {
      setCpError(err.response?.data?.message || 'Failed to update password');
    }
    setChangePwLoading(false);
  };

  /* ─── Date filter ── */
  const [dateFilter, setDateFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  /* ─── Core data ── */
  const [branches, setBranches]               = useState([]);
  const [branchDrivers, setBranchDrivers]     = useState([]);
  const [branchAssignments, setBranchAssignments] = useState([]);
  const [deliveries, setDeliveries]           = useState([]);
  const [stats, setStats]                     = useState({ pending: 0, accepted: 0, active: 0, delivered: 0, rejected: 0, total: 0 });

  /* ─── Filtered (stat-click) state ── */
  const [statFilter, setStatFilter]       = useState(null);
  const [filteredItems, setFilteredItems] = useState([]);
  const [filteredLoading, setFilteredLoading] = useState(false);

  /* ─── Loading ── */
  const [queueLoading, setQueueLoading]       = useState(false);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [acceptingId, setAcceptingId]         = useState(null);
  const queueInitialized = useRef(false); // prevents spinner on background polls

  /* ─── Reassign Branch Modal ── */
  const [reassignModal, setReassignModal]     = useState(null);
  const [reassignBranchId, setReassignBranchId] = useState('');
  const [reassigning, setReassigning]         = useState(false);

  /* ─── Assign to Boy Modal ── */
  const [assignBoyModal, setAssignBoyModal]   = useState(null);
  const [selectedBoyId, setSelectedBoyId]     = useState('');
  const [assigningBoy, setAssigningBoy]       = useState(false);
  const [boysLoading, setBoysLoading]         = useState(false);

  /* ─── Derived ── */
  const isSuperAdmin = user?.role === 'super_admin';
  const canAccess    = user?.role === 'delivery_admin' || isSuperAdmin;
  const branchId     = user?.assigned_branch_id ? String(user.assigned_branch_id) : '';

  const pendingAssignments  = useMemo(() => branchAssignments.filter(o => !o.branch_accepted_at), [branchAssignments]);
  const acceptedAssignments = useMemo(() => branchAssignments.filter(o =>  o.branch_accepted_at), [branchAssignments]);

  /* ════════════════ Loaders ════════════════ */

  const loadBranchAssignments = useCallback(async () => {
    if (!isAuthenticated || !canAccess) return;
    // Only show the loading spinner on the very first fetch — subsequent
    // background polls (setInterval) update data silently to prevent flicker.
    const showSpinner = !queueInitialized.current;
    if (showSpinner) setQueueLoading(true);
    try {
      const res = await deliveryService.getBranchAssignments();
      if (res?.data?.success) {
        setBranchAssignments(res.data.data || []);
        queueInitialized.current = true;
      }
    } catch { /* keep stale data on error */ }
    finally { if (showSpinner) setQueueLoading(false); }
  }, [isAuthenticated, canAccess]);

  const loadStats = useCallback(async () => {
    if (!isAuthenticated || !canAccess) return;
    try {
      const params = buildDateParams(dateFilter, customFrom, customTo);
      const res = await deliveryService.getBranchStats(params);
      if (res?.data?.success) {
        const d = res.data.data;
        setStats({
          pending:   d.pending_deliveries      || 0,
          accepted:  d.accepted_deliveries     || 0,
          active:    d.in_progress_deliveries  || 0,
          delivered: d.completed_deliveries    || 0,
          rejected:  d.rejected_deliveries     || 0,
          total:     d.total_deliveries        || 0,
        });
      }
    } catch {}
  }, [isAuthenticated, canAccess, dateFilter, customFrom, customTo]);

  const loadFilteredDeliveries = useCallback(async (filter) => {
    if (!isAuthenticated || !canAccess) return;
    setFilteredLoading(true);
    try {
      const dateParams = buildDateParams(dateFilter, customFrom, customTo);
      const statusMap = { delivered: 'delivered', rejected: 'rejected', active: 'active' };
      const status = statusMap[filter] || 'all';
      const res = await deliveryService.getDeliveriesForBranch({ status, ...dateParams });
      if (res?.data?.success) setFilteredItems(res.data.data || []);
    } catch { setFilteredItems([]); }
    finally { setFilteredLoading(false); }
  }, [isAuthenticated, canAccess, dateFilter, customFrom, customTo]);

  const loadDeliveries = useCallback(async (statusFilter = 'all') => {
    if (!isAuthenticated || !canAccess) return;
    setDeliveriesLoading(true);
    try {
      const res = await deliveryService.getDeliveriesForBranch({ status: statusFilter });
      if (res?.data?.success) setDeliveries(res.data.data || []);
    } catch { setDeliveries([]); }
    finally { setDeliveriesLoading(false); }
  }, [isAuthenticated, canAccess]);

  /* ════════════════ Effects ════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    deliveryService.getBranches()
      .then(r => { if (r.data.success) setBranches(r.data.data || []); })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    const bid = branchId || undefined;
    deliveryService.getBranchResources(bid)
      .then(r => { if (r?.data?.success) setBranchDrivers(r.data.data?.drivers || []); })
      .catch(() => {});
  }, [isAuthenticated, canAccess, branchId]);

  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    loadBranchAssignments();
    loadStats();
    const iv = setInterval(() => { loadBranchAssignments(); loadStats(); }, 10000);
    return () => clearInterval(iv);
  }, [isAuthenticated, canAccess, loadBranchAssignments, loadStats]);

  /* Re-load filtered view when date changes */
  useEffect(() => {
    if (statFilter) loadFilteredDeliveries(statFilter);
  }, [dateFilter, customFrom, customTo, statFilter, loadFilteredDeliveries]);

  useEffect(() => {
    const tabToFilter = { active: 'active', history: 'all' };
    const f = tabToFilter[activeTab];
    if (!f || !isAuthenticated || !canAccess) return;
    loadDeliveries(f);
  }, [activeTab, isAuthenticated, canAccess, loadDeliveries]);

  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    const socket = connectSocket();
    if (!socket) return;
    const onQueueChange = () => { loadBranchAssignments(); loadStats(); };
    const onDeliveryChange = () => {
      const tabToFilter = { active: 'active', history: 'all' };
      const f = tabToFilter[activeTab];
      if (f) loadDeliveries(f);
      loadStats();
    };
    socket.on('delivery:assignment:new', onQueueChange);
    socket.on('delivery:queue:changed',  () => { onQueueChange(); onDeliveryChange(); });
    return () => {
      socket.off('delivery:assignment:new', onQueueChange);
      socket.off('delivery:queue:changed');
    };
  }, [isAuthenticated, canAccess, loadBranchAssignments, loadStats, loadDeliveries, activeTab]);

  /* ════════════════ Actions ════════════════ */

  const handleAccept = async (orderNumber, cardId) => {
    setAcceptingId(cardId);
    try {
      const res = await deliveryService.acceptBranchAssignment(orderNumber);
      if (res?.data?.success) {
        showToast(`Order #${orderNumber} accepted`, 'success');
        await Promise.all([loadBranchAssignments(), loadStats()]);
      } else { showToast(res?.data?.message || 'Failed to accept', 'error'); }
    } catch (e) { showToast(e.response?.data?.message || 'Error', 'error'); }
    finally { setAcceptingId(null); }
  };

  const openReassignModal = (orderNumber) => {
    setReassignModal({ orderNumber });
    setReassignBranchId('');
  };

  const handleReassign = async () => {
    if (!reassignModal?.orderNumber || !reassignBranchId) return;
    setReassigning(true);
    try {
      const res = await deliveryService.reassignOrderBranch(reassignModal.orderNumber, Number(reassignBranchId));
      if (res?.data?.success) {
        showToast(res.data.message || 'Reassigned to new branch', 'success');
        setReassignModal(null);
        await Promise.all([loadBranchAssignments(), loadStats()]);
      } else { showToast(res?.data?.message || 'Failed', 'error'); }
    } catch (e) { showToast(e.response?.data?.message || 'Error', 'error'); }
    finally { setReassigning(false); }
  };

  const openAssignBoyModal = async (item) => {
    setAssignBoyModal(item);
    setSelectedBoyId('');
    if (branchDrivers.length === 0) {
      setBoysLoading(true);
      try {
        const res = await deliveryService.getBranchResources(branchId || undefined);
        if (res?.data?.success) setBranchDrivers(res.data.data?.drivers || []);
      } catch {}
      finally { setBoysLoading(false); }
    }
  };

  const handleAssignBoy = async () => {    if (!assignBoyModal?.order_number || !selectedBoyId) {
      showToast('Please select a delivery boy', 'error');
      return;
    }
    setAssigningBoy(true);
    try {
      const res = await deliveryService.assignToDeliveryBoy(assignBoyModal.order_number, Number(selectedBoyId));
      if (res?.data?.success) {
        showToast(res.data.message || 'Assigned successfully', 'success');
        setAssignBoyModal(null);
        await Promise.all([loadBranchAssignments(), loadStats()]);
      } else { showToast(res?.data?.message || 'Failed', 'error'); }
    } catch (e) { showToast(e.response?.data?.message || 'Error', 'error'); }
    finally { setAssigningBoy(false); }
  };

  const handleStatClick = (filter) => {
    // Pending orders → branch assignment queue tab (not yet accepted)
    if (filter === 'pending-orders') {
      setActiveTab('queue');
      return;
    }
    // Accepted orders → accepted assignments tab (accepted, awaiting delivery boy)
    if (filter === 'accepted-orders') {
      setActiveTab('accepted');
      return;
    }
    if (statFilter === filter) {
      setStatFilter(null);
      setFilteredItems([]);
      return;
    }
    setStatFilter(filter);
    loadFilteredDeliveries(filter);
    setActiveTab('stats-filtered');
  };

  const clearStatFilter = () => {
    setStatFilter(null);
    setFilteredItems([]);
    if (activeTab === 'stats-filtered') setActiveTab('queue');
  };

  /* ════════════════ Auth Gates ════════════════ */
  if (!isAuthenticated) {
    return (
      <div className="dap-root">
        <div className="dap-auth-card">
          <Truck size={40} color="#388bfd"/>
          <h2>Delivery Admin</h2>
          <p>Please log in to access this panel.</p>
          <button className="dap-btn dap-btn-primary" onClick={onRequireAuth}>Login</button>
        </div>
      </div>
    );
  }
  if (!canAccess) {
    return (
      <div className="dap-root">
        <div className="dap-auth-card">
          <AlertCircle size={40} color="#f85149"/>
          <h2>Access Denied</h2>
          <p>You do not have permission to access this panel.</p>
        </div>
      </div>
    );
  }

  /* ════════════════ Nav Config ════════════════ */
  const navItems = [
    { id: 'queue',    label: 'Assigned Orders',   icon: <Bell size={15}/>,        badge: pendingAssignments.length || null, badgeCls: 'amber' },
    { id: 'accepted', label: 'Accepted Orders',   icon: <CheckCircle size={15}/>, badge: acceptedAssignments.length || null, badgeCls: 'blue' },
    { id: 'active',   label: 'Assigned to Boy',   icon: <Truck size={15}/>,       badge: null, badgeCls: '' },
    { id: 'history',  label: 'History',           icon: <History size={15}/>,     badge: null, badgeCls: '' },
    { id: 'routing',  label: 'Routing',           icon: <Route size={15}/>,       badge: null, badgeCls: '' },
    ...(statFilter ? [{ id: 'stats-filtered', label: `${statFilter}`, icon: <TrendingUp size={15}/>, badge: filteredItems.length||null, badgeCls: 'green', isFilter: true }] : []),
  ];

  const tabTitles = {
    queue:           'Assigned Orders',
    accepted:        'Accepted Orders',
    active:          'Assigned to Delivery Boys',
    history:         'Delivery History',
    routing:         'Route Management',
    'stats-filtered':'Filtered Analytics',
  };

  /* ════════════════ Render ════════════════ */
  return (
    <div className="dap-root" data-theme={theme}>

      {/* Sidebar */}
      <aside className="dap-sidebar">
        <div className="dap-sidebar-brand">
          <Truck size={20}/>
          <span>Delivery Admin</span>
        </div>
        <nav className="dap-nav">
          {navItems.map(t => (
            <button key={t.id}
              className={`dap-nav-item${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
              {t.badge ? <span className={`dap-nav-badge ${t.badgeCls}`}>{t.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="dap-sidebar-footer">
          <div className="dap-sf-user">{user?.username}</div>
          <div className="dap-sf-role">{user?.role?.replace('_', ' ')}</div>
          <button className="dap-logout-btn" onClick={logout}>
            <LogOut size={14}/> Sign Out
          </button>
        </div>
      </aside>

      <main className="dap-content">
        <div className="dap-content-header">
          <div>
            <h2>{tabTitles[activeTab]}</h2>
            <p className="dap-header-sub">
              {user?.username}
              {isSuperAdmin ? ' · Super Admin' : branchId ? ` · Branch ${branchId}` : ''}
            </p>
          </div>
          <div className="dap-header-right">
            <button className="dap-btn dap-btn-ghost dap-btn-sm" onClick={() => {
              loadBranchAssignments(); loadStats();
              const f = { active: 'active', delivered: 'delivered', returned: 'rejected' }[activeTab];
              if (f) loadDeliveries(f);
            }}>
              <RefreshCw size={14}/> Refresh
            </button>
            <div className="dap-profile-btn-wrap" ref={profileRef}>
              <button className="dap-profile-btn" onClick={() => setProfileOpen(o => !o)}>
                <div className="dap-profile-avatar">{user?.username?.[0]?.toUpperCase()}</div>
                <div>
                  <div className="dap-profile-name">{user?.username}</div>
                  <div className="dap-profile-role">{user?.role?.replace('_',' ')}</div>
                </div>
              </button>
              {profileOpen && (
                <div className="dap-profile-dropdown">
                  <div className="dap-dd-header">
                    <div className="dap-dd-name">{user?.username}</div>
                    <div className="dap-dd-role">{user?.role?.replace('_',' ')}</div>
                  </div>
                  <button className="dap-dd-item" onClick={() => setProfileOpen(false)}>
                    <User size={14}/> View Profile
                  </button>
                  <button className="dap-dd-item" onClick={() => { toggleTheme(); setProfileOpen(false); }}>
                    {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                  <button className="dap-dd-item" onClick={() => { setChangePwOpen(true); setProfileOpen(false); setCpError(''); setCpSuccess(''); }}>
                    <Lock size={14}/> Change Password
                  </button>
                  <hr className="dap-dd-divider"/>
                  <button className="dap-dd-item danger" onClick={() => { setProfileOpen(false); logout(); }}>
                    <LogOut size={14}/> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Date Filter Bar ─── */}
        <div className="dap-date-bar">
          <Calendar size={14} className="dap-date-bar-icon"/>
          <div className="dap-date-pills">
            {[['all','All Time'],['today','Today'],['month','This Month'],['custom','Custom']].map(([v,l]) => (
              <button key={v} className={`dap-date-pill${dateFilter===v?' active':''}`}
                onClick={() => { setDateFilter(v); if(v!=='custom'){setCustomFrom('');setCustomTo('');} }}>
                {l}
              </button>
            ))}
          </div>
          {dateFilter === 'custom' && (
            <div className="dap-custom-range">
              <input type="date" className="dap-date-input" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/>
              <span className="dap-date-sep">→</span>
              <input type="date" className="dap-date-input" value={customTo} onChange={e=>setCustomTo(e.target.value)}/>
            </div>
          )}
        </div>

        {/* ─── Stats strip ─── */}
        {(activeTab === 'queue' || activeTab === 'accepted' || activeTab === 'stats-filtered') && (
          <div className="dap-stats-row">
            <button className={`dap-stat-card pending dap-stat-btn${statFilter==='pending-orders'?' dap-stat-active':''}`}
              onClick={() => handleStatClick('pending-orders')}>
              <div className="stat-icon"><Bell size={15}/></div>
              <div className="stat-label">Pending</div>
              <div className="stat-value">{stats.pending}</div>
              {statFilter==='pending-orders' && <span className="dap-stat-active-pill">Active filter</span>}
            </button>
            <button className={`dap-stat-card accepted dap-stat-btn${statFilter==='accepted-orders'?' dap-stat-active':''}`}
              onClick={() => handleStatClick('accepted-orders')}>
              <div className="stat-icon"><CheckCircle size={15}/></div>
              <div className="stat-label">Accepted</div>
              <div className="stat-value">{stats.accepted}</div>
              {statFilter==='accepted-orders' && <span className="dap-stat-active-pill">Active filter</span>}
            </button>
            <button className={`dap-stat-card active dap-stat-btn${statFilter==='active'?' dap-stat-active':''}`}
              onClick={() => handleStatClick('active')}>
              <div className="stat-icon"><Activity size={15}/></div>
              <div className="stat-label">In Progress</div>
              <div className="stat-value">{stats.active}</div>
              {statFilter==='active' && <span className="dap-stat-active-pill">Active filter</span>}
            </button>
            <button className={`dap-stat-card done dap-stat-btn${statFilter==='delivered'?' dap-stat-active':''}`}
              onClick={() => handleStatClick('delivered')}>
              <div className="stat-icon"><CheckCircle size={15}/></div>
              <div className="stat-label">Delivered</div>
              <div className="stat-value">{stats.delivered}</div>
              {statFilter==='delivered' && <span className="dap-stat-active-pill">Active filter</span>}
            </button>
            <button className={`dap-stat-card rejected dap-stat-btn${statFilter==='rejected'?' dap-stat-active':''}`}
              onClick={() => handleStatClick('rejected')}>
              <div className="stat-icon"><XCircle size={15}/></div>
              <div className="stat-label">Rejected</div>
              <div className="stat-value">{stats.rejected}</div>
              {statFilter==='rejected' && <span className="dap-stat-active-pill">Active filter</span>}
            </button>
          </div>
        )}

        <div className="dap-content-body">

          {/* ══ NOTIFICATIONS (QUEUE) TAB ═══════════════════════════ */}
          {activeTab === 'queue' && (
            <div className="dap-section">
              <div className="dap-section-header">
                <h3><span className="dot dot-amber"/> Assigned Orders ({pendingAssignments.length})</h3>
                <span className="dap-section-note">Physically receive the product, then click Accept</span>
              </div>

              {queueLoading && <div className="dap-loading"><div className="dap-spinner"/> Loading…</div>}

              {!queueLoading && pendingAssignments.length === 0 && (
                <div className="dap-empty">
                  <Bell size={40}/>
                  <p>No new assignments</p>
                  <span>New orders will appear here when assigned to your branch.</span>
                </div>
              )}

              {!queueLoading && pendingAssignments.length > 0 && (
                <div className="dap-cards-grid">
                  {pendingAssignments.map(item => (
                    <div key={item.id} className="dap-order-card">
                      <div className="dap-order-card-top">
                        <span className="dap-order-number">#{item.order_number}</span>
                        <span className="dap-badge dap-badge-pending"><Clock size={10}/> Pending</span>
                      </div>
                      <OrderInfoCard item={item}/>
                      <div className="dap-order-card-actions">
                        <button
                          className="dap-btn dap-btn-success dap-btn-sm"
                          disabled={acceptingId === item.id}
                          onClick={() => handleAccept(item.order_number, item.id)}>
                          <CheckCircle size={13}/>
                          {acceptingId === item.id ? 'Accepting…' : 'Accept'}
                        </button>
                        <button
                          className="dap-btn dap-btn-warning dap-btn-sm"
                          onClick={() => openReassignModal(item.order_number)}>
                          <GitBranch size={13}/> Reassign Branch
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ ACCEPTED TAB ════════════════════════════════════════ */}
          {activeTab === 'accepted' && (
            <div className="dap-section">
              <div className="dap-section-header">
                <h3><span className="dot dot-blue"/> Accepted Orders ({acceptedAssignments.length})</h3>
                <span className="dap-section-note">Assign directly to a delivery boy or transfer to another branch</span>
              </div>

              {queueLoading && <div className="dap-loading"><div className="dap-spinner"/> Loading…</div>}

              {!queueLoading && acceptedAssignments.length === 0 && (
                <div className="dap-empty">
                  <Package size={40}/>
                  <p>No accepted orders awaiting dispatch</p>
                </div>
              )}

              {!queueLoading && acceptedAssignments.length > 0 && (
                <div className="dap-cards-grid">
                  {acceptedAssignments.map(item => (
                    <div key={item.id} className="dap-order-card">
                      <div className="dap-order-card-top">
                        <span className="dap-order-number">#{item.order_number}</span>
                        <span className="dap-badge dap-badge-accepted"><CheckCircle size={10}/> Accepted</span>
                      </div>
                      <OrderInfoCard item={item}/>
                      <div className="dap-order-card-actions">
                        <button
                          className="dap-btn dap-btn-primary dap-btn-sm"
                          onClick={() => openAssignBoyModal(item)}>
                          <Send size={13}/> Assign to Boy
                        </button>
                        <button
                          className="dap-btn dap-btn-warning dap-btn-sm"
                          onClick={() => openReassignModal(item.order_number)}>
                          <GitBranch size={13}/> Reassign Branch
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ ASSIGNED TO BOY (ACTIVE) TAB ════════════════════════ */}
          {activeTab === 'active' && (
            <>
              {deliveriesLoading && <div className="dap-loading"><div className="dap-spinner"/> Loading…</div>}

              {!deliveriesLoading && deliveries.length === 0 && (
                <div className="dap-empty">
                  <Truck size={40}/>
                  <p>No active deliveries</p>
                  <span>Orders assigned to delivery boys will appear here.</span>
                </div>
              )}

              {!deliveriesLoading && deliveries.length > 0 && (
                <div className="dap-table-wrap">
                  <table className="dap-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Delivery Boy</th>
                        <th>District / Thana</th>
                        <th>Destination</th>
                        <th>Status</th>
                        <th>Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map(d => (
                        <tr key={d.id}>
                          <td><strong className="dap-link">#{d.order_number}</strong></td>
                          <td>
                            <div>{d.customer_name || '—'}</div>
                            {d.customer_phone && <div className="dap-cell-sub"><Phone size={10}/> {d.customer_phone}</div>}
                            {d.receiver_mobile && d.receiver_mobile !== d.customer_phone && (
                              <div className="dap-cell-sub"><Phone size={10}/> রিসিভ: {d.receiver_mobile}</div>
                            )}
                          </td>
                          <td>
                            <div>{d.delivery_boy_name || '—'}</div>
                            {d.delivery_boy_phone && <div className="dap-cell-sub"><Phone size={10}/> {d.delivery_boy_phone}</div>}
                          </td>
                          <td>
                            {(d.district || d.upazila) ? (
                              <div className="dap-cell-sub">
                                {d.district && <div>জেলা: <strong>{d.district}</strong></div>}
                                {d.upazila  && <div>থানা: <strong>{d.upazila}</strong></div>}
                              </div>
                            ) : <span>—</span>}
                          </td>
                          <td>
                            {d.receiver_location && <div className="dap-cell-sub" style={{marginBottom:'2px'}}>প্রাপ্তি: {d.receiver_location}</div>}
                            <div className="dap-cell-sub"><MapPin size={10}/> {joinAddr(d.shipping_address, d.shipping_city, d.shipping_country)}</div>
                          </td>
                          <td><StatusBadge status={d.status}/></td>
                          <td className="dap-cell-sub">{fmtDate(d.assigned_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ══ HISTORY TAB (Delivered + Returned) ══════════════════ */}
          {activeTab === 'history' && (
            <>
              {deliveriesLoading && <div className="dap-loading"><div className="dap-spinner"/> Loading…</div>}

              {!deliveriesLoading && deliveries.length === 0 && (
                <div className="dap-empty">
                  <History size={40}/>
                  <p>No history yet</p>
                  <span>Completed and returned deliveries will appear here.</span>
                </div>
              )}

              {!deliveriesLoading && deliveries.length > 0 && (
                <div className="dap-table-wrap">
                  <table className="dap-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Delivery Boy</th>
                        <th>District / Thana</th>
                        <th>Destination</th>
                        <th>Result</th>
                        <th>Reason / Notes</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map(d => (
                        <tr key={d.id}>
                          <td><strong className="dap-link">#{d.order_number}</strong></td>
                          <td>
                            <div>{d.customer_name || '—'}</div>
                            {d.customer_phone && <div className="dap-cell-sub"><Phone size={10}/> {d.customer_phone}</div>}
                          </td>
                          <td>
                            <div>{d.delivery_boy_name || '—'}</div>
                            {d.delivery_boy_phone && <div className="dap-cell-sub"><Phone size={10}/> {d.delivery_boy_phone}</div>}
                          </td>
                          <td>
                            {(d.district || d.upazila) ? (
                              <div className="dap-cell-sub">
                                {d.district && <div>জেলা: <strong>{d.district}</strong></div>}
                                {d.upazila  && <div>থানা: <strong>{d.upazila}</strong></div>}
                              </div>
                            ) : <span>—</span>}
                          </td>
                          <td>
                            {d.receiver_location && <div className="dap-cell-sub" style={{marginBottom:'2px'}}>প্রাপ্তি: {d.receiver_location}</div>}
                            <div className="dap-cell-sub"><MapPin size={10}/> {joinAddr(d.shipping_address, d.shipping_city, d.shipping_country)}</div>
                          </td>
                          <td><StatusBadge status={d.status}/></td>
                          <td className="dap-cell-sub">{d.rejection_reason || '—'}</td>
                          <td className="dap-cell-sub">{fmtDate(d.delivered_at || d.assigned_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ══ STATS FILTERED TAB ══════════════════════════════════ */}
          {activeTab === 'stats-filtered' && (
            <div className="dap-section">
              <div className="dap-section-header">
                <h3><TrendingUp size={15}/> Filtered Deliveries
                  <span className="dap-filter-tag">{statFilter}</span>
                </h3>
                <button className="dap-btn dap-btn-ghost dap-btn-sm" onClick={clearStatFilter}>
                  <X size={12}/> Clear Filter
                </button>
              </div>
              {filteredLoading && <div className="dap-loading"><div className="dap-spinner"/> Loading…</div>}
              {!filteredLoading && filteredItems.length === 0 && (
                <div className="dap-empty"><Package size={40}/><p>No deliveries match this filter</p></div>
              )}
              {!filteredLoading && filteredItems.length > 0 && (
                <div className="dap-table-wrap">
                  <table className="dap-table">
                    <thead>
                      <tr>
                        <th>Order #</th><th>Customer</th><th>Delivery Boy</th>
                        <th>Destination</th><th>Status</th><th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(d => (
                        <tr key={d.id}>
                          <td><strong className="dap-link">#{d.order_number}</strong></td>
                          <td>
                            <div>{d.customer_name||'—'}</div>
                            {d.customer_phone&&<div className="dap-cell-sub"><Phone size={10}/>{d.customer_phone}</div>}
                          </td>
                          <td><div>{d.delivery_boy_name||'—'}</div></td>
                          <td><div className="dap-cell-sub"><MapPin size={10}/>{joinAddr(d.shipping_address,d.shipping_city,d.shipping_country)}</div></td>
                          <td><StatusBadge status={d.status}/></td>
                          <td className="dap-cell-sub">{fmtDate(d.delivered_at||d.assigned_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══ ROUTING TAB ═════════════════════════════════════════ */}
          {activeTab === 'routing' && (
            <div className="dap-routing-wrap">
              <RouteManagementPanel/>
            </div>
          )}

        </div>{/* end content-body */}
      </main>

      {/* ══════════ MODALS ══════════ */}

      {/* Reassign Branch Modal */}
      {reassignModal && (
        <div className="dap-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setReassignModal(null); }}>
          <div className="dap-modal">
            <div className="dap-modal-header">
              <h3><GitBranch size={16}/> Reassign to Another Branch</h3>
              <button className="dap-modal-close" onClick={() => setReassignModal(null)}><X size={16}/></button>
            </div>
            <div className="dap-modal-body">
              <p className="dap-modal-desc">
                Order <strong>#{reassignModal.orderNumber}</strong> will be transferred to another branch.
                That branch will receive a notification to accept and process the order.
              </p>
              <div className="dap-form-group">
                <label>Select Branch</label>
                <div className="dap-select-wrap">
                  <select className="dap-select" value={reassignBranchId} onChange={e => setReassignBranchId(e.target.value)}>
                    <option value="">— Select a branch —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="dap-select-icon"/>
                </div>
              </div>
            </div>
            <div className="dap-modal-footer">
              <button className="dap-btn dap-btn-ghost" onClick={() => setReassignModal(null)}>Cancel</button>
              <button className="dap-btn dap-btn-warning" onClick={handleReassign} disabled={!reassignBranchId || reassigning}>
                {reassigning ? 'Transferring…' : <><GitBranch size={13}/> Transfer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Boy Modal */}
      {assignBoyModal && (
        <div className="dap-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAssignBoyModal(null); }}>
          <div className="dap-modal">
            <div className="dap-modal-header">
              <h3><Send size={16}/> Assign to Delivery Boy</h3>
              <button className="dap-modal-close" onClick={() => setAssignBoyModal(null)}><X size={16}/></button>
            </div>
            <div className="dap-modal-body">
              {/* Order summary */}
              <div className="dap-assign-summary">
                <div className="das-order">#{assignBoyModal.order_number}</div>
                <div className="das-info">
                  <User size={12}/> <strong>{assignBoyModal.customer_name || '—'}</strong>
                  {assignBoyModal.customer_phone && <span> · {assignBoyModal.customer_phone}</span>}
                </div>
                <div className="das-info">
                  <MapPin size={12}/>
                  {joinAddr(assignBoyModal.shipping_address, assignBoyModal.shipping_city, assignBoyModal.shipping_country)}
                </div>
              </div>

              <div className="dap-form-group" style={{ marginTop: 16 }}>
                <label>Select Delivery Boy</label>
                {boysLoading ? (
                  <div className="dap-loading" style={{ padding: 12 }}><div className="dap-spinner"/> Loading drivers…</div>
                ) : branchDrivers.length === 0 ? (
                  <div className="dap-alert dap-alert-warning">
                    <AlertCircle size={13}/>
                    No active delivery boys found for your branch.
                    Please add delivery boys first.
                  </div>
                ) : (
                  <div className="dap-boy-list">
                    {branchDrivers.map(boy => (
                      <label key={boy.id} className={`dap-boy-item${selectedBoyId === String(boy.id) ? ' selected' : ''}`}>
                        <input
                          type="radio"
                          name="delivery_boy"
                          value={boy.id}
                          checked={selectedBoyId === String(boy.id)}
                          onChange={() => setSelectedBoyId(String(boy.id))}
                        />
                        <div className="dap-boy-avatar">{(boy.username || '?')[0].toUpperCase()}</div>
                        <div className="dap-boy-info">
                          <div className="dap-boy-name">{boy.username}</div>
                          <div className="dap-boy-phone">{boy.phone || 'No phone'}</div>
                        </div>
                        {selectedBoyId === String(boy.id) && <CheckCircle size={16} color="#3fb950"/>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="dap-modal-footer">
              <button className="dap-btn dap-btn-ghost" onClick={() => setAssignBoyModal(null)}>Cancel</button>
              <button
                className="dap-btn dap-btn-primary"
                onClick={handleAssignBoy}
                disabled={!selectedBoyId || assigningBoy || branchDrivers.length === 0}>
                {assigningBoy ? 'Assigning…' : <><Send size={13}/> Assign</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      {/* ── Change Password Modal ── */}
      {changePwOpen && (
        <div className="dap-modal-overlay" onClick={() => setChangePwOpen(false)}>
          <div className="dap-modal" onClick={e => e.stopPropagation()}>
            <div className="dap-modal-header">
              <Lock size={18}/>
              <h3>Change Password</h3>
              <button className="dap-modal-close" onClick={() => setChangePwOpen(false)}><X size={18}/></button>
            </div>
            <form className="dap-modal-body" onSubmit={handleChangePassword}>
              {cpError && (
                <div className="dap-cp-alert dap-cp-alert--error">
                  <AlertCircle size={14}/> {cpError}
                </div>
              )}
              {cpSuccess && (
                <div className="dap-cp-alert dap-cp-alert--success">{cpSuccess}</div>
              )}
              <div className="dap-cp-field">
                <label>Current Password</label>
                <div className="dap-cp-input-wrap">
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
              <div className="dap-cp-field">
                <label>New Password</label>
                <div className="dap-cp-input-wrap">
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
              <div className="dap-cp-field">
                <label>Confirm New Password</label>
                <div className="dap-cp-input-wrap">
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={changePwForm.confirm_password}
                    onChange={e => setChangePwForm(f => ({ ...f, confirm_password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="dap-modal-actions">
                <button type="button" className="dap-btn dap-btn--ghost" onClick={() => setChangePwOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dap-btn dap-btn--primary" disabled={changePwLoading}>
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

export default DeliveryAdminPanel;
