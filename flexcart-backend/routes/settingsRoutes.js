const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, settingsController.getSettings);
router.put('/', authenticateToken, settingsController.updateSettings);
router.put('/theme', authenticateToken, settingsController.updateTheme);
router.put('/appearance-color', authenticateToken, settingsController.updateAppearanceColor);
router.put('/background', authenticateToken, settingsController.updateBackground);
router.get('/background-themes', settingsController.getBackgroundThemes);
router.put('/change-password', authenticateToken, settingsController.changePassword);

module.exports = router;