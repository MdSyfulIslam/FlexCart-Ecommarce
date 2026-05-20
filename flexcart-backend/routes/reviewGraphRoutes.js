const express = require('express');
const router = express.Router();
const reviewGraphController = require('../controllers/reviewGraphController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, reviewGraphController.getGraphData);

module.exports = router;