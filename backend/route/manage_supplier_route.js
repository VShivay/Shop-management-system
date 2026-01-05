// route/manage_supplier_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const manageSupplierController = require('../controller/manage_supplier');

// READ
router.get('/', auth, manageSupplierController.getSuppliers);
router.get('/:id', auth, manageSupplierController.getSupplierById);

// WRITE - Supplier Profile
router.post('/', auth, manageSupplierController.addSupplier);         // Create new supplier
router.put('/:id', auth, manageSupplierController.updateSupplier);    // Update supplier info

// WRITE - Product Linking
// POST /api/suppliers/:id/products -> Link a product to this supplier
router.post('/:id/products', auth, manageSupplierController.linkProduct); 

// DELETE /api/suppliers/:id/products/:productId -> Unlink specific product
router.delete('/:id/products/:productId', auth, manageSupplierController.unlinkProduct); 
router.get('/product', auth, manageSupplierController.getProducts);

module.exports = router;