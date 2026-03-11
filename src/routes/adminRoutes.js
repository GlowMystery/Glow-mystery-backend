const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

router.get('/dashboard', auth, adminController.getDashboardStats);

// Users
router.get('/users', auth, adminController.getAllUsers);
router.post('/users', auth, adminController.addUser);
router.put('/users/:id', auth, adminController.updateUser);
router.delete('/users/:id', auth, adminController.deleteUser);

// Reviews
router.get('/reviews', auth, adminController.getAllReviews);
router.delete('/reviews/:id', auth, adminController.deleteReview);

module.exports = router;
