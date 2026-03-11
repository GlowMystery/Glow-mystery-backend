const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');

// Configure multer for memory storage (we will stream this to Cloudinary directly)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', authController.register);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.login);

// @route   POST api/auth/forgot-password
// @desc    Send OTP to email
// @access  Public
router.post('/forgot-password', authController.forgotPassword);

// @route   POST api/auth/reset-password
// @desc    Reset password using OTP
// @access  Public
router.post('/reset-password', authController.resetPassword);

// @route   POST api/auth/verify-email
// @desc    Verify email address using OTP
// @access  Public
router.post('/verify-email', authController.verifyEmail);

// @route   GET api/auth/profile
// @desc    Get logged in user profile
// @access  Private
router.get('/profile', authMiddleware, authController.getProfile);

// @route   PUT api/auth/profile
// @desc    Update logged in user profile (Supports multipart/form-data for image upload)
// @access  Private
router.put('/profile', authMiddleware, upload.single('profileImage'), authController.updateProfile);

module.exports = router;
