import React, { createContext, useState, useCallback, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import { NotificationContext } from './NotificationContext';
import api from '../services/api';

export const CompanyContext = createContext();

export const CompanyProvider = ({ children }) => {
    const { isAuthenticated } = useContext(AuthContext);
    // NotificationContext may not always be available (optional dependency)
    const notifCtx = useContext(NotificationContext);
    const notifications = notifCtx?.notifications || [];

    const [myCompanies, setMyCompanies] = useState([]);
    const [activeCompany, setActiveCompany] = useState(null);
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetchedOnce, setFetchedOnce] = useState(false);
    const [companyNotifications, setCompanyNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchMyCompanies = useCallback(async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const res = await api.get('/companies/my-companies');
            if (res.data.success) {
                // Extra safety: strip any deleted/suspended entries the server may return
                const valid = res.data.data.filter(c => c.status !== 'deleted' && c.status !== 'suspended');
                setMyCompanies(valid);
                setActiveCompany(prev => {
                    // No prior active company — pick the first valid one
                    if (!prev) return valid.length > 0 ? valid[0] : null;
                    // Current active company still exists — use fresh server data so status changes (e.g. pending→approved) are reflected
                    const stillExists = valid.find(c => c.id === prev.id);
                    if (stillExists) return stillExists;
                    // Current active was deleted — switch to first remaining or null
                    return valid.length > 0 ? valid[0] : null;
                });
            }
        } catch (err) {
            console.error('Fetch companies error:', err);
        } finally {
            setLoading(false);
            setFetchedOnce(true);
        }
    }, [isAuthenticated]);

    // Auto-fetch companies whenever auth state changes
    useEffect(() => {
        if (isAuthenticated) fetchMyCompanies();
    }, [isAuthenticated, fetchMyCompanies]);

    // When a company_approved or company_rejected notification arrives (polled every 8s by
    // NotificationContext), immediately refetch company list so the UI reflects the new status
    // without the user needing to manually refresh.
    useEffect(() => {
        if (!isAuthenticated || !notifications.length) return;
        const hasStatusChange = notifications.some(
            n => n.type === 'company_approved' || n.type === 'company_rejected'
        );
        if (hasStatusChange) fetchMyCompanies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notifications]);

    const switchCompany = (company) => {
        setActiveCompany(company);
        setDashboardData(null);
    };

    const fetchCompanyDashboard = useCallback(async (companyId, { silent = false } = {}) => {
        if (!isAuthenticated || !companyId) return;
        if (!silent) setLoading(true);
        try {
            const res = await api.get(`/companies/dashboard/${companyId}`);
            if (res.data.success) {
                setDashboardData(res.data.data);
                // Sync all company fields from dashboard into activeCompany
                if (res.data.data.company) {
                    setActiveCompany(prev => {
                        if (!prev || prev.id !== companyId) return prev;
                        const incoming = res.data.data.company;
                        // Only create a new object if something actually changed
                        const changed = Object.keys(incoming).some(
                            k => prev[k] !== incoming[k]
                        );
                        if (!changed) return prev;
                        return { ...prev, ...incoming };
                    });
                }
            }
        } catch (err) {
            console.error('Fetch dashboard error:', err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    const fetchCompanyNotifications = useCallback(async (companyId) => {
        if (!isAuthenticated || !companyId) return;
        try {
            const res = await api.get(`/companies/${companyId}/notifications`);
            if (res.data.success) {
                setCompanyNotifications(res.data.data);
                setUnreadCount(res.data.data.filter(n => !n.is_read).length);
            }
        } catch (err) {
            console.error('Fetch company notifications error:', err);
        }
    }, [isAuthenticated]);

    const markNotificationRead = async (companyId, notificationId) => {
        if (!isAuthenticated) return;
        try {
            await api.put(`/companies/${companyId}/notifications/${notificationId}/read`);
            setCompanyNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: 1 } : n)
            );
            setUnreadCount(prev => Math.max(prev - 1, 0));
        } catch (err) {
            console.error('Mark notification read error:', err);
        }
    };

    const createCompany = async (formData) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.post('/companies', formData);
            if (res.data.success) {
                setMyCompanies(prev => [res.data.data, ...prev]);
                if (!activeCompany) setActiveCompany(res.data.data);
            }
            return res.data;
        } catch (err) {
            console.error('Create company error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    const updateCompany = async (formData) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.put('/companies', formData);
            if (res.data.success) {
                setMyCompanies(prev =>
                    prev.map(c => c.id === res.data.data.id ? res.data.data : c)
                );
                if (activeCompany?.id === res.data.data.id) {
                    setActiveCompany(res.data.data);
                }
            }
            return res.data;
        } catch (err) {
            console.error('Update company error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    const addProduct = async (formData) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.post('/companies/products', formData);
            if (res.data.success && activeCompany) {
                fetchCompanyDashboard(activeCompany.id);
            }
            return res.data;
        } catch (err) {
            console.error('Add product error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error',
                debug: err.response?.data?.debug || null
            };
        }
    };

    const updateProduct = async (productId, formData) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.put(`/companies/products/${productId}`, formData);
            if (res.data.success && activeCompany) {
                fetchCompanyDashboard(activeCompany.id);
            }
            return res.data;
        } catch (err) {
            console.error('Update product error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    const deleteProduct = async (productId) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.delete(`/companies/products/${productId}`);
            if (res.data.success && activeCompany) {
                fetchCompanyDashboard(activeCompany.id);
            }
            return res.data;
        } catch (err) {
            console.error('Delete product error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    const getBranchOptionsForOrder = async (companyId, orderNumber) => {
        if (!isAuthenticated) return { success: false, data: [] };
        try {
            const res = await api.get(`/companies/${companyId}/orders/${encodeURIComponent(orderNumber)}/branch-options`);
            return res.data;
        } catch (err) {
            console.error('Get branch options error:', err);
            return {
                success: false,
                data: [],
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    const assignOrderToBranch = async (companyId, orderNumber, branchId) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.post(`/companies/${companyId}/orders/${encodeURIComponent(orderNumber)}/assign-branch`, { branchId });
            if (res.data.success && activeCompany?.id === companyId) {
                fetchCompanyDashboard(companyId);
            }
            return res.data;
        } catch (err) {
            console.error('Assign order to branch error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    const deletePromoBanner = async (companyId) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.delete('/companies/promo-banner', { data: { company_id: companyId } });
            if (res.data.success) {
                const updater = c => c.id === companyId ? { ...c, promo_banner: null } : c;
                setMyCompanies(prev => prev.map(updater));
                if (activeCompany?.id === companyId) {
                    setActiveCompany(prev => ({ ...prev, promo_banner: null }));
                }
            }
            return res.data;
        } catch (err) {
            console.error('Delete promo banner error:', err);
            return { success: false, message: err.response?.data?.message || 'Network error' };
        }
    };

    const deleteCompany = async (companyId) => {
        if (!isAuthenticated) return { success: false };
        try {
            const res = await api.delete(`/companies/${companyId}`);
            if (res.data.success) {
                const remaining = myCompanies.filter(c => c.id !== companyId);
                setMyCompanies(remaining);
                if (activeCompany?.id === companyId) {
                    setActiveCompany(remaining.length > 0 ? remaining[0] : null);
                    setDashboardData(null);
                }
            }
            return res.data;
        } catch (err) {
            console.error('Delete company error:', err);
            return {
                success: false,
                message: err.response?.data?.message || 'Network error'
            };
        }
    };

    return (
        <CompanyContext.Provider value={{
            myCompanies,
            activeCompany,
            dashboardData,
            loading,
            fetchedOnce,
            companyNotifications,
            unreadCount,
            fetchMyCompanies,
            switchCompany,
            fetchCompanyDashboard,
            fetchCompanyNotifications,
            markNotificationRead,
            createCompany,
            updateCompany,
            deleteCompany,
            deletePromoBanner,
            addProduct,
            updateProduct,
            deleteProduct,
            getBranchOptionsForOrder,
            assignOrderToBranch
        }}>
            {children}
        </CompanyContext.Provider>
    );
};