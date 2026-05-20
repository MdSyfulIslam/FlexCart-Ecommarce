import api from './api';

const deliveryService = {
  getBranches: () => api.get('/delivery/branches'),
  getPricing: () => api.get('/delivery/pricing'),
  getBranchResources: (branchId) => api.get('/delivery/branch-resources', { params: { branchId } }),
  getRouteQuote: (fromBranchId, toBranchId, deliveryType) => api.get('/delivery/route-quote', {
    params: { fromBranchId, toBranchId, deliveryType }
  }),
  getOrderForDelivery: (orderNumber) => api.get(`/delivery/orders/${encodeURIComponent(orderNumber)}`),
  getBranchAssignments: (branchId) => api.get('/delivery/branch-assignments', { params: branchId ? { branchId } : {} }),
  acceptBranchAssignment: (orderNumber) => api.post(`/delivery/branch-assignments/${encodeURIComponent(orderNumber)}/accept`),
  getBranchStats: (params) => api.get('/delivery/branch-stats', { params: params || {} }),
  assignDelivery: (payload) => api.post('/delivery/assign', payload),
  assignRouteToOrder: (payload) => api.post('/delivery/assign-route', payload),
  assignVehicleToOrder: (payload) => api.post('/delivery/assign-vehicle', payload),
  getHistory: (date, search) => api.get('/delivery/history', { params: { date, search } }),
  getDeliveriesForBranch: (params) => api.get('/delivery/deliveries', { params }),
  reassignOrderBranch: (orderNumber, branchId) => api.post(`/delivery/orders/${encodeURIComponent(orderNumber)}/reassign-branch`, { branchId }),
  assignToDeliveryBoy: (orderNumber, deliveryBoyUserId) => api.post(`/delivery/orders/${encodeURIComponent(orderNumber)}/assign-to-boy`, { deliveryBoyUserId }),

  // Route and hub management
  getHubs: (includeInactive = false) => api.get('/delivery/hubs', { params: { includeInactive } }),
  createHub: (payload) => api.post('/delivery/hubs', payload),
  updateHub: (hubId, payload) => api.put(`/delivery/hubs/${hubId}`, payload),
  getRoutes: (includeInactive = false) => api.get('/delivery/routes', { params: { includeInactive } }),
  createRoute: (payload) => api.post('/delivery/routes', payload),
  updateRoute: (routeId, payload) => api.put(`/delivery/routes/${routeId}`, payload),
  deleteRoute: (routeId) => api.delete(`/delivery/routes/${routeId}`),

  // Tracking
  updateTrackingStatus: (payload) => api.post('/delivery/tracking/status', payload),
  getTrackingTimeline: (orderNumber) => api.get(`/delivery/tracking/${encodeURIComponent(orderNumber)}`),

  // Delivery boy (authenticated)
  getDriverStats: (params) => api.get('/delivery/driver/stats', { params }),
  getDriverAssignments: (params) => api.get('/delivery/driver/assignments', { params }),
  getDriverHistory: (params) => api.get('/delivery/driver/history', { params }),
  getDriverAllDeliveries: (params) => api.get('/delivery/driver/all', { params }),
  completeDelivery: (formData) => api.post('/delivery/driver/complete', formData),
  rejectDelivery: (orderNumber, reason) => api.post('/delivery/driver/reject', { orderNumber, reason }),
};

export default deliveryService;
