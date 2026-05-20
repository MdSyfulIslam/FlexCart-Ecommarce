const express = require('express');
const router = express.Router();
const requestProductController = require('../controllers/requestProductController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, requestProductController.getRequestedProducts);
router.post('/', authenticateToken, requestProductController.requestProduct);
router.delete('/:id', authenticateToken, requestProductController.removeRequest);

module.exports = router;