import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../../../context/AuthContext';
import adminService from '../../../services/adminService';
import api from '../../../services/api';
import { getImageUrl } from '../../../utils/helpers';
import {
  LayoutDashboard, GitBranch, Users, Truck, ShoppingCart,
  UserCheck, Package, BarChart2, MessageSquare, LogOut, Menu, X,
  Plus, Pencil, Trash2, CheckCircle, XCircle, PauseCircle, PlayCircle,
  Search, RefreshCcw, ChevronDown, Building2, CreditCard,
  AlertCircle, ShieldCheck, Shield, Eye, EyeOff, Lock, ChevronRight, TrendingUp,
  Clock, User, Activity, MapPin, ArrowRight,
  DollarSign, Phone, Ban, Navigation, Sun, Moon
} from 'lucide-react';
import './StaffAdminPanel.css';

/* ─── Mini bar chart ─── */
const BarChart = ({ data, xKey, yKey, color = '#10b981', prefix = '' }) => {
  if (!data?.length) return <p className="sap-empty-chart">No data available</p>;
  const max = Math.max(...data.map(d => Number(d[yKey]) || 0), 1);
  return (
    <div className="sap-chart">
      {data.map((item, i) => {
        const pct = Math.round((Number(item[yKey]) / max) * 100);
        return (
          <div key={i} className="sap-chart-col">
            <div className="sap-chart-bar-wrap">
              <div className="sap-chart-bar" style={{ height: `${pct}%`, background: color }} />
            </div>
            <div className="sap-chart-val">{prefix}{Number(item[yKey]||0).toFixed(0)}</div>
            <div className="sap-chart-lbl">{String(item[xKey]).slice(-5)}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── KPI Card ─── */
const KPI = ({ label, value, icon: Icon, color }) => (
  <div className="sap-kpi">
    <div className="sap-kpi-icon" style={{ background: color + '20', color }}>
      <Icon size={20} />
    </div>
    <div>
      <div className="sap-kpi-val">{value ?? '—'}</div>
      <div className="sap-kpi-lbl">{label}</div>
    </div>
  </div>
);

/* ─── Status badge ─── */
const Badge = ({ status }) => {
  const map = {
    active:         ['sap-badge--green',  'Active'],
    approved:       ['sap-badge--green',  'Approved'],
    inactive:       ['sap-badge--gray',   'Inactive'],
    pending:        ['sap-badge--yellow', 'Pending'],
    rejected:       ['sap-badge--red',    'Rejected'],
    suspended:      ['sap-badge--red',    'Suspended'],
    delivered:      ['sap-badge--green',  'Delivered'],
    paid:           ['sap-badge--green',  'Paid'],
    processing:     ['sap-badge--blue',   'Processing'],
    shipped:        ['sap-badge--blue',   'Shipped'],
    in_transit:     ['sap-badge--blue',   'In Transit'],
    cancelled:      ['sap-badge--red',    'Cancelled'],
    refunded:       ['sap-badge--gray',   'Refunded'],
    assigned:       ['sap-badge--purple', 'Assigned'],
  };
  const [cls, label] = map[status] || ['sap-badge--gray', status];
  return <span className={`sap-badge ${cls}`}>{label}</span>;
};

const TABS = [
  { id: 'dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'verifications', label: 'Verifications',  icon: ShieldCheck },
  { id: 'personnel',     label: 'Personnel',      icon: Users },
  { id: 'vehicles',      label: 'Vehicles',       icon: Truck },
  { id: 'orders',        label: 'Orders',         icon: ShoppingCart },
  { id: 'customers',     label: 'Customers',      icon: UserCheck },
  { id: 'products',      label: 'Products',       icon: Package },
  { id: 'analytics',     label: 'Analytics',      icon: BarChart2 },
  { id: 'logs',          label: 'Activity Logs',  icon: Activity },
  { id: 'feedback',      label: 'Feedback',       icon: MessageSquare },
];

const ACTION_LABELS = {
  created_branch:        'Created Branch',
  updated_branch:        'Updated Branch',
  deleted_branch:        'Deleted Branch',
  created_delivery_admin:'Created Delivery Admin',
  created_delivery_boy:  'Created Delivery Boy',
  updated_personnel:     'Updated Personnel',
  paused_personnel:      'Paused Personnel',
  activated_personnel:   'Activated Personnel',
  deleted_personnel:     'Deleted Personnel',
  created_vehicle:       'Added Vehicle',
  updated_vehicle:       'Updated Vehicle',
  deleted_vehicle:       'Deleted Vehicle',
  updated_order_status:  'Updated Order Status',
  assigned_delivery:     'Assigned Delivery',
  assigned_branch_to_order: 'Assigned Branch to Order',
  cancelled_delivery_assignment: 'Cancelled Delivery',
  approved_company_verification: 'Approved Company',
  rejected_company_verification: 'Rejected Company',
  activated_product:     'Activated Product',
  deactivated_product:   'Deactivated Product',
};

/* ─── Theme hook ─── */
const useAdminTheme = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin_theme') || 'dark');
  const toggle = () => setTheme(t => { const n = t === 'dark' ? 'light' : 'dark'; localStorage.setItem('admin_theme', n); return n; });
  return [theme, toggle];
};

/* ══════════════════════════════════════════════════════════════ */
const StaffAdminPanel = ({ onRequireAuth }) => {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  const [theme, toggleTheme] = useAdminTheme();
  const [tab, setTab]       = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast]   = useState({ msg: '', type: '' });
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [changePwForm, setChangePwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [cpShowOld, setCpShowOld] = useState(false);
  const [cpShowNew, setCpShowNew] = useState(false);
  const profileRef = useRef();

  useEffect(() => {
    const handler = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Tab state */
  const [stats, setStats]   = useState(null);
  const [branches, setBranches] = useState([]);

  const [personnel, setPersonnel] = useState([]);
  const [pForm, setPForm] = useState({ username:'', email:'', password:'', role:'delivery_boy', branchId:'', phone:'', salary:'' });
  const [pFilter, setPFilter] = useState({ branchId:'', role:'' });
  const [editPersonnelModal, setEditPersonnelModal] = useState(null);
  const [editPForm, setEditPForm] = useState({ username:'', phone:'', branchId:'', salary:'', password:'' });

  const [vehicles, setVehicles] = useState([]);
  const [vForm, setVForm] = useState({
    plateNumber: '', vehicleType: 'bike', branchId: '',
    routeFromBranchId: '', routeToBranchId: '', viaBranchIds: [],
    driverName: '', driverPhone: ''
  });
  const [editVehicle, setEditVehicle] = useState(null);
  const [editVForm, setEditVForm] = useState({});

  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState({ status:'', search:'' });

  /* Delivery assignment modal */
  const [assignModal, setAssignModal] = useState(null);
  const [aForm, setAForm] = useState({
    fromBranchId:'', toBranchId:'', deliveryType:'branch_to_branch',
    destAddr:'', weight:'', sizeFeet:1, packaging:'standard',
    deliveryBoyId:'', vehiclePlate:''
  });
  const [aBoys, setABoys] = useState([]);
  const [aVehicles, setAVehicles] = useState([]);
  const [assigning, setAssigning] = useState(false);

  /* Branch assignment modal */
  const [assignBranchModal, setAssignBranchModal] = useState(null);
  const [bForm, setBForm] = useState({ branchId: '' });
  const [branchAssigning, setBranchAssigning] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState('');

  const [products, setProducts] = useState([]);
  const [prodFilter, setProdFilter] = useState({ status:'', search:'' });

  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState('monthly');

  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState({ days: 30 });

  const [feedback, setFeedback] = useState([]);
  const [warnModal, setWarnModal] = useState(null);
  const [warnReason, setWarnReason] = useState('');

  /* Verifications */
  const [verifications, setVerifications]   = useState([]);
  const [verFilter, setVerFilter]           = useState('pending');
  const [pendingCount, setPendingCount]     = useState(0);
  const [approvedCount, setApprovedCount]   = useState(0);
  const [rejectedCount, setRejectedCount]   = useState(0);
  const [selectedVer, setSelectedVer]       = useState(null);
  const [lightboxImg, setLightboxImg]       = useState(null);
  const [rejectReason, setRejectReason]     = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget]     = useState(null);

  const canAccess = user?.role === 'staff_admin' || user?.role === 'super_admin';

  const notify = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:'', type:'' }), 3500);
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

  const errMsg = (e) => {
    if (e?.response?.status === 401) return null; // interceptor handles redirect
    return e?.response?.data?.message
      || (e?.code === 'ERR_NETWORK' ? 'Cannot reach server — is the backend running?' : e?.message || 'Unknown error');
  };

  /* ── Loaders (all use r.data.success / r.data.data) ── */
  const loadStats  = useCallback(async () => {
    try {
      const r = await adminService.getStaffDashboard();
      if (r.data.success) setStats(r.data.data);
      else notify(r.data.message || 'Failed to load dashboard stats', 'error');
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const r = await adminService.getBranches();
      if (r.data.success) setBranches(r.data.data);
      else notify(r.data.message || 'Failed to load branches', 'error');
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, []);

  const loadPersonnel = useCallback(async () => {
    try {
      const r = await adminService.getPersonnel(pFilter);
      if (r.data.success) setPersonnel(r.data.data);
      else notify(r.data.message || 'Failed to load personnel', 'error');
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, [pFilter]);

  const loadVehicles = useCallback(async () => {
    try {
      const r = await adminService.getVehicles();
      if (r.data.success) setVehicles(r.data.data);
      else notify(r.data.message || 'Failed to load vehicles', 'error');
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const r = await adminService.getStaffOrders(orderFilter);
      if (r.data.success) setOrders(r.data.data);
      else notify(r.data.message || 'Failed to load orders', 'error');
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, [orderFilter]);

  const loadCustomers = useCallback(async () => {
    try {
      const r = await adminService.getStaffUsers({ search: custSearch });
      if (r.data.success) setCustomers(r.data.data);
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, [custSearch]);

  const loadProducts = useCallback(async () => {
    try {
      const r = await adminService.getStaffProducts(prodFilter);
      if (r.data.success) setProducts(r.data.data);
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, [prodFilter]);

  const loadAnalytics = useCallback(async () => {
    try {
      const r = await adminService.getAnalytics({ period });
      if (r.data.success) setAnalytics(r.data.data);
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, [period]);

  const loadLogs = useCallback(async () => {
    try {
      const r = await adminService.getAuditLogs(logFilter);
      if (r.data.success) setLogs(r.data.data);
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, [logFilter]);

  const loadFeedback = useCallback(async () => {
    try {
      const r = await adminService.getFeedback();
      if (r.data.success) setFeedback(r.data.data);
    } catch (e) { const m = errMsg(e); if (m) notify(m, 'error'); }
  }, []);

  const sendWarning = async () => {
    if (!warnReason.trim()) return notify('Please enter a reason', 'error');
    try {
      const r = await adminService.sendCompanyWarning(warnModal.id, { company_id: warnModal.company_id, reason: warnReason });
      if (r.data.success) {
        notify(`Warning sent to ${warnModal.company_name}`);
        setWarnModal(null);
        setWarnReason('');
        loadFeedback();
      } else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const loadVerifications = useCallback(async (explicitStatus) => {
    const status = explicitStatus !== undefined ? explicitStatus : verFilter;
    try {
      const r = await adminService.getCompanyVerifications({ status });
      if (r.success) {
        setVerifications(r.data);
        setPendingCount(r.pendingCount ?? 0);
        setApprovedCount(r.approvedCount ?? 0);
        setRejectedCount(r.rejectedCount ?? 0);
      }
    } catch {}
  }, [verFilter]);

  useEffect(() => {
    if (!isAuthenticated) { onRequireAuth?.(); return; }
    loadStats();
    loadVerifications();
  }, [isAuthenticated]); // eslint-disable-line

  useEffect(() => {
    if (!isAuthenticated) return;
    const loaders = {
      personnel: loadPersonnel, vehicles: loadVehicles,
      orders: loadOrders, customers: loadCustomers, products: loadProducts,
      analytics: loadAnalytics, logs: loadLogs, feedback: loadFeedback,
      verifications: loadVerifications,
    };
    loaders[tab]?.();
  }, [tab]); // eslint-disable-line

  /* ── Also load branches when entering personnel/vehicles/orders for dropdowns ── */
  useEffect(() => {
    if (['personnel', 'vehicles', 'orders'].includes(tab) && branches.length === 0) {
      loadBranches();
    }
  }, [tab]); // eslint-disable-line

  /* ── Personnel actions ── */
  const createPersonnel = async () => {
    if (!pForm.username.trim() || !pForm.email.trim() || !pForm.password) {
      notify('Username, email, and password are required', 'error'); return;
    }
    try {
      const r = await adminService.createPersonnel(pForm);
      if (r.data.success) {
        notify(`${pForm.role === 'delivery_admin' ? 'Delivery Admin' : 'Delivery Boy'} created successfully`);
        setPForm({ username: '', email: '', password: '', role: 'delivery_boy', branchId: '', phone: '', salary: '' });
        await loadPersonnel();
      } else {
        notify(r.data.message || 'Failed to create', 'error');
      }
    } catch (e) { notify(e.response?.data?.message || 'Failed to create', 'error'); }
  };

  const togglePause = async (id) => {
    try {
      const r = await adminService.togglePersonnelPause(id);
      if (r.data.success) { notify(r.data.message || 'Status updated'); await loadPersonnel(); }
      else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const deletePersonnel = async (id) => {
    if (!window.confirm('Delete this member?')) return;
    try {
      await adminService.deletePersonnel(id);
      notify('Personnel deleted');
      await loadPersonnel();
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const openEditPersonnel = (p) => {
    setEditPersonnelModal(p);
    setEditPForm({ username: p.username, phone: p.phone || '', branchId: p.assigned_branch_id || '', salary: p.salary || '', password: '' });
  };

  const saveEditPersonnel = async () => {
    if (!editPForm.username.trim()) { notify('Username is required', 'error'); return; }
    try {
      const payload = {
        username: editPForm.username,
        phone: editPForm.phone,
        branchId: editPForm.branchId || null,
        salary: editPForm.salary,
      };
      if (editPForm.password) payload.password = editPForm.password;
      const r = await adminService.updatePersonnel(editPersonnelModal.id, payload);
      if (r.data.success) {
        notify('Personnel updated');
        setEditPersonnelModal(null);
        await loadPersonnel();
      } else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed to update', 'error'); }
  };

  /* ── Vehicle actions ── */
  const createVehicle = async () => {
    if (!vForm.plateNumber.trim()) { notify('Plate number is required', 'error'); return; }
    if (!vForm.driverName.trim())  { notify('Driver name is required', 'error'); return; }
    if (!vForm.driverPhone.trim()) { notify('Driver phone is required', 'error'); return; }
    try {
      await adminService.createVehicle(vForm);
      notify('Vehicle added successfully');
      setVForm({ plateNumber:'', vehicleType:'bike', branchId:'', routeFromBranchId:'', routeToBranchId:'', viaBranchIds:[], driverName:'', driverPhone:'' });
      loadVehicles();
    } catch (e) { notify(e.response?.data?.message || 'Failed to add vehicle', 'error'); }
  };

  const openEditVehicle = (v) => {
    setEditVehicle(v);
    let via = [];
    try { via = v.route_via_branches ? (typeof v.route_via_branches === 'string' ? JSON.parse(v.route_via_branches) : v.route_via_branches) : []; } catch {}
    setEditVForm({
      plateNumber: v.plate_number, vehicleType: v.vehicle_type, branchId: v.branch_id || '',
      routeFromBranchId: v.route_from_branch_id || '', routeToBranchId: v.route_to_branch_id || '',
      viaBranchIds: via, driverName: v.driver_name || '', driverPhone: v.driver_phone || '',
      isActive: v.is_active
    });
  };

  const submitUpdateVehicle = async () => {
    if (!editVForm.plateNumber?.trim()) { notify('Plate number is required', 'error'); return; }
    if (!editVForm.driverName?.trim())  { notify('Driver name is required', 'error'); return; }
    if (!editVForm.driverPhone?.trim()) { notify('Driver phone is required', 'error'); return; }
    try {
      await adminService.updateVehicle(editVehicle.id, editVForm);
      notify('Vehicle updated successfully');
      setEditVehicle(null);
      loadVehicles();
    } catch (e) { notify(e.response?.data?.message || 'Failed to update vehicle', 'error'); }
  };

  const deleteVehicle = async (id) => {
    if (!window.confirm('Delete this vehicle?')) return;
    try { await adminService.deleteVehicle(id); notify('Vehicle deleted'); loadVehicles(); }
    catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  /* ── Order status ── */
  const updateOrder = async (id, status) => {
    try { await adminService.updateOrderStatus(id, { status }); loadOrders(); }
    catch { notify('Failed to update', 'error'); }
  };

  /* ── Assign branch to order ── */
  const openAssignBranch = (order) => {
    setAssignBranchModal(order);
    setBForm({ branchId: order.assigned_branch_id ? String(order.assigned_branch_id) : '' });
  };

  const submitAssignBranch = async () => {
    if (!bForm.branchId) { notify('Please select a branch', 'error'); return; }
    setBranchAssigning(true);
    try {
      const r = await adminService.assignBranchToOrder(assignBranchModal.id, { branchId: Number(bForm.branchId) });
      if (r.data.success) {
        notify(`Order assigned to ${r.data.data.branchName}`);
        setAssignBranchModal(null);
        loadOrders();
      } else {
        notify(r.data.message || 'Failed', 'error');
      }
    } catch (e) { notify(e.response?.data?.message || 'Failed to assign branch', 'error'); }
    setBranchAssigning(false);
  };

  /* ── Cancel delivery assignment ── */
  const cancelDelivery = async (orderId) => {
    if (!window.confirm('Cancel delivery assignment for this order? The order will be reset to Processing.')) return;
    try {
      const r = await adminService.cancelOrderDelivery(orderId);
      if (r.data.success) { notify('Delivery assignment cancelled'); loadOrders(); }
      else notify(r.data.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed to cancel', 'error'); }
  };

  /* ── Delivery assignment ── */
  const openAssignModal = async (order) => {
    setAssignModal(order);
    const defaultFrom = branches[0]?.id || '';
    setAForm({
      fromBranchId: String(defaultFrom), toBranchId: branches[1] ? String(branches[1].id) : String(defaultFrom),
      deliveryType:'branch_to_branch', destAddr:'', weight:'', sizeFeet:1,
      packaging:'standard', deliveryBoyId:'', vehiclePlate:''
    });
    setABoys([]);
    setAVehicles([]);
    if (defaultFrom) loadAssignResources(defaultFrom);
  };

  const loadAssignResources = async (branchId) => {
    try {
      const [bp, bv] = await Promise.all([
        adminService.getPersonnel({ branchId, role: 'delivery_boy' }),
        adminService.getVehicles({ branchId })
      ]);
      if (bp.data.success) setABoys(bp.data.data);
      if (bv.data.success) setAVehicles(bv.data.data);
    } catch {}
  };

  const submitAssignDelivery = async () => {
    if (!aForm.deliveryBoyId) { notify('Please select a delivery boy', 'error'); return; }
    if (!aForm.vehiclePlate)  { notify('Please select or enter a vehicle plate', 'error'); return; }
    if (!aForm.weight || Number(aForm.weight) <= 0) { notify('Please enter a valid weight', 'error'); return; }
    setAssigning(true);
    try {
      const r = await adminService.assignDeliveryToOrder(assignModal.id, {
        fromBranchId:    Number(aForm.fromBranchId),
        toBranchId:      Number(aForm.toBranchId),
        deliveryType:    aForm.deliveryType,
        destinationAddress: aForm.destAddr || undefined,
        weightKg:        Number(aForm.weight),
        sizeFeet:        Number(aForm.sizeFeet),
        packagingCategory: aForm.packaging,
        deliveryBoyUserId: Number(aForm.deliveryBoyId),
        vehiclePlate:    aForm.vehiclePlate.trim(),
      });
      if (r.data.success) {
        notify(`Delivery assigned! Total cost: $${r.data.data.totalCost}`);
        setAssignModal(null);
        loadOrders();
      } else {
        notify(r.data.message || 'Failed', 'error');
      }
    } catch (e) { notify(e.response?.data?.message || 'Failed to assign', 'error'); }
    setAssigning(false);
  };

  /* ── Product toggle ── */
  const toggleProduct = async (id) => {
    try { await adminService.toggleProductStatus(id); loadProducts(); }
    catch { notify('Failed', 'error'); }
  };

  /* ── Company verifications ── */
  const approveVerification = async (id) => {
    try {
      const r = await adminService.approveCompanyVerification(id);
      if (r.success) { notify(r.message || 'Company approved'); setSelectedVer(null); loadVerifications(verFilter); }
      else notify(r.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const openRejectModal = (ver) => { setRejectTarget(ver); setRejectReason(''); setShowRejectModal(true); };

  const confirmReject = async () => {
    try {
      const r = await adminService.rejectCompanyVerification(rejectTarget.id, { reason: rejectReason });
      if (r.success) {
        notify(r.message || 'Company rejected'); setShowRejectModal(false); setRejectTarget(null);
        setSelectedVer(null); loadVerifications(verFilter);
      } else notify(r.message || 'Failed', 'error');
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  if (!isAuthenticated) { window.location.href = '/admin/login'; return null; }

  if (!canAccess) return (
    <div className="sap-gate">
      <XCircle size={48} style={{ color: '#ef4444' }} />
      <h2>Access Denied</h2>
      <p>Only Staff Admins can access this panel.</p>
      <a href="/admin/login" className="sap-gate-btn">Go to Admin Login</a>
    </div>
  );

  /* ══════════ RENDER ══════════ */
  return (
    <div className="sap-root" data-theme={theme}>
      {/* Toast */}
      {toast.msg && (
        <div className={`sap-toast ${toast.type === 'error' ? 'sap-toast--err' : ''}`}>
          {toast.type === 'error' ? <XCircle size={16}/> : <CheckCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sap-sidebar ${sidebarOpen ? 'sap-sidebar--open' : ''}`}>
        <div className="sap-sidebar-brand">
          <Shield size={22} />
          <span>Staff Admin</span>
        </div>
        <nav className="sap-nav">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className={`sap-nav-item ${tab === t.id ? 'sap-nav-item--active' : ''}`}
                onClick={() => { setTab(t.id); setSidebarOpen(false); }}
              >
                <Icon size={18} />
                <span>{t.label}</span>
                {t.id === 'verifications' && pendingCount > 0 && (
                  <span className="sap-badge-pill">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <button className="sap-nav-item" onClick={toggleTheme} style={{display:'none'}}>
          {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button className="sap-logout" onClick={logout}>
          <LogOut size={16} /> Sign Out
        </button>
      </aside>

      {/* Main */}
      <div className="sap-main">
        {/* Topbar */}
        <header className="sap-topbar">
          <button className="sap-menu-toggle" onClick={() => setSidebarOpen(s => !s)}>
            {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
          <h1 className="sap-page-title">
            {TABS.find(t => t.id === tab)?.label || 'Dashboard'}
          </h1>
          <div className="sap-topbar-user" ref={profileRef}>
            <button className="sap-profile-btn" onClick={() => setProfileOpen(o => !o)}>
              <div className="sap-avatar">{user?.username?.[0]?.toUpperCase() || 'A'}</div>
              <div className="sap-topbar-meta">
                <span className="sap-topbar-name">{user?.username}</span>
                <span className="sap-topbar-role">Staff Admin</span>
              </div>
            </button>
            {profileOpen && (
              <div className="sap-profile-dropdown">
                <div className="sap-dd-header">
                  <div className="sap-dd-name">{user?.username}</div>
                  <div className="sap-dd-role">Staff Admin</div>
                </div>
                <button className="sap-dd-item" onClick={() => { setTab('dashboard'); setProfileOpen(false); }}>
                  <User size={14}/> View Profile
                </button>
                <button className="sap-dd-item" onClick={() => { toggleTheme(); setProfileOpen(false); }}>
                  {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
                <button className="sap-dd-item" onClick={() => { setChangePwOpen(true); setProfileOpen(false); }}>
                  <Lock size={14}/> Change Password
                </button>
                <hr className="sap-dd-divider"/>
                <button className="sap-dd-item danger" onClick={() => { setProfileOpen(false); logout(); }}>
                  <LogOut size={14}/> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="sap-content">

          {/* ═══ DASHBOARD ═══ */}
          {tab === 'dashboard' && (
            <div className="sap-section">
              <div className="sap-kpi-grid">
                <KPI label="Customers"     value={stats?.totalCustomers}    icon={Users}         color="#6366f1"/>
                <KPI label="Sellers"       value={stats?.totalSellers}      icon={Building2}     color="#0ea5e9"/>
                <KPI label="Products"      value={stats?.totalProducts}     icon={Package}       color="#8b5cf6"/>
                <KPI label="Orders"        value={stats?.totalOrders}       icon={ShoppingCart}  color="#f59e0b"/>
                <KPI label="Pending Orders" value={stats?.pendingOrders}    icon={Clock}         color="#ef4444"/>
                <KPI label="Deliveries"    value={stats?.totalDeliveries}   icon={Truck}         color="#10b981"/>
                <KPI label="Branches"      value={stats?.totalBranches}     icon={GitBranch}     color="#f97316"/>
                <KPI label="Delivery Boys" value={stats?.totalDeliveryBoys} icon={User}          color="#14b8a6"/>
              </div>
              {pendingCount > 0 && (
                <div className="sap-alert-banner">
                  <ShieldCheck size={18}/>
                  <span><strong>{pendingCount}</strong> company verification{pendingCount > 1 ? 's' : ''} awaiting review</span>
                  <button onClick={() => setTab('verifications')}>Review <ChevronRight size={14}/></button>
                </div>
              )}
            </div>
          )}

          {/* ═══ VERIFICATIONS ═══ */}
          {tab === 'verifications' && (
            <div className="sap-section">
              <div className="sap-toolbar">
                <div className="sap-filter-tabs">
                  {['pending','approved','rejected'].map(s => {
                    const count = s === 'pending' ? pendingCount : s === 'approved' ? approvedCount : rejectedCount;
                    return (
                      <button key={s}
                        className={`sap-filter-tab ${verFilter === s ? 'active' : ''}`}
                        onClick={() => { setVerFilter(s); loadVerifications(s); }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                        {count > 0 && <span className="sap-badge-pill">{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <button className="sap-icon-btn" onClick={loadVerifications}><RefreshCcw size={16}/></button>
              </div>

              {verifications.length === 0
                ? <div className="sap-empty"><ShieldCheck size={40}/><p>No {verFilter} verifications</p></div>
                : (
                  <div className="sap-ver-grid">
                    {verifications.map(ver => (
                      <div key={ver.id} className="sap-ver-card" onClick={() => setSelectedVer(ver)}>
                        <div className="sap-ver-card-top">
                          {ver.company_logo
                            ? <img src={getImageUrl(ver.company_logo)} alt="" className="sap-ver-logo"/>
                            : <div className="sap-ver-logo-placeholder"><Building2 size={22}/></div>
                          }
                          <div>
                            <div className="sap-ver-name">{ver.company_name}</div>
                            <div className="sap-ver-category">{ver.category}</div>
                          </div>
                          <Badge status={ver.verification_status} />
                        </div>
                        <div className="sap-ver-meta">
                          <span><User size={13}/> {ver.username}</span>
                          <span>{new Date(ver.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="sap-ver-imgs">
                          {ver.nid_front_image && <img src={getImageUrl(ver.nid_front_image)} alt="NID Front" title="NID Front"/>}
                          {ver.nid_back_image  && <img src={getImageUrl(ver.nid_back_image)}  alt="NID Back"  title="NID Back"/>}
                          {ver.face_image      && <img src={getImageUrl(ver.face_image)}      alt="Face"      title="Face Photo"/>}
                        </div>
                        {ver.verification_status === 'pending' && (
                          <div className="sap-ver-actions">
                            <button className="sap-btn sap-btn--approve"
                              onClick={e => { e.stopPropagation(); approveVerification(ver.id); }}>
                              <CheckCircle size={14}/> Approve
                            </button>
                            <button className="sap-btn sap-btn--reject"
                              onClick={e => { e.stopPropagation(); openRejectModal(ver); }}>
                              <XCircle size={14}/> Reject
                            </button>
                          </div>
                        )}
                        {ver.verification_status === 'rejected' && ver.rejection_reason && (
                          <div className="sap-ver-reason"><AlertCircle size={13}/> {ver.rejection_reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }

              {/* Detail drawer */}
              {selectedVer && (
                <div className="sap-drawer-overlay" onClick={() => setSelectedVer(null)}>
                  <div className="sap-drawer" onClick={e => e.stopPropagation()}>
                    <div className="sap-drawer-header">
                      <h3>Verification Detail</h3>
                      <button onClick={() => setSelectedVer(null)}><X size={18}/></button>
                    </div>
                    <div className="sap-drawer-body">
                      <div className="sap-drawer-section">
                        <div className="sap-drawer-title"><Building2 size={15}/> Company</div>
                        <div className="sap-drawer-row"><span>Name</span><strong>{selectedVer.company_name}</strong></div>
                        <div className="sap-drawer-row"><span>Category</span><strong>{selectedVer.category}</strong></div>
                        <div className="sap-drawer-row"><span>Description</span><strong>{selectedVer.description}</strong></div>
                        <div className="sap-drawer-row"><span>Email</span><strong>{selectedVer.contact_email}</strong></div>
                        <div className="sap-drawer-row"><span>Phone</span><strong>{selectedVer.contact_phone}</strong></div>
                        <div className="sap-drawer-row"><span>Location</span><strong>{selectedVer.city}, {selectedVer.country}</strong></div>
                      </div>
                      <div className="sap-drawer-section">
                        <div className="sap-drawer-title"><User size={15}/> Applicant</div>
                        <div className="sap-drawer-row"><span>Username</span><strong>{selectedVer.username}</strong></div>
                        <div className="sap-drawer-row"><span>Email</span><strong>{selectedVer.email}</strong></div>
                        <div className="sap-drawer-row"><span>NID No.</span><strong>{selectedVer.nid_number}</strong></div>
                      </div>
                      <div className="sap-drawer-section">
                        <div className="sap-drawer-title"><CreditCard size={15}/> Identity Documents</div>
                        <div className="sap-drawer-docs">
                          {selectedVer.nid_front_image && (
                            <div className="sap-doc-item" onClick={() => setLightboxImg(getImageUrl(selectedVer.nid_front_image))}>
                              <img src={getImageUrl(selectedVer.nid_front_image)} alt="NID Front"/>
                              <span>NID Front</span>
                            </div>
                          )}
                          {selectedVer.nid_back_image && (
                            <div className="sap-doc-item" onClick={() => setLightboxImg(getImageUrl(selectedVer.nid_back_image))}>
                              <img src={getImageUrl(selectedVer.nid_back_image)} alt="NID Back"/>
                              <span>NID Back</span>
                            </div>
                          )}
                          {selectedVer.face_image && (
                            <div className="sap-doc-item" onClick={() => setLightboxImg(getImageUrl(selectedVer.face_image))}>
                              <img src={getImageUrl(selectedVer.face_image)} alt="Face"/>
                              <span>Live Photo</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {selectedVer.verification_status === 'pending' && (
                        <div className="sap-drawer-actions">
                          <button className="sap-btn sap-btn--approve" onClick={() => approveVerification(selectedVer.id)}>
                            <CheckCircle size={16}/> Approve Company
                          </button>
                          <button className="sap-btn sap-btn--reject" onClick={() => openRejectModal(selectedVer)}>
                            <XCircle size={16}/> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {showRejectModal && (
                <div className="sap-modal-overlay" onClick={() => setShowRejectModal(false)}>
                  <div className="sap-modal" onClick={e => e.stopPropagation()}>
                    <div className="sap-modal-header">
                      <XCircle size={20} className="sap-modal-icon--danger"/>
                      <h3>Reject Company</h3>
                    </div>
                    <p className="sap-modal-desc">
                      Rejecting <strong>{rejectTarget?.company_name}</strong>. Provide a reason (optional):
                    </p>
                    <textarea className="sap-modal-textarea" placeholder="Reason for rejection..."
                      value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}/>
                    <div className="sap-modal-actions">
                      <button className="sap-btn sap-btn--secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
                      <button className="sap-btn sap-btn--reject" onClick={confirmReject}><XCircle size={14}/> Confirm Reject</button>
                    </div>
                  </div>
                </div>
              )}

              {lightboxImg && (
                <div className="sap-lightbox-overlay" onClick={() => setLightboxImg(null)}>
                  <div className="sap-lightbox" onClick={e => e.stopPropagation()}>
                    <button className="sap-lightbox-close" onClick={() => setLightboxImg(null)}><X size={22}/></button>
                    <img src={lightboxImg} alt="Document preview" className="sap-lightbox-img"/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ PERSONNEL ═══ */}
          {tab === 'personnel' && (
            <div className="sap-section">
              <div className="sap-card sap-form-card">
                <h3 className="sap-form-title"><Users size={16}/> Add Delivery Personnel</h3>
                <div className="sap-form-grid">
                  <input className="sap-input" placeholder="Username *" value={pForm.username}
                    onChange={e => setPForm(p=>({...p, username:e.target.value}))}/>
                  <input className="sap-input" placeholder="Email *" type="email" value={pForm.email}
                    onChange={e => setPForm(p=>({...p, email:e.target.value}))}/>
                  <input className="sap-input" placeholder="Password (min 6 chars) *" type="password" value={pForm.password}
                    onChange={e => setPForm(p=>({...p, password:e.target.value}))}/>
                  <input className="sap-input" placeholder="Phone number" value={pForm.phone}
                    onChange={e => setPForm(p=>({...p, phone:e.target.value}))}/>
                  <input className="sap-input" placeholder="Salary (optional)" type="number" value={pForm.salary}
                    onChange={e => setPForm(p=>({...p, salary:e.target.value}))}/>
                  <div className="sap-select-wrap">
                    <select className="sap-input" value={pForm.role} onChange={e => setPForm(p=>({...p, role:e.target.value}))}>
                      <option value="delivery_boy">Delivery Boy</option>
                      <option value="delivery_admin">Delivery Admin</option>
                    </select>
                    <ChevronDown size={14} className="sap-select-icon"/>
                  </div>
                  <div className="sap-select-wrap">
                    <select className="sap-input" value={pForm.branchId} onChange={e => setPForm(p=>({...p, branchId:e.target.value}))}>
                      <option value="">— Assign to Branch —</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="sap-select-icon"/>
                  </div>
                  <button className="sap-btn sap-btn--primary" onClick={createPersonnel}><Plus size={14}/> Create Account</button>
                </div>
              </div>

              <div className="sap-toolbar">
                <div className="sap-select-wrap" style={{minWidth:160}}>
                  <select className="sap-input sap-input--sm" value={pFilter.branchId}
                    onChange={e => setPFilter(p=>({...p, branchId:e.target.value}))}>
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
                <div className="sap-select-wrap" style={{minWidth:140}}>
                  <select className="sap-input sap-input--sm" value={pFilter.role}
                    onChange={e => setPFilter(p=>({...p, role:e.target.value}))}>
                    <option value="">All Roles</option>
                    <option value="delivery_admin">Delivery Admin</option>
                    <option value="delivery_boy">Delivery Boy</option>
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
                <button className="sap-icon-btn" onClick={loadPersonnel}><RefreshCcw size={15}/></button>
              </div>

              <div className="sap-table-wrap">
                <table className="sap-table">
                  <thead><tr><th>#</th><th>Username</th><th>Email</th><th>Phone</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {personnel.length === 0
                      ? <tr><td colSpan={8} className="sap-td-empty">No personnel found</td></tr>
                      : personnel.map(p => (
                        <tr key={p.id}>
                          <td className="sap-td-muted">{p.id}</td>
                          <td className="sap-td-strong">{p.username}</td>
                          <td>{p.email}</td>
                          <td>{p.phone || '—'}</td>
                          <td><span className="sap-role-chip">{p.role === 'delivery_boy' ? 'Delivery Boy' : 'Delivery Admin'}</span></td>
                          <td>{p.branch_name || <span className="sap-td-muted">—</span>}</td>
                          <td><Badge status={p.status}/></td>
                          <td>
                            <div className="sap-action-row">
                              <button className="sap-icon-btn" title="Edit" onClick={() => openEditPersonnel(p)}>
                                <Pencil size={14}/>
                              </button>
                              <button className="sap-icon-btn" title={p.status==='active'?'Pause':'Activate'} onClick={() => togglePause(p.id)}>
                                {p.status === 'active' ? <PauseCircle size={14}/> : <PlayCircle size={14}/>}
                              </button>
                              <button className="sap-icon-btn sap-icon-btn--danger" onClick={() => deletePersonnel(p.id)}><Trash2 size={14}/></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ VEHICLES ═══ */}
          {tab === 'vehicles' && (
            <div className="sap-section">
              {/* Add Vehicle Form */}
              <div className="sap-card sap-form-card">
                <h3 className="sap-form-title"><Truck size={16}/> Add New Vehicle</h3>
                <div className="sap-form-grid">
                  <input className="sap-input" placeholder="Plate Number *" value={vForm.plateNumber}
                    onChange={e => setVForm(p=>({...p, plateNumber:e.target.value}))}/>
                  <input className="sap-input" placeholder="Driver Name *" value={vForm.driverName}
                    onChange={e => setVForm(p=>({...p, driverName:e.target.value}))}/>
                  <input className="sap-input" placeholder="Driver Phone *" value={vForm.driverPhone}
                    onChange={e => setVForm(p=>({...p, driverPhone:e.target.value}))}/>
                  <div className="sap-select-wrap">
                    <select className="sap-input" value={vForm.vehicleType} onChange={e => setVForm(p=>({...p, vehicleType:e.target.value}))}>
                      <option value="bike">Bike</option>
                      <option value="car">Car</option>
                      <option value="van">Van</option>
                      <option value="truck">Truck</option>
                    </select>
                    <ChevronDown size={14} className="sap-select-icon"/>
                  </div>
                  <div className="sap-select-wrap">
                    <select className="sap-input" value={vForm.branchId} onChange={e => setVForm(p=>({...p, branchId:e.target.value}))}>
                      <option value="">— Assign to Branch —</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="sap-select-icon"/>
                  </div>
                  <div className="sap-select-wrap">
                    <select className="sap-input" value={vForm.routeFromBranchId}
                      onChange={e => setVForm(p=>({...p, routeFromBranchId:e.target.value}))}>
                      <option value="">— Route: From Branch —</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="sap-select-icon"/>
                  </div>
                  <div className="sap-select-wrap">
                    <select className="sap-input" value={vForm.routeToBranchId}
                      onChange={e => setVForm(p=>({...p, routeToBranchId:e.target.value}))}>
                      <option value="">— Route: To Branch —</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="sap-select-icon"/>
                  </div>
                </div>
                {/* Via Branches */}
                {vForm.routeFromBranchId && vForm.routeToBranchId && (
                  <div className="sap-via-wrap">
                    <label className="sap-via-label"><Navigation size={13}/> Via Branches (optional intermediate stops)</label>
                    <div className="sap-via-list">
                      {branches
                        .filter(b => String(b.id) !== vForm.routeFromBranchId && String(b.id) !== vForm.routeToBranchId)
                        .map(b => (
                          <label key={b.id} className="sap-via-item">
                            <input type="checkbox"
                              checked={vForm.viaBranchIds.includes(b.id)}
                              onChange={e => setVForm(p => ({
                                ...p,
                                viaBranchIds: e.target.checked
                                  ? [...p.viaBranchIds, b.id]
                                  : p.viaBranchIds.filter(id => id !== b.id)
                              }))}
                            />
                            <span>{b.name}</span>
                          </label>
                        ))}
                      {branches.filter(b => String(b.id) !== vForm.routeFromBranchId && String(b.id) !== vForm.routeToBranchId).length === 0 && (
                        <span className="sap-td-muted" style={{fontSize:'0.8rem'}}>No intermediate branches available</span>
                      )}
                    </div>
                  </div>
                )}
                <div style={{marginTop:12}}>
                  <button className="sap-btn sap-btn--primary" onClick={createVehicle}><Plus size={14}/> Add Vehicle</button>
                </div>
              </div>

              {/* Vehicles Table */}
              <div className="sap-table-wrap">
                <table className="sap-table">
                  <thead>
                    <tr>
                      <th>Plate No.</th>
                      <th>Type</th>
                      <th>Driver</th>
                      <th>Branch</th>
                      <th>Route</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.length === 0
                      ? <tr><td colSpan={7} className="sap-td-empty">No vehicles added yet</td></tr>
                      : vehicles.map(v => {
                          let via = [];
                          try { via = v.route_via_branches ? (typeof v.route_via_branches === 'string' ? JSON.parse(v.route_via_branches) : v.route_via_branches) : []; } catch {}
                          const getBranchName = id => branches.find(b => b.id === Number(id))?.name || `#${id}`;
                          const routeParts = [];
                          if (v.route_from_name || v.route_from_branch_id) routeParts.push(v.route_from_name || getBranchName(v.route_from_branch_id));
                          via.forEach(id => routeParts.push(getBranchName(id)));
                          if (v.route_to_name || v.route_to_branch_id) routeParts.push(v.route_to_name || getBranchName(v.route_to_branch_id));
                          return (
                            <tr key={v.id}>
                              <td className="sap-td-strong">{v.plate_number}</td>
                              <td><span className="sap-role-chip">{v.vehicle_type}</span></td>
                              <td>
                                <div className="sap-td-strong">{v.driver_name || <span className="sap-td-muted">—</span>}</div>
                                {v.driver_phone && <div className="sap-td-muted sap-text-xs"><Phone size={11}/> {v.driver_phone}</div>}
                              </td>
                              <td>{v.branch_name || <span className="sap-td-muted">—</span>}</td>
                              <td>
                                {routeParts.length >= 2
                                  ? <span className="sap-route-chip">
                                      <MapPin size={11}/>
                                      {routeParts.map((p, i) => (
                                        <span key={i}>{i > 0 && <ArrowRight size={11} style={{margin:'0 2px'}}/>}{p}</span>
                                      ))}
                                    </span>
                                  : <span className="sap-td-muted">—</span>
                                }
                              </td>
                              <td><Badge status={v.is_active ? 'active' : 'inactive'}/></td>
                              <td>
                                <div className="sap-action-row">
                                  <button className="sap-icon-btn" title="Edit" onClick={() => openEditVehicle(v)}><Pencil size={14}/></button>
                                  <button className="sap-icon-btn sap-icon-btn--danger" title="Delete" onClick={() => deleteVehicle(v.id)}><Trash2 size={14}/></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ ORDERS ═══ */}
          {tab === 'orders' && (
            <div className="sap-section">
              <div className="sap-toolbar">
                <div className="sap-search-wrap">
                  <Search size={15} className="sap-search-icon"/>
                  <input className="sap-input sap-input--sm sap-input--search" placeholder="Search by name, email, order#..."
                    value={orderFilter.search} onChange={e => setOrderFilter(p=>({...p,search:e.target.value}))}/>
                </div>
                <div className="sap-select-wrap">
                  <select className="sap-input sap-input--sm" value={orderFilter.status}
                    onChange={e => setOrderFilter(p=>({...p,status:e.target.value}))}>
                    <option value="">All Status</option>
                    {['pending','processing','shipped','delivered','cancelled'].map(s =>
                      <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                    )}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
                <button className="sap-icon-btn" onClick={loadOrders}><RefreshCcw size={15}/></button>
              </div>

              <div className="sap-table-wrap">
                <table className="sap-table sap-table--orders">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th>Branch</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Delivery</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0
                      ? <tr><td colSpan={8} className="sap-td-empty">No orders found</td></tr>
                      : orders.map(o => (
                        <tr key={o.id} className={`sap-order-row sap-order-row--${o.status}`}>
                          <td>
                            <span className="sap-order-id">#{o.order_number || o.id}</span>
                            <div className="sap-td-muted sap-text-xs">{o.item_count} item{o.item_count!==1?'s':''}</div>
                          </td>
                          <td>
                            <div className="sap-td-strong">{o.customer_name || '—'}</div>
                            <div className="sap-td-muted sap-text-xs">{o.customer_email}</div>
                          </td>
                          <td>
                            {o.assigned_branch_name
                              ? <div>
                                  <div className="sap-td-strong"><GitBranch size={12}/> {o.assigned_branch_name}</div>
                                  {o.from_branch_name && o.to_branch_name && (
                                    <div className="sap-td-muted sap-text-xs">
                                      {o.from_branch_name} <ArrowRight size={10}/> {o.to_branch_name}
                                    </div>
                                  )}
                                </div>
                              : <span className="sap-td-muted">Not assigned</span>
                            }
                          </td>
                          <td>
                            <span className="sap-amount">৳{Number(o.total_amount||0).toFixed(2)}</span>
                            <div className="sap-td-muted sap-text-xs">{o.payment_method || '—'}</div>
                            {o.payment_method === 'cash_on_delivery' && (
                              <div style={{ marginTop: '2px' }}>
                                <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#16a34a', borderRadius: '4px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><DollarSign size={10} />COD</span>
                                {o.payment_status !== 'paid'
                                  ? (() => {
                                      const advance = Number(o.cod_advance_paid || 0);
                                      const remaining = Math.max(0, Number(o.total_amount || 0) - advance);
                                      return (
                                        <div style={{ fontSize: '0.7rem', color: '#92400e' }}>
                                          {advance > 0 ? `৳${advance.toFixed(0)} paid · ` : ''}৳{remaining.toFixed(0)} due on delivery
                                        </div>
                                      );
                                    })()
                                  : <div style={{ fontSize: '0.7rem', color: '#166534' }}>Fully Paid</div>
                                }
                              </div>
                            )}
                          </td>
                          <td><Badge status={o.status}/></td>
                          <td>
                            {o.delivery_id
                              ? <div>
                                  <Badge status={o.delivery_status}/>
                                  <div className="sap-td-muted sap-text-xs">{o.delivery_boy_name}</div>
                                  <div className="sap-td-muted sap-text-xs">{o.vehicle_plate}</div>
                                </div>
                              : <span className="sap-td-muted">—</span>
                            }
                          </td>
                          <td className="sap-td-muted">{new Date(o.created_at).toLocaleDateString()}</td>
                          <td>
                            <div className="sap-order-actions">
                              {/* Status update */}
                              {!['delivered','cancelled','refunded'].includes(o.status) && (
                                <div className="sap-select-wrap" style={{minWidth:110}}>
                                  <select className="sap-input sap-input--sm" value={o.status}
                                    onChange={e => updateOrder(o.id, e.target.value)}>
                                    {['pending','processing','shipped','delivered','cancelled'].map(s =>
                                      <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                                    )}
                                  </select>
                                  <ChevronDown size={12} className="sap-select-icon"/>
                                </div>
                              )}
                              {/* Assign Branch — always available if no delivery */}
                              {!o.delivery_id && !['cancelled','refunded','delivered'].includes(o.status) && (
                                <button className="sap-btn sap-btn--branch" title="Assign Branch"
                                  onClick={() => openAssignBranch(o)}>
                                  <GitBranch size={13}/>
                                  {o.assigned_branch_name ? 'Reassign' : 'Assign Branch'}
                                </button>
                              )}
                              {/* Assign Delivery — available when branch assigned, no delivery yet */}
                              {!o.delivery_id && !['cancelled','refunded','delivered'].includes(o.status) && (
                                <button className="sap-btn sap-btn--assign" title="Assign Delivery Boy"
                                  onClick={() => openAssignModal(o)}>
                                  <Truck size={13}/> Assign Delivery
                                </button>
                              )}
                              {/* Cancel Assignment */}
                              {o.delivery_id && !['delivered','cancelled'].includes(o.status) && (
                                <button className="sap-btn sap-btn--cancel" title="Cancel Delivery Assignment"
                                  onClick={() => cancelDelivery(o.id)}>
                                  <Ban size={13}/> Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ CUSTOMERS ═══ */}
          {tab === 'customers' && (
            <div className="sap-section">
              <div className="sap-toolbar">
                <div className="sap-search-wrap">
                  <Search size={15} className="sap-search-icon"/>
                  <input className="sap-input sap-input--sm sap-input--search" placeholder="Search customers..."
                    value={custSearch} onChange={e => setCustSearch(e.target.value)}
                    onKeyUp={e => e.key==='Enter' && loadCustomers()}/>
                </div>
                <button className="sap-icon-btn" onClick={loadCustomers}><RefreshCcw size={15}/></button>
              </div>
              <div className="sap-table-wrap">
                <table className="sap-table">
                  <thead><tr><th>#</th><th>Username</th><th>Email</th><th>Phone</th><th>Points</th><th>Status</th><th>Joined</th></tr></thead>
                  <tbody>
                    {customers.length === 0
                      ? <tr><td colSpan={7} className="sap-td-empty">No customers found</td></tr>
                      : customers.map(c => (
                        <tr key={c.id}>
                          <td className="sap-td-muted">{c.id}</td>
                          <td className="sap-td-strong">{c.username}</td>
                          <td>{c.email}</td>
                          <td>{c.phone || '—'}</td>
                          <td>{c.points}</td>
                          <td><Badge status={c.status}/></td>
                          <td className="sap-td-muted">{new Date(c.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ PRODUCTS ═══ */}
          {tab === 'products' && (
            <div className="sap-section">
              <div className="sap-toolbar">
                <div className="sap-search-wrap">
                  <Search size={15} className="sap-search-icon"/>
                  <input className="sap-input sap-input--sm sap-input--search" placeholder="Search products..."
                    value={prodFilter.search} onChange={e => setProdFilter(p=>({...p,search:e.target.value}))}/>
                </div>
                <div className="sap-select-wrap">
                  <select className="sap-input sap-input--sm" value={prodFilter.status}
                    onChange={e => setProdFilter(p=>({...p,status:e.target.value}))}>
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
                <button className="sap-icon-btn" onClick={loadProducts}><RefreshCcw size={15}/></button>
              </div>
              <div className="sap-table-wrap">
                <table className="sap-table">
                  <thead><tr><th>#</th><th>Name</th><th>Company</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {products.length === 0
                      ? <tr><td colSpan={7} className="sap-td-empty">No products found</td></tr>
                      : products.map(p => (
                        <tr key={p.id}>
                          <td className="sap-td-muted">{p.id}</td>
                          <td className="sap-td-strong">{p.name}</td>
                          <td>{p.company_name || '—'}</td>
                          <td>৳{Number(p.price||0).toFixed(2)}</td>
                          <td>{p.stock}</td>
                          <td><Badge status={p.status}/></td>
                          <td>
                            <button className="sap-icon-btn" title="Toggle Status" onClick={() => toggleProduct(p.id)}>
                              {p.status === 'active' ? <PauseCircle size={14}/> : <PlayCircle size={14}/>}
                            </button>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ ANALYTICS ═══ */}
          {tab === 'analytics' && (
            <div className="sap-section">
              <div className="sap-toolbar">
                {['daily','monthly','yearly'].map(p => (
                  <button key={p} className={`sap-filter-tab ${period===p?'active':''}`}
                    onClick={() => { setPeriod(p); setTimeout(loadAnalytics,50); }}>
                    {p.charAt(0).toUpperCase()+p.slice(1)}
                  </button>
                ))}
              </div>
              <div className="sap-charts-grid">
                <div className="sap-chart-card">
                  <div className="sap-chart-header"><TrendingUp size={16}/> Revenue</div>
                  <BarChart data={analytics?.revenue} xKey="label" yKey="revenue" color="#6366f1" prefix="৳"/>
                </div>
                <div className="sap-chart-card">
                  <div className="sap-chart-header"><Truck size={16}/> Deliveries</div>
                  <BarChart data={analytics?.deliveries} xKey="label" yKey="total" color="#10b981"/>
                </div>
              </div>
            </div>
          )}

          {/* ═══ ACTIVITY LOGS ═══ */}
          {tab === 'logs' && (
            <div className="sap-section">
              <div className="sap-toolbar">
                {[7, 14, 30].map(d => (
                  <button key={d} className={`sap-filter-tab ${logFilter.days===d?'active':''}`}
                    onClick={() => setLogFilter({ days: d })}>
                    Last {d} days
                  </button>
                ))}
                <button className="sap-icon-btn" onClick={loadLogs}><RefreshCcw size={15}/></button>
              </div>
              {logs.length === 0
                ? <div className="sap-empty"><Activity size={36}/><p>No activity logs found for this period.</p></div>
                : (
                  <div className="sap-table-wrap">
                    <table className="sap-table">
                      <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
                      <tbody>
                        {logs.map(l => (
                          <tr key={l.id}>
                            <td className="sap-td-muted sap-text-xs">
                              {new Date(l.created_at).toLocaleString()}
                            </td>
                            <td>
                              <div className="sap-td-strong">{l.admin_username}</div>
                              <div className="sap-td-muted sap-text-xs">{l.admin_role_name}</div>
                            </td>
                            <td>
                              <span className="sap-log-action">
                                {ACTION_LABELS[l.action] || l.action}
                              </span>
                            </td>
                            <td className="sap-td-muted">
                              {l.target_type && `${l.target_type} #${l.target_id}`}
                            </td>
                            <td className="sap-td-muted sap-text-xs">
                              {l.details && (() => {
                                try {
                                  const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
                                  return Object.entries(d).map(([k,v]) => `${k}: ${v}`).join(', ');
                                } catch { return String(l.details); }
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}

          {/* ═══ FEEDBACK ═══ */}
          {tab === 'feedback' && (
            <div className="sap-section">
              <div className="sap-table-wrap">
                <table className="sap-table">
                  <thead><tr><th>#</th><th>Customer</th><th>Type</th><th>Company</th><th>Message</th><th>Rating</th><th>Date</th><th>Action</th></tr></thead>
                  <tbody>
                    {feedback.length === 0
                      ? <tr><td colSpan={8} className="sap-td-empty">No feedback yet</td></tr>
                      : feedback.map((f, idx) => (
                        <tr key={f.id}>
                          <td className="sap-td-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{idx + 1}</td>
                          <td>
                            <div className="sap-td-strong">{f.submitter_username || f.username || '—'}</div>
                            {f.submitter_email && <div className="sap-td-muted" style={{ fontSize: '0.72rem' }}>{f.submitter_email}</div>}
                          </td>
                          <td>
                            {f.feedback_type === 'complaint'
                              ? <span className="sap-badge sap-badge--red">Complaint</span>
                              : <span className="sap-badge sap-badge--blue">Feedback</span>
                            }
                          </td>
                          <td>{f.company_name || <span className="sap-td-muted">—</span>}</td>
                          <td>{f.message}</td>
                          <td>{f.rating ? `${f.rating}/5` : '—'}</td>
                          <td className="sap-td-muted">{new Date(f.created_at).toLocaleDateString()}</td>
                          <td>
                            {f.feedback_type === 'complaint' && f.company_id && f.status !== 'reviewed' ? (
                              <button className="sap-btn sap-btn--warn sap-btn--sm"
                                onClick={() => { setWarnModal(f); setWarnReason(''); }}>
                                <AlertCircle size={13}/> Warn
                              </button>
                            ) : f.status === 'reviewed' ? (
                              <span className="sap-td-muted" style={{ fontSize: '0.75rem' }}>Warned</span>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {/* Warning Modal */}
              {warnModal && (
                <div className="sap-modal-overlay" onClick={() => setWarnModal(null)}>
                  <div className="sap-modal" onClick={e => e.stopPropagation()}>
                    <div className="sap-modal-header">
                      <AlertCircle size={18} style={{ color: '#f59e0b' }}/>
                      <h3>Send Warning to {warnModal.company_name}</h3>
                      <button className="sap-modal-close" onClick={() => setWarnModal(null)}><X size={18}/></button>
                    </div>
                    <div style={{ padding: '0 0 1rem' }}>
                      <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--sap-text-muted)' }}>
                        Complaint: "{warnModal.message}"
                      </p>
                      <div className="sap-field">
                        <label>Warning Reason / Message *</label>
                        <textarea className="sap-input" rows={4} placeholder="Explain the warning reason…"
                          value={warnReason} onChange={e => setWarnReason(e.target.value)}
                          style={{ resize: 'vertical', width: '100%' }}/>
                      </div>
                    </div>
                    <div className="sap-form-actions">
                      <button className="sap-btn sap-btn--warn" onClick={sendWarning}><AlertCircle size={15}/> Send Warning</button>
                      <button className="sap-btn sap-btn--secondary" onClick={() => setWarnModal(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ EDIT PERSONNEL MODAL ═══ */}
      {editPersonnelModal && (
        <div className="sap-modal-overlay" onClick={() => setEditPersonnelModal(null)}>
          <div className="sap-modal" onClick={e => e.stopPropagation()}>
            <div className="sap-modal-header">
              <Users size={20} style={{color:'#6366f1'}}/>
              <h3>Edit Personnel — {editPersonnelModal.username}</h3>
              <button className="sap-modal-close" onClick={() => setEditPersonnelModal(null)}><X size={18}/></button>
            </div>
            <div className="sap-form-grid sap-form-grid--2" style={{padding:'0 0 0.5rem'}}>
              <div className="sap-field">
                <label>Username *</label>
                <input className="sap-input" value={editPForm.username}
                  onChange={e => setEditPForm(f=>({...f, username:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Phone</label>
                <input className="sap-input" placeholder="+880..." value={editPForm.phone}
                  onChange={e => setEditPForm(f=>({...f, phone:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Salary</label>
                <input className="sap-input" type="number" value={editPForm.salary}
                  onChange={e => setEditPForm(f=>({...f, salary:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Branch</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={editPForm.branchId}
                    onChange={e => setEditPForm(f=>({...f, branchId:e.target.value}))}>
                    <option value="">— No Branch —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field" style={{gridColumn:'1/-1'}}>
                <label>New Password <span style={{color:'#6b7280',fontWeight:400}}>(leave blank to keep current)</span></label>
                <input className="sap-input" type="password" placeholder="Min. 6 characters"
                  value={editPForm.password}
                  onChange={e => setEditPForm(f=>({...f, password:e.target.value}))}/>
              </div>
            </div>
            <div className="sap-modal-actions">
              <button className="sap-btn sap-btn--secondary" onClick={() => setEditPersonnelModal(null)}>Cancel</button>
              <button className="sap-btn sap-btn--primary" onClick={saveEditPersonnel}>
                <CheckCircle size={14}/> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT VEHICLE MODAL ═══ */}
      {editVehicle && (
        <div className="sap-modal-overlay" onClick={() => setEditVehicle(null)}>
          <div className="sap-modal sap-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="sap-modal-header">
              <Truck size={20} style={{color:'#6366f1'}}/>
              <h3>Edit Vehicle — {editVehicle.plate_number}</h3>
              <button className="sap-modal-close" onClick={() => setEditVehicle(null)}><X size={18}/></button>
            </div>
            <div className="sap-form-grid sap-form-grid--2">
              <div className="sap-field">
                <label>Plate Number *</label>
                <input className="sap-input" value={editVForm.plateNumber || ''}
                  onChange={e => setEditVForm(p=>({...p, plateNumber:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Driver Name *</label>
                <input className="sap-input" placeholder="Full name" value={editVForm.driverName || ''}
                  onChange={e => setEditVForm(p=>({...p, driverName:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Driver Phone *</label>
                <input className="sap-input" placeholder="Phone number" value={editVForm.driverPhone || ''}
                  onChange={e => setEditVForm(p=>({...p, driverPhone:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Vehicle Type</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={editVForm.vehicleType || 'bike'}
                    onChange={e => setEditVForm(p=>({...p, vehicleType:e.target.value}))}>
                    <option value="bike">Bike</option>
                    <option value="car">Car</option>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>Assigned Branch</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={editVForm.branchId || ''}
                    onChange={e => setEditVForm(p=>({...p, branchId:e.target.value}))}>
                    <option value="">— None —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>Route: From Branch</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={editVForm.routeFromBranchId || ''}
                    onChange={e => setEditVForm(p=>({...p, routeFromBranchId:e.target.value}))}>
                    <option value="">— None —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>Route: To Branch</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={editVForm.routeToBranchId || ''}
                    onChange={e => setEditVForm(p=>({...p, routeToBranchId:e.target.value}))}>
                    <option value="">— None —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>Active Status</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={editVForm.isActive ? '1' : '0'}
                    onChange={e => setEditVForm(p=>({...p, isActive: e.target.value === '1'}))}>
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
            </div>
            {/* Via Branches for edit */}
            {editVForm.routeFromBranchId && editVForm.routeToBranchId && (
              <div className="sap-via-wrap" style={{marginTop:12}}>
                <label className="sap-via-label"><Navigation size={13}/> Via Branches (intermediate stops)</label>
                <div className="sap-via-list">
                  {branches
                    .filter(b => String(b.id) !== String(editVForm.routeFromBranchId) && String(b.id) !== String(editVForm.routeToBranchId))
                    .map(b => (
                      <label key={b.id} className="sap-via-item">
                        <input type="checkbox"
                          checked={(editVForm.viaBranchIds || []).map(Number).includes(b.id)}
                          onChange={e => setEditVForm(p => ({
                            ...p,
                            viaBranchIds: e.target.checked
                              ? [...(p.viaBranchIds || []), b.id]
                              : (p.viaBranchIds || []).filter(id => Number(id) !== b.id)
                          }))}
                        />
                        <span>{b.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
            <div className="sap-modal-actions">
              <button className="sap-btn sap-btn--secondary" onClick={() => setEditVehicle(null)}>Cancel</button>
              <button className="sap-btn sap-btn--primary" onClick={submitUpdateVehicle}>
                <CheckCircle size={14}/> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASSIGN BRANCH MODAL ═══ */}
      {assignBranchModal && (
        <div className="sap-modal-overlay" onClick={() => setAssignBranchModal(null)}>
          <div className="sap-modal" onClick={e => e.stopPropagation()}>
            <div className="sap-modal-header">
              <GitBranch size={20} style={{color:'#f97316'}}/>
              <h3>Assign Branch — Order #{assignBranchModal.order_number || assignBranchModal.id}</h3>
              <button className="sap-modal-close" onClick={() => setAssignBranchModal(null)}><X size={18}/></button>
            </div>
            <div className="sap-assign-info">
              <span><User size={13}/> {assignBranchModal.customer_name}</span>
              <span><DollarSign size={13}/> ৳{Number(assignBranchModal.total_amount||0).toFixed(2)}</span>
            </div>
            {assignBranchModal.assigned_branch_name && (
              <div className="sap-field-hint" style={{margin:'8px 0',color:'#f97316'}}>
                <AlertCircle size={13}/> Currently assigned to: <strong>{assignBranchModal.assigned_branch_name}</strong>
              </div>
            )}
            <div className="sap-field" style={{margin:'12px 0'}}>
              <label>Select Branch *</label>
              <div className="sap-select-wrap">
                <select className="sap-input" value={bForm.branchId}
                  onChange={e => setBForm({ branchId: e.target.value })}>
                  <option value="">— Select a branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.address ? ` — ${b.address}` : ''}</option>)}
                </select>
                <ChevronDown size={13} className="sap-select-icon"/>
              </div>
            </div>
            <div className="sap-modal-actions">
              <button className="sap-btn sap-btn--secondary" onClick={() => setAssignBranchModal(null)}>Cancel</button>
              <button className="sap-btn sap-btn--primary" onClick={submitAssignBranch} disabled={branchAssigning}>
                {branchAssigning
                  ? <><RefreshCcw size={14} className="sap-spin"/> Assigning...</>
                  : <><GitBranch size={14}/> Assign Branch</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASSIGN DELIVERY MODAL ═══ */}
      {assignModal && (
        <div className="sap-modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="sap-modal sap-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="sap-modal-header">
              <Truck size={20} style={{color:'#10b981'}}/>
              <h3>Assign Delivery — Order #{assignModal.order_number || assignModal.id}</h3>
              <button className="sap-modal-close" onClick={() => setAssignModal(null)}><X size={18}/></button>
            </div>

            <div className="sap-assign-info">
              <span><User size={13}/> {assignModal.customer_name}</span>
              <span><DollarSign size={13}/> ৳{Number(assignModal.total_amount||0).toFixed(2)}</span>
              <span><MapPin size={13}/> {[assignModal.shipping_address, assignModal.shipping_city].filter(Boolean).join(', ') || 'No address'}</span>
            </div>

            <div className="sap-form-grid sap-form-grid--2">
              <div className="sap-field">
                <label>From Branch</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={aForm.fromBranchId} onChange={e => {
                    setAForm(p=>({...p, fromBranchId:e.target.value, deliveryBoyId:'', vehiclePlate:''}));
                    loadAssignResources(e.target.value);
                  }}>
                    <option value="">— Select —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>To Branch</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={aForm.toBranchId}
                    onChange={e => setAForm(p=>({...p, toBranchId:e.target.value}))}>
                    <option value="">— Select —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>Delivery Type</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={aForm.deliveryType}
                    onChange={e => setAForm(p=>({...p, deliveryType:e.target.value}))}>
                    <option value="branch_to_branch">Branch → Branch</option>
                    <option value="branch_to_branch_address">Branch → Address</option>
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              {aForm.deliveryType === 'branch_to_branch_address' && (
                <div className="sap-field">
                  <label>Destination Address</label>
                  <input className="sap-input" placeholder="Enter full address"
                    value={aForm.destAddr} onChange={e => setAForm(p=>({...p, destAddr:e.target.value}))}/>
                </div>
              )}
              <div className="sap-field">
                <label>Weight (kg)</label>
                <input className="sap-input" type="number" step="0.1" min="0.1" placeholder="e.g. 1.5"
                  value={aForm.weight} onChange={e => setAForm(p=>({...p, weight:e.target.value}))}/>
              </div>
              <div className="sap-field">
                <label>Size (feet): {aForm.sizeFeet} ft</label>
                <input className="sap-input" type="range" min="1" max="10"
                  value={aForm.sizeFeet} onChange={e => setAForm(p=>({...p, sizeFeet:Number(e.target.value)}))}/>
              </div>
              <div className="sap-field">
                <label>Packaging</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={aForm.packaging}
                    onChange={e => setAForm(p=>({...p, packaging:e.target.value}))}>
                    <option value="standard">Standard</option>
                    <option value="plastic">Plastic</option>
                    <option value="glass">Glass</option>
                    <option value="fragile">Fragile</option>
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
              </div>
              <div className="sap-field">
                <label>Delivery Boy</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={aForm.deliveryBoyId}
                    onChange={e => setAForm(p=>({...p, deliveryBoyId:e.target.value}))}>
                    <option value="">— Select Delivery Boy —</option>
                    {aBoys.map(b => <option key={b.id} value={b.id}>{b.username} {b.phone ? `(${b.phone})` : ''}</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
                {aBoys.length === 0 && aForm.fromBranchId && (
                  <p className="sap-field-hint"><AlertCircle size={12}/> No delivery boys in this branch</p>
                )}
              </div>
              <div className="sap-field">
                <label>Vehicle</label>
                <div className="sap-select-wrap">
                  <select className="sap-input" value={aVehicles.some(v=>v.plate_number===aForm.vehiclePlate)?aForm.vehiclePlate:''}
                    onChange={e => setAForm(p=>({...p, vehiclePlate:e.target.value}))}>
                    <option value="">— Select Vehicle —</option>
                    {aVehicles.map(v => <option key={v.id} value={v.plate_number}>{v.plate_number} ({v.vehicle_type})</option>)}
                  </select>
                  <ChevronDown size={13} className="sap-select-icon"/>
                </div>
                <input className="sap-input" style={{marginTop:4}} placeholder="Or type plate number manually"
                  value={aForm.vehiclePlate} onChange={e => setAForm(p=>({...p, vehiclePlate:e.target.value}))}/>
              </div>
            </div>

            <div className="sap-modal-actions">
              <button className="sap-btn sap-btn--secondary" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="sap-btn sap-btn--primary" onClick={submitAssignDelivery} disabled={assigning}>
                {assigning ? <><RefreshCcw size={14} className="sap-spin"/> Assigning...</> : <><Truck size={14}/> Assign Delivery</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {changePwOpen && (
        <div className="sap-modal-overlay" onClick={() => setChangePwOpen(false)}>
          <div className="sap-modal sap-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="sap-modal-head">
              <Lock size={18}/>
              <h3>Change Password</h3>
              <button className="sap-modal-close" onClick={() => setChangePwOpen(false)}><X size={18}/></button>
            </div>
            <form className="sap-modal-body" onSubmit={handleChangePassword}>
              <div className="sap-cp-field">
                <label>Current Password</label>
                <div className="sap-cp-input-wrap">
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
              <div className="sap-cp-field">
                <label>New Password</label>
                <div className="sap-cp-input-wrap">
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
              <div className="sap-cp-field">
                <label>Confirm New Password</label>
                <div className="sap-cp-input-wrap">
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={changePwForm.confirm_password}
                    onChange={e => setChangePwForm(f => ({ ...f, confirm_password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="sap-modal-actions">
                <button type="button" className="sap-btn sap-btn--secondary" onClick={() => setChangePwOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sap-btn sap-btn--primary" disabled={changePwLoading}>
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

export default StaffAdminPanel;
