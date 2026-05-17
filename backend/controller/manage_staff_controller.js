// Adjust the path '../db' or '../config/db' depending on exactly where your db.js file lives
const db = require('../db');
const pool = db.pool; // Extract the actual pg Pool instance so pool.connect() works
const bcrypt = require('bcrypt'); // Required for password hashing in addStaff

const staffController = {
    // 1. View all staff profiles alongside their base user details
    getAllStaff: async (req, res) => {
        try {
            const query = `
                SELECT 
                    sp.staff_id, sp.employee_code, sp.department, sp.designation, 
                    sp.salary, sp.salary_cycle, sp.hire_date, sp.shift_timing, 
                    sp.employment_type, sp.employment_status,
                    u.user_id, u.name, u.email, u.mobile, u.login_id
                FROM staff_profiles sp
                JOIN users u ON sp.user_id = u.user_id
                ORDER BY sp.staff_id DESC
            `;
            const { rows } = await pool.query(query);
            res.status(200).json(rows);
        } catch (error) {
            console.error('Error in getAllStaff:', error);
            res.status(500).json({ error: 'Failed to retrieve staff profiles.' });
        }
    },

    // 2. Add a new transaction (Salary, Bonus, Advance, Deduction)
    addTransaction: async (req, res) => {
        try {
            const { id } = req.params; // staff_id
            const { 
                transaction_type, 
                payment_mode, 
                amount, 
                due_amount = 0.00, 
                status = 'Completed', 
                transaction_date, 
                reference_no, 
                notes 
            } = req.body;

            // Basic validation
            if (!transaction_type || !amount) {
                return res.status(400).json({ error: 'Transaction type and amount are required.' });
            }

            // Check if staff exists
            const staffCheck = await pool.query('SELECT staff_id FROM staff_profiles WHERE staff_id = $1', [id]);
            if (staffCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found.' });
            }

            const query = `
                INSERT INTO staff_transactions (
                    staff_id, transaction_type, payment_mode, amount, 
                    due_amount, status, transaction_date, reference_no, notes
                ) 
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9) 
                RETURNING *
            `;

            const values = [
                id, 
                transaction_type, 
                payment_mode || 'Cash', 
                amount, 
                due_amount, 
                status, 
                transaction_date, 
                reference_no, 
                notes
            ];

            const { rows } = await pool.query(query, values);
            res.status(201).json({ 
                message: 'Transaction added successfully', 
                transaction: rows[0] 
            });

        } catch (error) {
            console.error('Error in addTransaction:', error);
            res.status(500).json({ error: 'Failed to add transaction.' });
        }
    },

    // 3. View transactions for a specific staff member
    getStaffTransactions: async (req, res) => {
        try {
            const { id } = req.params; // staff_id

            const query = `
                SELECT * FROM staff_transactions 
                WHERE staff_id = $1 
                ORDER BY transaction_date DESC, created_at DESC
            `;
            
            const { rows } = await pool.query(query, [id]);
            
            res.status(200).json(rows);
        } catch (error) {
            console.error('Error in getStaffTransactions:', error);
            res.status(500).json({ error: 'Failed to retrieve staff transactions.' });
        }
    },

    // 1. Add New Staff (Creates User & Profile)
    addStaff: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const { 
                role_id, name, email, mobile, login_id, password, // User details
                employee_code, department, designation, salary, salary_cycle, shift_timing // Profile details
            } = req.body;

            // Step 1: Hash Password & Create User
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const userQuery = `
                INSERT INTO users (role_id, name, email, mobile, login_id, password_hash) 
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id
            `;
            const userValues = [role_id, name, email, mobile, login_id, password_hash];
            const userResult = await client.query(userQuery, userValues);
            const userId = userResult.rows[0].user_id;

            // Step 2: Create Staff Profile
            const profileQuery = `
                INSERT INTO staff_profiles (user_id, employee_code, department, designation, salary, salary_cycle, shift_timing) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
            `;
            const profileValues = [userId, employee_code, department, designation, salary, salary_cycle || 'Monthly', shift_timing];
            const profileResult = await client.query(profileQuery, profileValues);

            await client.query('COMMIT');
            res.status(201).json({ message: 'Staff created successfully', staff: profileResult.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in addStaff:', error);
            res.status(500).json({ error: 'Failed to add staff.' });
        } finally {
            client.release();
        }
    },

    // 2. Update Existing Staff
    updateStaff: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params; // staff_id
            
            const { 
                name, mobile, // User details (updatable)
                department, designation, salary, salary_cycle, shift_timing // Profile details
            } = req.body;

            // Get user_id associated with this staff_id
            const checkQuery = await client.query('SELECT user_id FROM staff_profiles WHERE staff_id = $1', [id]);
            if (checkQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Staff not found.' });
            }
            const userId = checkQuery.rows[0].user_id;

            // Step 1: Update Users Table
            const userQuery = `UPDATE users SET name = $1, mobile = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $3`;
            await client.query(userQuery, [name, mobile, userId]);

            // Step 2: Update Staff Profiles Table
            const profileQuery = `
                UPDATE staff_profiles 
                SET department = $1, designation = $2, salary = $3, salary_cycle = $4, shift_timing = $5, updated_at = CURRENT_TIMESTAMP 
                WHERE staff_id = $6 RETURNING *
            `;
            const profileResult = await client.query(profileQuery, [department, designation, salary, salary_cycle, shift_timing, id]);

            await client.query('COMMIT');
            res.status(200).json({ message: 'Staff updated successfully', staff: profileResult.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in updateStaff:', error);
            res.status(500).json({ error: 'Failed to update staff.' });
        } finally {
            client.release();
        }
    },

    // 3. Soft Delete Staff (Sets status to Terminated and disables login)
    softDeleteStaff: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params; // staff_id

            // Mark profile as Terminated
            const profileQuery = await client.query(
                `UPDATE staff_profiles SET employment_status = 'Terminated', updated_at = CURRENT_TIMESTAMP WHERE staff_id = $1 RETURNING user_id`, 
                [id]
            );

            if (profileQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Staff not found.' });
            }
            const userId = profileQuery.rows[0].user_id;

            // Disable user login so they can no longer access the system
            await client.query(`UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [userId]);

            await client.query('COMMIT');
            res.status(200).json({ message: 'Staff member successfully terminated and access revoked.' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in softDeleteStaff:', error);
            res.status(500).json({ error: 'Failed to terminate staff.' });
        } finally {
            client.release();
        }
    },

    // 4. Hard Delete Staff (Completely removes from DB)
    hardDeleteStaff: async (req, res) => {
        try {
            const { id } = req.params; // staff_id

            // Fetch the user_id first
            const checkQuery = await pool.query('SELECT user_id FROM staff_profiles WHERE staff_id = $1', [id]);
            if (checkQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Staff not found.' });
            }
            const userId = checkQuery.rows[0].user_id;

            // Because you set up ON DELETE CASCADE on the staff_profiles table, 
            // deleting the user will automatically delete the profile and their transactions!
            await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);

            res.status(200).json({ message: 'Staff member permanently deleted from database.' });
        } catch (error) {
            console.error('Error in hardDeleteStaff:', error);
            res.status(500).json({ error: 'Failed to delete staff.' });
        }
    },
    markLeave: async (req, res) => {
        try {
            const { id } = req.params; // staff_id
            const { leave_date, leave_type = 'Full Day', reason, status = 'Approved' } = req.body;

            if (!leave_date) {
                return res.status(400).json({ error: 'Leave date is required.' });
            }

            const query = `
                INSERT INTO staff_leaves (staff_id, leave_date, leave_type, reason, status) 
                VALUES ($1, $2, $3, $4, $5) RETURNING *
            `;
            const values = [id, leave_date, leave_type, reason, status];

            const { rows } = await pool.query(query, values);
            res.status(201).json({ message: 'Leave marked successfully', leave: rows[0] });

        } catch (error) {
            // Postgres Error Code 23505 means Unique Violation (tried to insert duplicate date)
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Leave is already marked for this staff member on this date.' });
            }
            console.error('Error in markLeave:', error);
            res.status(500).json({ error: 'Failed to mark leave.' });
        }
    },

    // 6. Get Leaves for a Specific Staff Member
    getStaffLeaves: async (req, res) => {
        try {
            const { id } = req.params; // staff_id

            const query = `
                SELECT * FROM staff_leaves 
                WHERE staff_id = $1 
                ORDER BY leave_date DESC
            `;
            const { rows } = await pool.query(query, [id]);
            res.status(200).json(rows);

        } catch (error) {
            console.error('Error in getStaffLeaves:', error);
            res.status(500).json({ error: 'Failed to retrieve staff leaves.' });
        }
    },

    // 7. Get All Leaves (For Shop Owner Dashboard/Reports)
    getAllLeaves: async (req, res) => {
        try {
            const query = `
                SELECT sl.*, sp.employee_code, u.name as staff_name 
                FROM staff_leaves sl
                JOIN staff_profiles sp ON sl.staff_id = sp.staff_id
                JOIN users u ON sp.user_id = u.user_id
                ORDER BY sl.leave_date DESC
            `;
            const { rows } = await pool.query(query);
            res.status(200).json(rows);

        } catch (error) {
            console.error('Error in getAllLeaves:', error);
            res.status(500).json({ error: 'Failed to retrieve all leaves.' });
        }
    },

    // 8. Update Leave Status (e.g., Pending -> Approved -> Rejected)
    updateLeaveStatus: async (req, res) => {
        try {
            const { leave_id } = req.params;
            const { status } = req.body; // 'Pending', 'Approved', 'Rejected'

            if (!status) {
                return res.status(400).json({ error: 'Status is required.' });
            }

            const query = `
                UPDATE staff_leaves 
                SET status = $1 
                WHERE leave_id = $2 RETURNING *
            `;
            const { rows } = await pool.query(query, [status, leave_id]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Leave record not found.' });
            }

            res.status(200).json({ message: 'Leave status updated', leave: rows[0] });

        } catch (error) {
            console.error('Error in updateLeaveStatus:', error);
            res.status(500).json({ error: 'Failed to update leave status.' });
        }
    },
    // 9. Modify Leave Entry (Date, Type, Reason)
    updateLeave: async (req, res) => {
        try {
            const { leave_id } = req.params;
            const { leave_date, leave_type, reason } = req.body;

            if (!leave_date) {
                return res.status(400).json({ error: 'Leave date is required.' });
            }

            const query = `
                UPDATE staff_leaves 
                SET leave_date = $1, leave_type = $2, reason = $3 
                WHERE leave_id = $4 RETURNING *
            `;
            const { rows } = await pool.query(query, [leave_date, leave_type, reason, leave_id]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Leave record not found.' });
            }

            res.status(200).json({ message: 'Leave updated successfully', leave: rows[0] });

        } catch (error) {
            // Catch unique constraint violation if they change the date to one that already has a leave
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A leave entry already exists for this date.' });
            }
            console.error('Error in updateLeave:', error);
            res.status(500).json({ error: 'Failed to update leave.' });
        }
    },

    // 10. Delete Leave Entry
    deleteLeave: async (req, res) => {
        try {
            const { leave_id } = req.params;

            const query = `DELETE FROM staff_leaves WHERE leave_id = $1 RETURNING *`;
            const { rows } = await pool.query(query, [leave_id]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Leave record not found.' });
            }

            res.status(200).json({ message: 'Leave deleted successfully.' });

        } catch (error) {
            console.error('Error in deleteLeave:', error);
            res.status(500).json({ error: 'Failed to delete leave.' });
        }
    }
};

module.exports = staffController;