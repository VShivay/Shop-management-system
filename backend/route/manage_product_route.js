// route/manage_product_route.js
const express = require('express');
const router = express.Router();
const productController = require('../controller/manage_product');
const auth = require('../middleware/auth');

// Route: GET /products
// Description: Fetch all products with filters
// Access: Protected
router.get('/products', auth, productController.getProducts);

// Route: GET /products/options
// Description: Fetch dropdown data (categories, units, suppliers)
// NOTE: Must be defined BEFORE /products/:id to prevent conflict
// Access: Protected
router.get('/products/dropdowns', auth, productController.getProductDropdowns);

// Route: POST /products
// Description: Add a new product (Transactional)
// Access: Protected
router.post('/products', auth, productController.addProduct);

// Route: PUT /products/:id
// Description: Update an existing product (Transactional)
// Access: Protected
router.put('/products/:id', auth, productController.updateProduct);

// Route: GET /products/:id
// Description: Get full details of a specific product
// Access: Protected
router.get('/products/:id', auth, productController.getProductDetails);

// Route: PATCH /products/:id/archive
// Description: Soft delete (Archive) a product
// Access: Protected
router.patch('/products/:id/archive', auth, productController.archiveProduct);

// Route: DELETE /products/:id
// Description: Hard delete (Permanent) a product
// Access: Protected (Ideally restrict to Admin only)
router.delete('/products/:id', auth, productController.deleteProduct);

module.exports = router;