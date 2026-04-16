const express = require('express');
const router = express.Router();
const restockController = require('../controller/restock_product');
const auth = require('../middleware/auth');
const allowed = ['shop owner', 'admin'];


// GET /api/restock
// Query Params: ?page=1&limit=10&search=keyword
// If search is empty, it returns Low Stock items.
router.get('/', auth,auth.authorize(allowed), restockController.getProductsToRestock);

// POST /api/restock
// Body: { product_id, supplier_id, quantity, supply_price }
router.post('/', auth,auth.authorize(allowed), restockController.restockProduct);

router.get('/', auth,auth.authorize(allowed), restockController.getAllSuppliers);

module.exports = router;