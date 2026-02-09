// route/manage_supplier_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const manageSupplierController = require('../controller/manage_supplier');
const allowed = ['shop owner', 'admin', 'staff', 'cashier'];


// IMPORTANT: Specific routes MUST come before parameterized routes
// Place /product route BEFORE /:id route
router.get('/product', auth,auth.authorize(allowed), manageSupplierController.getProducts);

// READ - Supplier routes
router.get('/', auth,auth.authorize(allowed), manageSupplierController.getSuppliers);
router.get('/:id', auth,auth.authorize(allowed), manageSupplierController.getSupplierById);

// WRITE - Supplier Profile
router.post('/', auth,auth.authorize(allowed), manageSupplierController.addSupplier);
router.put('/:id', auth,auth.authorize(allowed), manageSupplierController.updateSupplier);

// WRITE - Product Linking
router.post('/:id/products', auth,auth.authorize(allowed), manageSupplierController.linkProduct);
router.delete('/:id/products/:productId', auth,auth.authorize(allowed), manageSupplierController.unlinkProduct);

module.exports = router;