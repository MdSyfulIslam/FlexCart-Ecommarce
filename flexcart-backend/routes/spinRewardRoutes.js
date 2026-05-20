const express = require('express');
const router = express.Router();
const spinRewardController = require('../controllers/spinRewardController');
const { authenticateToken } = require('../middleware/auth');

router.get('/check', authenticateToken, spinRewardController.checkSpinEligibility);
router.post('/spin', authenticateToken, spinRewardController.spin);
router.get('/history', authenticateToken, spinRewardController.getSpinHistory);

module.exports = router;