const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const {
    viewExpenses,
    viewExpenseById,
    addExpense,
    getExpenseCategories,
} = require('../controller/manage_expenses');

const { generateExpensesPDF } = require('../pdf/manage_expenses_pdf');

// Roles allowed to access expense routes
const allowed = ['shop owner', 'admin', 'staff', 'cashier'];

// ─── Expense Categories (dropdown) ───────────────────────────────────────────

// All allowed roles can fetch categories (needed when filling add-expense form)
router.get('/categories', auth, auth.authorize(allowed), getExpenseCategories);

// ─── PDF Export ───────────────────────────────────────────────────────────────
// NOTE: Must be defined BEFORE /:id to avoid Express matching "pdf" as an :id param

/**
 * GET /api/expenses/pdf/export
 * Same query params as GET / (filter, month, year, category_id)
 * Streams a PDF directly to the browser / triggers download
 */
router.get('/pdf/export', auth, auth.authorize(['shop owner', 'admin']), generateExpensesPDF);

// ─── Expenses ─────────────────────────────────────────────────────────────────

/**
 * GET /api/expenses
 * Query params:
 *   filter=today|yesterday|month|year
 *   month=4          (1-12, used with filter=month)
 *   year=2025        (used with filter=month or filter=year)
 *   category_id=3    (optional category filter)
 *   page=1
 *   limit=20
 */
router.get('/', auth, auth.authorize(allowed), viewExpenses);

/**
 * GET /api/expenses/:id
 * Full details — includes restock/inventory info if linked
 */
router.get('/:id', auth, auth.authorize(allowed), viewExpenseById);

/**
 * POST /api/expenses
 * Body: { category_id, expense_name, amount, expense_date?, paid_by? }
 * Restricted to shop owner and admin only
 */
router.post('/', auth, auth.authorize(['shop owner', 'admin']), addExpense);

module.exports = router;