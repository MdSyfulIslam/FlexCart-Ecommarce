const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Public routes
router.get('/', optionalAuth, productController.getProducts);
router.get('/search', optionalAuth, productController.searchProducts);
router.get('/categories', productController.getCategories);
router.get('/recommendations/hybrid', optionalAuth, productController.getHybridRecommendations);
router.get('/recommendations/hybrid/debug', authenticateToken, productController.getHybridRecommendationsDebug);
router.get('/:id', optionalAuth, productController.getProductById);
router.get('/:id/compare', optionalAuth, productController.compareSimilarProducts);
router.get('/:id/comments', optionalAuth, productController.getComments);
router.get('/:id/reviews', optionalAuth, productController.getReviews);

// Auth required routes
router.post('/:id/comments', authenticateToken, productController.addComment);
router.post('/:id/reviews', authenticateToken, productController.addReview);
router.put('/:id/reviews/:reviewId/reply', authenticateToken, productController.addSellerReply);

module.exports = router;