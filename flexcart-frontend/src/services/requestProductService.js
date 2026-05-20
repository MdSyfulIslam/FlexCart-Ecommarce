import api from './api';

const requestProductService = {
  getRequestedProducts: () => api.get('/product-requests'),
  requestProduct: (productId) => api.post('/product-requests', { product_id: productId }),
  removeRequest: (id) => api.delete(`/product-requests/${id}`)
};

export default requestProductService;