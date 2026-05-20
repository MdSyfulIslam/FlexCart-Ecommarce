import api from './api';

const favouriteService = {
  getFavourites: () => api.get('/favourites'),
  toggleFavourite: (productId) => api.post('/favourites', { product_id: productId }),
  checkFavourite: (productId) => api.get(`/favourites/check/${productId}`)
};

export default favouriteService;