const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');

router.post('/create-checkout-session', auth, paymentController.createCheckoutSession);
router.post('/verify-session', auth, paymentController.verifySession);

// Webhook must be raw body, usually handled at app level before express.json()
// Here we are just exporting the route, make sure to mount it correctly in server.js
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.stripeWebhook);

module.exports = router;
