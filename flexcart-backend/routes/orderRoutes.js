const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');

router.get('/delivery-charge', orderController.getDeliveryCharge);
router.post('/', authenticateToken, orderController.createOrder);
router.post('/buy-now', authenticateToken, orderController.buyNow);
router.post('/validate-promo', authenticateToken, orderController.validatePromo);
router.get('/', authenticateToken, orderController.getOrderHistory);
router.get('/:id', authenticateToken, orderController.getOrderById);

module.exports = router;