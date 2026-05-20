import api from './api';

const adminService = {
  // ─── Staff Admin Operations ───────────────────────────────
  getStaffDashboard:    ()          => api.get('/staff-admin/dashboard'),
  getBranches:          ()          => api.get('/staff-admin/branches'),
  createBranch:         (data)      => api.post('/staff-admin/branches', data),
  updateBranch:         (id, data)  => api.put(`/staff-admin/branches/${id}`, data),
  deleteBranch:         (id)        => api.delete(`/staff-admin/branches/${id}`),

  getPersonnel:         (params)    => api.get('/staff-admin/personnel', { params }),
  createPersonnel:      (data)      => api.post('/staff-admin/personnel', data),
  updatePersonnel:      (id, data)  => api.put(`/staff-admin/personnel/${id}`, data),
  togglePersonnelPause: (id)        => api.patch(`/staff-admin/personnel/${id}/toggle-pause`),
  deletePersonnel:      (id)        => api.delete(`/staff-admin/personnel/${id}`),

  getVehicles:          (params)    => api.get('/staff-admin/vehicles', { params }),
  createVehicle:        (data)      => api.post('/staff-admin/vehicles', data),
  updateVehicle:        (id, data)  => api.put(`/staff-admin/vehicles/${id}`, data),
  deleteVehicle:        (id)        => api.delete(`/staff-admin/vehicles/${id}`),

  getStaffOrders:       (params)    => api.get('/staff-admin/orders', { params }),
  updateOrderStatus:    (id, data)  => api.patch(`/staff-admin/orders/${id}/status`, data),
  assignBranchToOrder:  (id, data)  => api.post(`/staff-admin/orders/${id}/assign-branch`, data),
  assignDeliveryToOrder:(id, data)  => api.post(`/staff-admin/orders/${id}/assign-delivery`, data),
  cancelOrderDelivery:  (id)        => api.delete(`/staff-admin/orders/${id}/cancel-delivery`),

  getStaffUsers:        (params)    => api.get('/staff-admin/users', { params }),

  getStaffProducts:     (params)    => api.get('/staff-admin/products', { params }),
  toggleProductStatus:  (id)        => api.patch(`/staff-admin/products/${id}/status`),

  getBranchStats:       (params)    => api.get('/staff-admin/branch-stats', { params }),
  getAnalytics:         (params)    => api.get('/staff-admin/analytics', { params }),
  getFeedback:          ()          => api.get('/staff-admin/feedback'),
  getAdminNotifications:()          => api.get('/staff-admin/notifications'),
  getAuditLogs:         (params)    => api.get('/staff-admin/audit-logs', { params }),

  // ─── Company Verifications ────────────────────────────────────
  getCompanyVerifications:  (params) => api.get('/staff-admin/verifications', { params }).then(r => r.data),
  approveCompanyVerification: (id)   => api.post(`/staff-admin/verifications/${id}/approve`).then(r => r.data),
  rejectCompanyVerification:  (id, data) => api.post(`/staff-admin/verifications/${id}/reject`, data).then(r => r.data),

  // ─── Super Admin Operations ───────────────────────────────
  getSuperDashboard:    ()          => api.get('/super-admin/dashboard'),

  // ─── Super Admin: Branches ───────────────────────────────
  superGetBranches:     ()          => api.get('/super-admin/branches'),
  superCreateBranch:    (data)      => api.post('/super-admin/branches', data),
  superUpdateBranch:    (id, data)  => api.put(`/super-admin/branches/${id}`, data),
  superDeleteBranch:    (id)        => api.delete(`/super-admin/branches/${id}`),

  listStaffAdmins:      ()          => api.get('/super-admin/staff-admins'),
  createStaffAdmin:     (data)      => api.post('/super-admin/staff-admins', data),
  updateStaffAdmin:     (id, data)  => api.put(`/super-admin/staff-admins/${id}`, data),
  toggleStaffAdminStatus:(id)       => api.patch(`/super-admin/staff-admins/${id}/toggle-status`),
  deleteStaffAdmin:     (id)        => api.delete(`/super-admin/staff-admins/${id}`),

  getSuperUsers:        (params)    => api.get('/super-admin/users', { params }),
  toggleUserStatus:     (id)        => api.patch(`/super-admin/users/${id}/toggle-status`),

  getSettings:          ()          => api.get('/super-admin/settings'),
  updateSetting:        (key, value)=> api.put('/super-admin/settings', { key, value }),

  getRevenueAnalytics:  (params)    => api.get('/super-admin/revenue', { params }),
  getRevenueHistory:    (params)    => api.get('/super-admin/revenue/history', { params }),

  getCategoryCommissions: ()        => api.get('/super-admin/commissions'),
  updateCategoryCommission: (categoryId, rate) =>
    api.put(`/super-admin/commissions/${categoryId}`, { commission_rate: rate }),

  getDeliveryCharge:    (params)    => api.get('/orders/delivery-charge', { params }),

  getAdPromotions:      ()          => api.get('/super-admin/ads'),
  createAdPromotion:    (formData)  => api.post('/super-admin/ads', formData),
  updateAdPromotion:    (id, formData) => api.put(`/super-admin/ads/${id}`, formData),
  deleteAdPromotion:    (id)        => api.delete(`/super-admin/ads/${id}`),

  getAuditLog:          (params)    => api.get('/super-admin/audit-log', { params }),

  // ─── Super Admin: All Staff ───────────────────────────────
  getAllStaff:           (params)    => api.get('/super-admin/all-staff', { params }),
  updateAnyStaff:        (id, data)  => api.put(`/super-admin/all-staff/${id}`, data),
  toggleAnyStaffStatus:  (id)        => api.patch(`/super-admin/all-staff/${id}/toggle-status`),

  // ─── Super Admin: Branch Details ─────────────────────────
  getBranchDetails:      (id)        => api.get(`/super-admin/branches/${id}/details`),

  // ─── Staff Admin: Company Warning ────────────────────────
  sendCompanyWarning:    (feedbackId, data) => api.post(`/staff-admin/feedback/${feedbackId}/warn-company`, data),

  // Legacy
  getPendingRequests:   ()          => api.get('/super-admin/requests'),
  reviewRequest:        (id, status)=> api.put(`/super-admin/requests/${id}`, { status }),
};

export default adminService;
