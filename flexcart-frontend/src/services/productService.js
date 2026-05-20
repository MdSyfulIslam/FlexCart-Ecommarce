import api from './api';

const productService = {
  getProducts: (params) => api.get('/products', { params }),
  getProductById: (id) => api.get(`/products/${id}`),
  searchProducts: (query) => api.get('/products/search', { params: { q: query } }),
  getCategories: () => api.get('/products/categories'),
  getHybridRecommendations: (params) => api.get('/products/recommendations/hybrid', { params }),
  compareSimilarProducts: (productId) => api.get(`/products/${productId}/compare`),
  createProduct: (formData) => api.post('/products', formData)
};

export default productService;