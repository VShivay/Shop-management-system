// route/view_wholesale_bill_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // User provided middleware
const controller = require('../controller/view_wholesale_bill');
const allowed = ['shop owner', 'admin'];


// 1. Search Customers (for Debounce inputs)
router.get('/search-customers', auth,auth.authorize(allowed), controller.searchCustomers);

// 2. Get All Bills (Pagination + Filters)
router.get('/', auth,auth.authorize(allowed), controller.getWholesaleBills);

// 3. Get Single Bill Details
router.get('/:id', auth,auth.authorize(allowed), controller.getBillDetails);

// 4. Download PDF
router.get('/:id/pdf', auth,auth.authorize(allowed), controller.generateBillPDF);

// 5. Record Payment (Clearing Dues)
router.post('/record-payment', auth,auth.authorize(allowed), controller.recordDuePayment);

module.exports = router;