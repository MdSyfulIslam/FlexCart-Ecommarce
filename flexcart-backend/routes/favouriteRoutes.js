const express = require('express');
const router = express.Router();
const favouriteController = require('../controllers/favouriteController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, favouriteController.getFavourites);
router.post('/', authenticateToken, favouriteController.toggleFavourite);
router.get('/check/:product_id', authenticateToken, favouriteController.checkFavourite);

module.exports = router;