// route/manage_product_route.js
const express = require('express');
const router = express.Router();
const productController = require('../controller/manage_product');
const auth = require('../middleware/auth');
const allowed = ['shop owner', 'admin'];

// Route: GET /products
// Description: Fetch all products with filters
// Access: Protected
router.get('/products', auth,auth.authorize(allowed), productController.getProducts);

// Route: GET /products/options
// Description: Fetch dropdown data (categories, units, suppliers)
// NOTE: Must be defined BEFORE /products/:id to prevent conflict
// Access: Protected
router.get('/products/dropdowns', auth,auth.authorize(allowed), productController.getProductDropdowns);

// Route: POST /products
// Description: Add a new product (Transactional)
// Access: Protected
router.post('/products', auth,auth.authorize(allowed), productController.addProduct);

// Route: PUT /products/:id
// Description: Update an existing product (Transactional)
// Access: Protected
router.put('/products/:id', auth,auth.authorize(allowed), productController.updateProduct);

// Route: GET /products/:id
// Description: Get full details of a specific product
// Access: Protected
router.get('/products/:id', auth,auth.authorize(allowed), productController.getProductDetails);

// Route: PATCH /products/:id/archive
// Description: Soft delete (Archive) a product
// Access: Protected
router.patch('/products/:id/archive', auth,auth.authorize(allowed), productController.archiveProduct);

// Route: DELETE /products/:id
// Description: Hard delete (Permanent) a product
// Access: Protected (Ideally restrict to Admin only)
router.delete('/products/:id', auth,auth.authorize(allowed), productController.deleteProduct);

module.exports = router;