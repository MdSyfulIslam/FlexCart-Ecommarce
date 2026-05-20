const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIPN,
  getPaymentStatus,
} = require('../controllers/paymentController');

// Callbacks from SSLCommerz — NO auth (SSLCommerz calls these directly)
router.post('/success', paymentSuccess);
router.post('/fail',    paymentFail);
router.post('/cancel',  paymentCancel);
router.post('/ipn',     paymentIPN);

// Authenticated: check payment status for a specific order
router.get('/status/:orderNumber', authenticateToken, getPaymentStatus);

module.exports = router;
