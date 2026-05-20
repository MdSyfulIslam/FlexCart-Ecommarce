const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/admin-login', authController.adminLogin);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);
router.get('/linked-accounts', authenticateToken, authController.getLinkedAccounts);
router.post('/link-account', authenticateToken, authController.linkAccount);
router.post('/unlink-account', authenticateToken, authController.unlinkAccount);
router.post('/switch-account', authenticateToken, authController.switchAccount);

module.exports = router;