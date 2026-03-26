const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const verifyToken = require('../middleware/auth');

// Base path: /api/wishlist

// Toggle wishlist item (add or remove)
router.post('/toggle', verifyToken, wishlistController.toggleWishlist);

// Get all wishlist items for a user
router.get('/', verifyToken, wishlistController.getWishlist);

module.exports = router;
