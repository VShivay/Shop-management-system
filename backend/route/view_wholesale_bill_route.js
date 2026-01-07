// route/view_wholesale_bill_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // User provided middleware
const controller = require('../controller/view_wholesale_bill');

// 1. Search Customers (for Debounce inputs)
router.get('/search-customers', auth, controller.searchCustomers);

// 2. Get All Bills (Pagination + Filters)
router.get('/', auth, controller.getWholesaleBills);

// 3. Get Single Bill Details
router.get('/:id', auth, controller.getBillDetails);

// 4. Download PDF
router.get('/:id/pdf', auth, controller.generateBillPDF);

// 5. Record Payment (Clearing Dues)
router.post('/record-payment', auth, controller.recordDuePayment);

module.exports = router;