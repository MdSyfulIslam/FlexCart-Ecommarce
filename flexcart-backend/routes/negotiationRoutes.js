const express = require('express');
const router = express.Router();
const negotiationController = require('../controllers/negotiationController');
const { authenticateToken } = require('../middleware/auth');

router.post('/start', authenticateToken, negotiationController.startNegotiation);
router.post('/message', authenticateToken, negotiationController.sendMessage);
router.get('/price/:productId', authenticateToken, negotiationController.getNegotiatedPrice);
router.get('/seller/rules', authenticateToken, negotiationController.getSellerNegotiationRules);
router.post('/seller/rules', authenticateToken, negotiationController.saveSellerNegotiationRules);

module.exports = router;