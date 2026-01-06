const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Your provided middleware
const billController = require('../controller/create_retail_bill');
const pdfController = require('../pdf/create_retail_bill_pdf');

// 1. Helper Routes (Debounce & Metadata)
router.get('/retail/search-products', auth, billController.searchProducts);
router.get('/retail/search-customers', auth, billController.searchCustomers);
router.get('/retail/metadata', auth, billController.getBillMetadata);

// 2. Create Bill Route
router.post('/retail/create', auth, billController.createRetailBill);

// 3. Generate PDF Route (GET request to download/view)
router.get('/retail/pdf/:billId', auth, pdfController.generateRetailBillPDF);

module.exports = router;