import api from './api';

const cartService = {
  getCart: () => api.get('/cart'),
  addToCart: (productId, quantity) => api.post('/cart', { product_id: productId, quantity }),
  updateQuantity: (cartItemId, quantity) => api.put(`/cart/${cartItemId}`, { quantity }),
  removeItem: (cartItemId) => api.delete(`/cart/${cartItemId}`),
  clearCart: () => api.delete('/cart')
};

export default cartService;