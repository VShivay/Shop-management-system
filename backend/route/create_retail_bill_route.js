const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const billController = require('../controller/create_retail_bill');
const pdfController = require('../pdf/create_retail_bill_pdf');

// Define who can access these routes
const allowed = ['shop owner', 'admin', 'staff', 'cashier'];
// 1. Helper Routes
router.get('/retail/search-products', auth, auth.authorize(allowed), billController.searchProducts);
router.get('/retail/search-customers', auth, auth.authorize(allowed), billController.searchCustomers);
router.get('/retail/metadata', auth, auth.authorize(allowed), billController.getBillMetadata);

// 2. Create Bill Route
router.post('/retail/create', auth, auth.authorize(allowed), billController.createRetailBill);

// 3. Generate PDF Route
router.get('/retail/pdf/:billId', auth,auth.authorize(allowed), pdfController.generateRetailBillPDF);

module.exports = router;