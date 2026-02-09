const express = require('express');
const router = express.Router();
const restockController = require('../controller/restock_product');
const auth = require('../middleware/auth');

// GET /api/restock
// Query Params: ?page=1&limit=10&search=keyword
// If search is empty, it returns Low Stock items.
router.get('/', auth, restockController.getProductsToRestock);

// POST /api/restock
// Body: { product_id, supplier_id, quantity, supply_price }
router.post('/', auth, restockController.restockProduct);

router.get('/', auth, supplierController.getAllSuppliers);

module.exports = router;