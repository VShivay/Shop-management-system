// route/manage_customer_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const customerController = require('../controller/manage_customer');

// Read
router.get('/', auth, customerController.getCustomers);
router.get('/:id', auth, customerController.getCustomerById);

// Create
router.post('/add', auth, customerController.createCustomer);

// Update
router.put('/update/:id', auth, customerController.updateCustomer);

// Delete
// Soft Delete (Preferred) - Uses PUT because it updates a status flag
router.put('/soft-delete/:id', auth, customerController.softDeleteCustomer);

// Hard Delete (Restricted) - Uses DELETE method
router.delete('/hard-delete/:id', auth, customerController.hardDeleteCustomer);

module.exports = router;