const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/', auth, orderController.createOrder);
router.get('/', auth, orderController.getOrders);
router.get('/myorders', auth, orderController.getMyOrders);
router.get('/myorders/:id', auth, orderController.getOrderById);
router.put('/:id/deliver', auth, orderController.updateOrderStatus);
router.delete('/:id/pending', auth, orderController.deletePendingOrder);

router.post('/:id/return', auth, upload.array('images', 5), orderController.requestReturn);
router.put('/return/:returnId/status', auth, orderController.updateReturnStatus);

module.exports = router;
