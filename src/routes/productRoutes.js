const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth = require('../middleware/auth');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// @route   GET api/products
router.get('/', productController.getProducts);

// @route   GET api/products/:id
router.get('/:id', productController.getProductById);

// @route   POST api/products
router.post('/', auth, upload.single('image'), productController.createProduct);

// @route   PUT api/products/:id
router.put('/:id', auth, upload.single('image'), productController.updateProduct);

// @route   DELETE api/products/:id
router.delete('/:id', auth, productController.deleteProduct);

// @route   POST api/products/:id/reviews
router.post('/:id/reviews', auth, productController.addProductReview);

module.exports = router;
