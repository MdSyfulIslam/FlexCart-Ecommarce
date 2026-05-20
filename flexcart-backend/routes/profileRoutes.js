const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { authenticateToken } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

router.get('/', authenticateToken, profileController.getProfile);
router.put('/', authenticateToken, uploadProfile.single('profile_image'), profileController.updateProfile);
router.post('/upload-image', authenticateToken, uploadProfile.single('profile_image'), profileController.uploadProfileImage);

module.exports = router;