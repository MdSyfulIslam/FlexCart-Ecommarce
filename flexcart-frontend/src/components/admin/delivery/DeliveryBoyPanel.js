import React, { useContext, useEffect, useState, useCallback } from 'react';
import {
  Truck, CheckCircle, Clock, Camera, MapPin, Package, User, Phone,
  ArrowRight, RefreshCw, LogIn, History, X, AlertCircle, Box,
  ChevronRight, Navigation, Image, XCircle, BarChart2,
  LogOut, AlertTriangle, Calendar, Sun, Moon, Filter, Lock, Eye, EyeOff,
  Banknote, CheckCircle2, Wallet
} from 'lucide-react';
import { AuthContext } from '../../../context/AuthContext';
import deliveryService from '../../../services/deliveryService';
import api from '../../../services/api';
import { connectSocket } from '../../../services/socketService';
import './DeliveryBoyPanel.css';

/* ─── Admin Theme Hook ─── */
const useAdminTheme = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin_theme') || 'dark');
  const toggle = () => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark';
    localStorage.setItem('admin_theme', next);
    return next;
  });
  return [theme, toggle];
};

/* ─── Date range helper ─── */
const buildDateParams = (dateFilter, customFrom, customTo) => {
  const today = new Date().toISOString().split('T')[0];
  if (dateFilter === 'today') return { from_date: today, to_date: today };
  if (dateFilter === 'month') {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    return { from_date: from, to_date: today };
  }
  if (dateFilter === 'custom' && customFrom) return { from_date: customFrom, to_date: customTo || today };
  return {};
};

/* ─── Stat Card ─── */
const StatCard = ({ label, value, icon: Icon, color, bg, active, onClick }) => (
  <button className={`dbp-stat-card${active ? ' dbp-stat-card--active' : ''}`}
    style={{ '--card-color': color }} onClick={onClick}>
    <div className="dbp-stat-icon" style={{ background: bg, color }}>
      <Icon size={20} />
    </div>
    <div className="dbp-stat-body">
      <div className="dbp-stat-value">{value ?? '—'}</div>
      <div className="dbp-stat-label">{label}</div>
    </div>
    {active && <span className="dbp-stat-active-pill" style={{ background: color }}>Active filter</span>}
  </button>
);

/* ─── Status Chip ─── */
const StatusChip = ({ status }) => {
  const map = {
    assigned:         { cls: 'chip-amber',  label: 'Assigned' },
    in_transit:       { cls: 'chip-blue',   label: 'In Transit' },
    out_for_delivery: { cls: 'chip-indigo', label: 'Out for Delivery' },
    delivered:        { cls: 'chip-green',  label: 'Delivered' },
    rejected:         { cls: 'chip-red',    label: 'Not Delivered' },
  };
  const c = map[status] || { cls: 'chip-gray', label: status };
  return <span className={`dbp-chip ${c.cls}`}>{c.label}</span>;
};

const DeliveryBoyPanel = ({ onRequireAuth }) => {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  const [theme, toggleTheme] = useAdminTheme();

  /* ─── Change Password state ─── */
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [changePwForm, setChangePwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [cpShowOld, setCpShowOld] = useState(false);
  const [cpShowNew, setCpShowNew] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');

  /* ─── View state ─── */
  const [view, setView] = useState('active'); // 'active' | 'history' | 'filtered'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [history, setHistory] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [statFilter, setStatFilter] = useState(null); // 'total'|'delivered'|'rejected'|'pending'

  /* ─── Date filter ─── */
  const [dateFilter, setDateFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  /* ─── Action state ─── */
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const canAccess = user?.role === 'delivery_boy';
  const apiBase = (process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000');

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const getDateParams = useCallback(() => buildDateParams(dateFilter, customFrom, customTo),
    [dateFilter, customFrom, customTo]);

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

  /* ─── Loaders ─── */
  const loadStats = useCallback(async () => {
    try {
      const res = await deliveryService.getDriverStats(getDateParams());
      if (res.data.success) setStats(res.data.data);
    } catch {}
  }, [getDateParams]);

  const loadAssignments = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await deliveryService.getDriverAssignments(getDateParams());
      if (res.data.success) setAssignments(res.data.data || []);
      else { setAssignments([]); setError(res.data.message || 'Failed to load assignments'); }
    } catch (e) {
      setAssignments([]); setError(e.response?.data?.message || 'Failed to load');
    } finally { setLoading(false); }
  }, [getDateParams]);

  const loadHistory = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await deliveryService.getDriverHistory(getDateParams());
      if (res.data.success) setHistory(res.data.data || []);
      else { setHistory([]); setError(res.data.message || 'Failed to load history'); }
    } catch (e) {
      setHistory([]); setError(e.response?.data?.message || 'Failed to load');
    } finally { setLoading(false); }
  }, [getDateParams]);

  const loadFiltered = useCallback(async (sf) => {
    setFilteredLoading(true); setError('');
    try {
      const params = { status_filter: sf, ...getDateParams() };
      const res = await deliveryService.getDriverAllDeliveries(params);
      if (res.data.success) setFilteredItems(res.data.data || []);
      else setFilteredItems([]);
    } catch { setFilteredItems([]); }
    finally { setFilteredLoading(false); }
  }, [getDateParams]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), view === 'history' ? loadHistory() : loadAssignments()]);
  }, [loadStats, loadHistory, loadAssignments, view]);

  /* ─── Effects ─── */
  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    loadStats();
    if (view === 'history') loadHistory();
    else if (view === 'filtered' && statFilter) loadFiltered(statFilter);
    else loadAssignments();
  }, [isAuthenticated, canAccess, view]); // eslint-disable-line

  // Re-fetch on date filter change
  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    loadStats();
    if (view === 'history') loadHistory();
    else if (view === 'filtered' && statFilter) loadFiltered(statFilter);
    else loadAssignments();
  }, [dateFilter, customFrom, customTo]); // eslint-disable-line

  useEffect(() => {
    if (!isAuthenticated || !canAccess) return;
    const socket = connectSocket();
    if (!socket) return;
    const onNew = () => refreshAll();
    socket.on('delivery:new:assignment', onNew);
    return () => socket.off('delivery:new:assignment', onNew);
  }, [isAuthenticated, canAccess, refreshAll]);

  /* ─── Stat card click ─── */
  const handleStatClick = (filter) => {
    if (statFilter === filter && view === 'filtered') {
      // Toggle off — go back to active
      setStatFilter(null); setView('active'); setSelected(null);
      loadAssignments();
      return;
    }
    setStatFilter(filter); setView('filtered'); setSelected(null);
    loadFiltered(filter);
  };

  /* ─── Delivery actions ─── */
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleComplete = async () => {
    if (!selected) return;
    setSubmitting(true); setMsg({ text: '', type: '' });
    try {
      const formData = new FormData();
      formData.append('orderNumber', selected.order_number);
      if (photo) formData.append('proof_photo', photo);
      try {
        const pos = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('not supported'));
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
        });
        formData.append('lat', String(pos.coords.latitude));
        formData.append('lng', String(pos.coords.longitude));
      } catch {}
      const res = await deliveryService.completeDelivery(formData);
      if (!res.data.success) { showMsg(res.data.message || 'Failed to complete delivery', 'error'); return; }
      showMsg(`Order #${selected.order_number} marked as delivered!`);
      setSelected(null); setPhoto(null); setPhotoPreview(null);
      await refreshAll();
    } catch (e) {
      showMsg(e.response?.data?.message || e.message || 'Failed to complete', 'error');
    } finally { setSubmitting(false); }
  };

  const openRejectModal = () => { setRejectReason(''); setShowRejectModal(true); };

  const handleReject = async () => {
    if (!rejectReason.trim()) { showMsg('Please provide a reason', 'error'); return; }
    setRejecting(true);
    try {
      const res = await deliveryService.rejectDelivery(selected.order_number, rejectReason.trim());
      if (!res.data.success) { showMsg(res.data.message || 'Failed', 'error'); return; }
      showMsg(`Order #${selected.order_number} marked as not delivered.`);
      setShowRejectModal(false); setSelected(null);
      await refreshAll();
    } catch (e) {
      showMsg(e.response?.data?.message || 'Failed to submit', 'error');
    } finally { setRejecting(false); }
  };

  /* ─── Auth gates ─── */
  if (!isAuthenticated) {
    return (
      <div className="dbp-root" data-theme={theme}>
        <div className="dbp-auth-card">
          <div className="dbp-auth-icon"><Truck size={44} /></div>
          <h2>Delivery Boy Panel</h2>
          <p>Please log in to view your assigned deliveries.</p>
          <button className="dbp-btn dbp-btn--primary" onClick={onRequireAuth}>
            <LogIn size={16} /> Login
          </button>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="dbp-root" data-theme={theme}>
        <div className="dbp-auth-card">
          <div className="dbp-auth-icon dbp-auth-icon--danger"><AlertCircle size={44} /></div>
          <h2>Access Denied</h2>
          <p>This panel is for Delivery Boys only.</p>
        </div>
      </div>
    );
  }

  const currentList = view === 'filtered' ? filteredItems
    : view === 'history' ? history : assignments;
  const currentLoading = view === 'filtered' ? filteredLoading : loading;

  const statFilterLabels = {
    total: 'All Deliveries', delivered: 'Delivered',
    rejected: 'Not Delivered', pending: 'Pending'
  };

  return (
    <div className="dbp-root" data-theme={theme}>

      {/* ─── Header ─── */}
      <header className="dbp-header">
        <div className="dbp-header-left">
          <div className="dbp-header-icon-wrap"><Truck size={22} /></div>
          <div>
            <h1>Delivery Panel</h1>
            <span className="dbp-header-sub">{user?.username}</span>
          </div>
        </div>
        <div className="dbp-header-right">
          <button className="dbp-icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="dbp-icon-btn"
            onClick={() => { setChangePwOpen(true); setCpError(''); setCpSuccess(''); }}
            title="Change Password"
          >
            <Lock size={16} />
          </button>
          <button className="dbp-btn dbp-btn--ghost" onClick={logout}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </header>

      {/* ─── Date Filter Bar ─── */}
      <div className="dbp-date-bar">
        <Calendar size={14} className="dbp-date-bar-icon" />
        <div className="dbp-date-pills">
          {['all', 'today', 'month', 'custom'].map(f => (
            <button key={f}
              className={`dbp-date-pill${dateFilter === f ? ' active' : ''}`}
              onClick={() => { setDateFilter(f); if (f !== 'custom') { setCustomFrom(''); setCustomTo(''); } }}>
              {f === 'all' ? 'All Time' : f === 'today' ? 'Today' : f === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="dbp-custom-range">
            <input type="date" className="dbp-date-input" value={customFrom}
              onChange={e => setCustomFrom(e.target.value)} />
            <span className="dbp-date-sep">→</span>
            <input type="date" className="dbp-date-input" value={customTo}
              onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {/* ─── Analytics Cards ─── */}
      <div className="dbp-stats-grid">
        <StatCard label="Total Assigned" value={stats?.total} icon={BarChart2}
          color="#6366f1" bg="rgba(99,102,241,.15)"
          active={statFilter === 'total' && view === 'filtered'}
          onClick={() => handleStatClick('total')} />
        <StatCard label="Delivered" value={stats?.delivered} icon={CheckCircle}
          color="#10b981" bg="rgba(16,185,129,.15)"
          active={statFilter === 'delivered' && view === 'filtered'}
          onClick={() => handleStatClick('delivered')} />
        <StatCard label="Not Delivered" value={stats?.rejected} icon={XCircle}
          color="#ef4444" bg="rgba(239,68,68,.12)"
          active={statFilter === 'rejected' && view === 'filtered'}
          onClick={() => handleStatClick('rejected')} />
        <StatCard label="Pending" value={stats?.pending} icon={Clock}
          color="#f59e0b" bg="rgba(245,158,11,.12)"
          active={statFilter === 'pending' && view === 'filtered'}
          onClick={() => handleStatClick('pending')} />
      </div>

      {/* ─── Global message ─── */}
      {msg.text && (
        <div className={`dbp-msg ${msg.type === 'error' ? 'dbp-msg--error' : 'dbp-msg--success'}`}>
          {msg.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
          {msg.text}
          <button onClick={() => setMsg({ text: '', type: '' })}><X size={14} /></button>
        </div>
      )}
      {error && (
        <div className="dbp-msg dbp-msg--error"><AlertCircle size={15} />{error}</div>
      )}

      {/* ─── Tab Bar ─── */}
      <div className="dbp-tabs">
        <button className={`dbp-tab ${view === 'active' ? 'dbp-tab--active' : ''}`}
          onClick={() => { setView('active'); setSelected(null); setStatFilter(null); }}>
          <Truck size={15} /> Active
          {assignments.length > 0 && <span className="dbp-tab-badge">{assignments.length}</span>}
        </button>
        <button className={`dbp-tab ${view === 'history' ? 'dbp-tab--active' : ''}`}
          onClick={() => { setView('history'); setSelected(null); setStatFilter(null); }}>
          <History size={15} /> History
        </button>
        {view === 'filtered' && statFilter && (
          <button className="dbp-tab dbp-tab--active dbp-tab--filter">
            <Filter size={13} /> {statFilterLabels[statFilter]}
            <button className="dbp-tab-filter-close"
              onClick={() => { setStatFilter(null); setView('active'); setSelected(null); }}>
              <X size={11} />
            </button>
          </button>
        )}
        <button className="dbp-tab-refresh"
          onClick={() => {
            if (view === 'history') loadHistory();
            else if (view === 'filtered' && statFilter) loadFiltered(statFilter);
            else refreshAll();
          }}
          disabled={loading || filteredLoading}>
          <RefreshCw size={15} className={(loading || filteredLoading) ? 'dbp-spin' : ''} />
        </button>
      </div>

      {/* ─── Body ─── */}
      <div className="dbp-body">

        {/* Left: list */}
        <div className="dbp-list-pane">
          {currentLoading ? (
            <div className="dbp-loading"><RefreshCw size={24} className="dbp-spin" /><p>Loading…</p></div>
          ) : currentList.length === 0 ? (
            <div className="dbp-empty">
              <Truck size={36} />
              <p>{view === 'history' ? 'No delivery history yet.'
                : view === 'filtered' ? `No ${statFilterLabels[statFilter]?.toLowerCase()} orders${dateFilter !== 'all' ? ' in this period' : ''}.`
                : 'No active deliveries assigned to you.'}</p>
            </div>
          ) : (
            currentList.map(a => (
              <button key={a.id}
                className={`dbp-delivery-card${selected?.id === a.id ? ' dbp-delivery-card--active' : ''}`}
                onClick={() => { setSelected(a); setPhoto(null); setPhotoPreview(null); setMsg({ text: '', type: '' }); }}>
                <div className="dbp-card-top">
                  <span className="dbp-order-num">#{a.order_number}</span>
                  <StatusChip status={a.status} />
                </div>
                {(a.customer_name || a.customer_phone) && (
                  <div className="dbp-card-customer">
                    <User size={11} /> <span>{a.customer_name}</span>
                    {a.customer_phone && <><Phone size={11}/> <span>{a.customer_phone}</span></>}
                  </div>
                )}
                <div className="dbp-card-route">
                  <MapPin size={12} />
                  <span>{a.from_branch_name}</span>
                  <ArrowRight size={12} />
                  <span>{a.to_branch_name}</span>
                </div>
                {a.delivery_type === 'branch_to_branch_address' && (a.district || a.upazila || a.shipping_address || a.receiver_location) && (
                  <div className="dbp-card-addr">
                    <Navigation size={11} />
                    {a.district && <span>জেলা: {a.district}</span>}
                    {a.upazila  && <span style={{marginLeft:'4px'}}>থানা: {a.upazila}</span>}
                    {a.receiver_location && <span style={{marginLeft:'4px',opacity:0.8}}>{a.receiver_location}</span>}
                  </div>
                )}
                <div className="dbp-card-time">
                  <Clock size={11} />
                  {(a.delivered_at || a.assigned_at)
                    ? new Date(a.delivered_at || a.assigned_at).toLocaleString()
                    : '—'}
                </div>
                <ChevronRight size={14} className="dbp-card-arrow" />
              </button>
            ))
          )}
        </div>

        {/* Right: detail + actions */}
        <div className="dbp-detail-pane">
          {!selected ? (
            <div className="dbp-empty">
              <Package size={36} />
              <p>Select a delivery to view details{view === 'active' ? ' and take action' : ''}.</p>
            </div>
          ) : (
            <>
              <div className="dbp-detail-header">
                <h3>Order #{selected.order_number}</h3>
                <StatusChip status={selected.status} />
              </div>

              <div className="dbp-detail-grid">
                {(selected.customer_name || selected.customer_phone) && (
                  <div className="dbp-detail-row dbp-detail-row--highlight">
                    <User size={14} /><span>Customer</span>
                    <strong>{selected.customer_name || '—'}</strong>
                  </div>
                )}
                {selected.customer_phone && (
                  <div className="dbp-detail-row">
                    <Phone size={14} /><span>Phone</span>
                    <a href={`tel:${selected.customer_phone}`} className="dbp-link">{selected.customer_phone}</a>
                  </div>
                )}
                <div className="dbp-detail-row">
                  <MapPin size={14} /><span>Route</span>
                  <strong>{selected.from_branch_name} → {selected.to_branch_name}</strong>
                </div>
                {selected.delivery_type === 'branch_to_branch_address' && (
                  <>
                    {(selected.district || selected.upazila) && (
                      <div className="dbp-detail-row">
                        <MapPin size={14}/><span>জেলা / থানা</span>
                        <strong>
                          {[selected.district && `জেলা: ${selected.district}`, selected.upazila && `থানা: ${selected.upazila}`].filter(Boolean).join('  •  ')}
                        </strong>
                      </div>
                    )}
                    {selected.receiver_location && (
                      <div className="dbp-detail-row">
                        <Navigation size={14}/><span>প্রাপ্তি লোকেশন</span>
                        <strong>{selected.receiver_location}</strong>
                      </div>
                    )}
                    <div className="dbp-detail-row">
                      <Navigation size={14}/><span>Deliver To</span>
                      <strong>{[selected.shipping_address, selected.shipping_city, selected.shipping_country, selected.shipping_zip].filter(Boolean).join(', ')}</strong>
                    </div>
                    {selected.receiver_mobile && (
                      <div className="dbp-detail-row">
                        <Phone size={14}/><span>রিসিভার ফোন</span>
                        <a href={`tel:${selected.receiver_mobile}`} className="dbp-link">{selected.receiver_mobile}</a>
                      </div>
                    )}
                  </>
                )}
                <div className="dbp-detail-row">
                  <Truck size={14} /><span>Vehicle</span>
                  <strong>{selected.vehicle_plate || '—'}</strong>
                </div>
                {selected.delivered_at && (
                  <div className="dbp-detail-row">
                    <Clock size={14} /><span>Delivered At</span>
                    <strong>{new Date(selected.delivered_at).toLocaleString()}</strong>
                  </div>
                )}
                {selected.proof_image_url && (
                  <div className="dbp-detail-row">
                    <Image size={14} /><span>Proof Photo</span>
                    <a href={`${apiBase}${selected.proof_image_url}`} target="_blank" rel="noreferrer" className="dbp-link">
                      View Photo
                    </a>
                  </div>
                )}
                {selected.proof_notes && (
                  <div className="dbp-detail-row">
                    <Box size={14} /><span>Notes</span>
                    <strong>{selected.proof_notes}</strong>
                  </div>
                )}
                {selected.payment_method === 'cash_on_delivery' && (() => {
                  const advance = parseFloat(selected.cod_advance_paid || 0);
                  const total = parseFloat(selected.total_amount || 0);
                  const remaining = Math.max(0, total - advance);
                  return (
                    <>
                      <div className="dbp-detail-row dbp-detail-row--highlight">
                        <Banknote size={16} /><span>Payment</span>
                        <strong style={{ color: '#10b981' }}>Cash on Delivery</strong>
                      </div>
                      {advance > 0 && (
                        <div className="dbp-detail-row">
                          <CheckCircle2 size={16} /><span>Advance Paid</span>
                          <strong style={{ color: '#10b981' }}>৳{advance.toFixed(2)}</strong>
                        </div>
                      )}
                      <div className="dbp-detail-row">
                        <Wallet size={16} />
                        <span>{advance > 0 ? 'Collect on Delivery' : 'Total to Collect'}</span>
                        <strong style={{ color: '#f59e0b', fontSize: '1.05rem' }}>৳{remaining.toFixed(2)}</strong>
                      </div>
                    </>
                  );
                })()}
                {selected.status === 'rejected' && selected.rejection_reason && (
                  <div className="dbp-detail-row dbp-detail-row--danger">
                    <AlertTriangle size={14} /><span>Not Delivered Reason</span>
                    <strong>{selected.rejection_reason}</strong>
                  </div>
                )}
              </div>

              {(view === 'active' || view === 'filtered') &&
               ['assigned', 'in_transit', 'out_for_delivery'].includes(selected.status) && (
                <div className="dbp-complete-section">
                  <h4><Camera size={15} /> Mark Delivery Result</h4>
                  <p className="dbp-complete-hint">Optionally upload a proof photo. GPS is captured automatically.</p>

                  <label className="dbp-upload-zone">
                    {photoPreview
                      ? <img src={photoPreview} alt="proof" className="dbp-photo-preview" />
                      : <>
                        <Camera size={28} />
                        <span>Tap to upload proof photo</span>
                        <span className="dbp-upload-hint">Optional but recommended</span>
                      </>
                    }
                    <input type="file" accept="image/*" capture="environment"
                      onChange={handlePhotoChange} style={{ display: 'none' }} />
                  </label>

                  {photoPreview && (
                    <button className="dbp-btn dbp-btn--ghost dbp-btn--sm"
                      onClick={() => { setPhoto(null); setPhotoPreview(null); }}>
                      <X size={13} /> Remove photo
                    </button>
                  )}

                  <div className="dbp-action-btns">
                    <button className="dbp-btn dbp-btn--success dbp-btn--flex"
                      onClick={handleComplete} disabled={submitting}>
                      {submitting
                        ? <><RefreshCw size={16} className="dbp-spin" /> Submitting…</>
                        : <><CheckCircle size={16} /> Delivered</>}
                    </button>
                    <button className="dbp-btn dbp-btn--danger dbp-btn--flex"
                      onClick={openRejectModal} disabled={submitting}>
                      <XCircle size={16} /> Not Delivered
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Reject Modal ─── */}
      {showRejectModal && (
        <div className="dbp-modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="dbp-modal" onClick={e => e.stopPropagation()}>
            <div className="dbp-modal-header">
              <AlertTriangle size={20} className="dbp-modal-icon--danger" />
              <h3>Not Delivered</h3>
              <button onClick={() => setShowRejectModal(false)}><X size={18} /></button>
            </div>
            <p className="dbp-modal-desc">
              Order <strong>#{selected?.order_number}</strong> could not be delivered.<br />
              Please enter the reason — the admin and customer will be notified.
            </p>
            <textarea
              className="dbp-modal-textarea"
              placeholder="Reason (e.g. Customer not home, Wrong address, Refused delivery)…"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
            />
            <div className="dbp-modal-actions">
              <button className="dbp-btn dbp-btn--ghost" onClick={() => setShowRejectModal(false)}>
                Cancel
              </button>
              <button className="dbp-btn dbp-btn--danger"
                onClick={handleReject} disabled={rejecting || !rejectReason.trim()}>
                {rejecting
                  ? <><RefreshCw size={14} className="dbp-spin" /> Submitting…</>
                  : <><XCircle size={14} /> Confirm Not Delivered</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {changePwOpen && (
        <div className="dbp-modal-overlay" onClick={() => setChangePwOpen(false)}>
          <div className="dbp-modal" onClick={e => e.stopPropagation()}>
            <div className="dbp-modal-header">
              <Lock size={20} className="dbp-modal-icon" />
              <h3>Change Password</h3>
              <button onClick={() => setChangePwOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleChangePassword} style={{ padding: '0 20px 20px' }}>
              {cpError && (
                <div className="dbp-cp-alert dbp-cp-alert--error">
                  <AlertCircle size={14} /> {cpError}
                </div>
              )}
              {cpSuccess && (
                <div className="dbp-cp-alert dbp-cp-alert--success">
                  {cpSuccess}
                </div>
              )}
              <div className="dbp-cp-field">
                <label>Current Password</label>
                <div className="dbp-cp-input-wrap">
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
              <div className="dbp-cp-field">
                <label>New Password</label>
                <div className="dbp-cp-input-wrap">
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
              <div className="dbp-cp-field">
                <label>Confirm New Password</label>
                <div className="dbp-cp-input-wrap">
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={changePwForm.confirm_password}
                    onChange={e => setChangePwForm(f => ({ ...f, confirm_password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="dbp-btn dbp-btn--ghost" onClick={() => setChangePwOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dbp-btn dbp-btn--primary" disabled={changePwLoading}>
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

export default DeliveryBoyPanel;