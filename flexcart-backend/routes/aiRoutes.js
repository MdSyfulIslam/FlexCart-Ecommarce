const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateToken, optionalAuth, requireRoles } = require('../middleware/auth');
const { uploadAI } = require('../middleware/upload');

router.post('/process', optionalAuth, uploadAI.single('image'), aiController.processImage);
router.get('/history', authenticateToken, aiController.getSearchHistory);
router.post('/reindex', authenticateToken, requireRoles('super_admin'), aiController.reindexProducts);

module.exports = router;