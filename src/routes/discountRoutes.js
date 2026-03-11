const express = require('express');
const router = express.Router();
const { getDiscounts, createDiscount, updateDiscount, deleteDiscount, validateDiscount } = require('../controllers/discountController');
const auth = require('../middleware/auth');

router.get('/', auth, getDiscounts);
router.post('/', auth, createDiscount);
router.put('/:id', auth, updateDiscount);
router.delete('/:id', auth, deleteDiscount);
router.post('/validate', auth, validateDiscount);

module.exports = router;
