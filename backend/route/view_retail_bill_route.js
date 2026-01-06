const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const viewBillController = require('../controller/view_retail_bill');

// 1. Fetch Bills (with filters & pagination)
// GET /api/view-retail-bill?page=1&limit=10&filterType=week&search=John
router.get('/', auth, viewBillController.getRetailBills);

// 2. Record Payment for a due bill
// POST /api/view-retail-bill/pay
router.post('/pay', auth, viewBillController.recordPayment);

// 3. Download PDF
// GET /api/view-retail-bill/:id/pdf
router.get('/:id/pdf', auth, viewBillController.downloadBillPdf);

module.exports = router;