// route/manage_supplier_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const manageSupplierController = require('../controller/manage_supplier');

// IMPORTANT: Specific routes MUST come before parameterized routes
// Place /product route BEFORE /:id route
router.get('/product', auth, manageSupplierController.getProducts);

// READ - Supplier routes
router.get('/', auth, manageSupplierController.getSuppliers);
router.get('/:id', auth, manageSupplierController.getSupplierById);

// WRITE - Supplier Profile
router.post('/', auth, manageSupplierController.addSupplier);
router.put('/:id', auth, manageSupplierController.updateSupplier);

// WRITE - Product Linking
router.post('/:id/products', auth, manageSupplierController.linkProduct);
router.delete('/:id/products/:productId', auth, manageSupplierController.unlinkProduct);

module.exports = router;