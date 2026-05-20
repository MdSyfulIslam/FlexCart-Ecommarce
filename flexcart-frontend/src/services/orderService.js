import api from './api';

const orderService = {
  createOrder: (orderData) => api.post('/orders', orderData),
  buyNow: (data) => api.post('/orders/buy-now', data),
  getOrderHistory: (params) => api.get('/orders', { params }),
  getOrderById: (id) => api.get(`/orders/${id}`)
};

export default orderService;