const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, cartController.getCart);
router.post('/', authenticateToken, cartController.addToCart);
router.put('/:id', authenticateToken, cartController.updateCartItem);
router.delete('/:id', authenticateToken, cartController.removeFromCart);
router.delete('/', authenticateToken, cartController.clearCart);

module.exports = router;