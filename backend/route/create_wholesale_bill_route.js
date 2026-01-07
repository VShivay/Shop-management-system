const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controller/create_wholesale_bill');

// Route to search customers (Debounce on frontend)
// GET /api/create-bill/search-customers?query=abc
router.get('/search-customers', auth, controller.searchCustomers);

// Route to search products (Debounce on frontend)
// GET /api/create-bill/search-products?query=xyz
router.get('/search-products', auth, controller.searchProducts);

// Route to create the bill
// POST /api/create-bill/create
router.post('/create', auth, controller.createBill);

// Route to view bill details
// GET /api/create-bill/:id
router.get('/:id', auth, controller.getBillDetails);

// Route to download PDF
// GET /api/create-bill/:id/pdf
router.get('/:id/pdf', auth, controller.generatePdf);

module.exports = router;