-- ====================================================================================
-- DATABASE CONFIGURATION
-- ====================================================================================
ALTER DATABASE shop SET timezone TO 'Asia/Kolkata';
SET timezone = 'Asia/Kolkata';


-- ====================================================================================
-- 1. USERS & ACCESS CONTROL (Must come first for FK dependencies)
-- ====================================================================================

CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    login_id VARCHAR(50) UNIQUE NOT NULL, -- Integrated from ALTER
    role_id INT REFERENCES roles(role_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    mobile VARCHAR(15) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_types (
    product_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT, -- Optional: to explain what this type means
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO product_types (type_name, description) VALUES 
('Raw Material', 'Items purchased to be used in manufacturing'),
('Own Manufactured', 'Items produced in-house from raw materials'),
('Direct Sale', 'Ready-made items purchased from suppliers to sell directly'),
('Consumable', 'Items used by the business but not sold (e.g., packaging)');
-- ====================================================================================
-- 2. CORE MASTER DATA
-- ====================================================================================

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE, 
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE units (
    unit_id SERIAL PRIMARY KEY,
    unit_name VARCHAR(20) NOT NULL UNIQUE 
);

CREATE TABLE payment_methods (
    payment_method_id SERIAL PRIMARY KEY,
    method_name VARCHAR(50) UNIQUE NOT NULL, 
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE expense_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(150) NOT NULL UNIQUE,
    contact_person VARCHAR(100),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(100) UNIQUE,
    gst_number VARCHAR(20) UNIQUE,
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    customer_type VARCHAR(20) CHECK (customer_type IN ('retail', 'wholesale')) NOT NULL,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(100) UNIQUE,
    address TEXT,
    credit_limit NUMERIC(12, 2) DEFAULT 0,
    current_balance NUMERIC(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- ====================================================================================
-- 3. PRODUCTS & INVENTORY
-- ====================================================================================

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    
    -- Links to your taxonomy/groupings (e.g., "Beverages")
    category_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    
    -- Links to your business usage (e.g., "Own Manufactured")
    product_type_id INT REFERENCES product_types(product_type_id) ON DELETE SET NULL,
    
    unit_id INT REFERENCES units(unit_id) ON DELETE SET NULL,
    sales_channel VARCHAR(20) DEFAULT 'Both' CHECK (sales_channel IN ('Retail', 'Wholesale', 'Both')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prices (
    price_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(product_id) ON DELETE CASCADE,
    retail_price NUMERIC(10,2), 
    wholesale_price NUMERIC(10,2),
    cost_price NUMERIC(10,2) NOT NULL,
    effective_from TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT check_selling_price CHECK (retail_price IS NOT NULL OR wholesale_price IS NOT NULL)
);

CREATE UNIQUE INDEX uq_active_price_per_product ON prices (product_id) WHERE is_active = TRUE;

CREATE TABLE product_suppliers (
    product_id INT REFERENCES products(product_id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    supply_price NUMERIC(10,2),
    PRIMARY KEY (product_id, supplier_id)
);

CREATE TABLE inventory (
    inventory_id SERIAL PRIMARY KEY,
    product_id INT UNIQUE REFERENCES products(product_id) ON DELETE CASCADE,
    available_quantity_in_hand NUMERIC(10,2) DEFAULT 0,
    reserved_quantity NUMERIC(10,2) DEFAULT 0,
    low_stock_threshold NUMERIC(10,2) DEFAULT 10,
    last_supplied_date TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_transactions (
    transaction_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(product_id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) CHECK (
        transaction_type IN ('restock', 'sale', 'return', 'damage', 'initial_stock', 'adjustment')
    ),
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    reference_id INT, 
    reference_type VARCHAR(50), 
    supplier_id INT REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
    performed_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    transaction_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT
);


-- ====================================================================================
-- 4. SALES, BILLING & DUES
-- ====================================================================================

CREATE TABLE retail_bills (
    retail_bill_id SERIAL PRIMARY KEY,
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INT REFERENCES customers(customer_id) ON DELETE SET NULL,
    bill_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    subtotal NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid NUMERIC(10,2) DEFAULT 0,
    
    payment_method_id INT REFERENCES payment_methods(payment_method_id),
    payment_status VARCHAR(20) CHECK (payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    
    created_by INT REFERENCES users(user_id),
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_retail_payment_range CHECK (amount_paid >= 0 AND amount_paid <= total_amount),
    CONSTRAINT chk_retail_status_logic CHECK (
        (payment_status = 'paid'    AND amount_paid = total_amount) OR
        (payment_status = 'unpaid'  AND amount_paid = 0) OR
        (payment_status = 'partial' AND amount_paid > 0 AND amount_paid < total_amount)
    )
);

CREATE TABLE retail_bill_items (
    item_id SERIAL PRIMARY KEY,
    retail_bill_id INT REFERENCES retail_bills(retail_bill_id) ON DELETE CASCADE,
    product_id INT REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    CONSTRAINT uq_retail_bill_product UNIQUE (retail_bill_id, product_id)
);

CREATE TABLE wholesale_bills (
    wholesale_bill_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(customer_id),
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    bill_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid NUMERIC(10,2) DEFAULT 0,
    
    payment_method_id INT REFERENCES payment_methods(payment_method_id),
    payment_status VARCHAR(20) CHECK (payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    
    created_by INT REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_wholesale_payment_range CHECK (amount_paid >= 0 AND amount_paid <= total_amount),
    CONSTRAINT chk_wholesale_status_logic CHECK (
        (payment_status = 'paid'    AND amount_paid = total_amount) OR
        (payment_status = 'unpaid'  AND amount_paid = 0) OR
        (payment_status = 'partial' AND amount_paid > 0 AND amount_paid < total_amount)
    )
);

CREATE TABLE wholesale_bill_items (
    item_id SERIAL PRIMARY KEY,
    wholesale_bill_id INT REFERENCES wholesale_bills(wholesale_bill_id) ON DELETE CASCADE,
    product_id INT REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    CONSTRAINT uq_wholesale_bill_product UNIQUE (wholesale_bill_id, product_id)
);

CREATE TABLE customer_dues (
    due_id SERIAL PRIMARY KEY,
    
    wholesale_bill_id INT REFERENCES wholesale_bills(wholesale_bill_id) ON DELETE CASCADE,
    retail_bill_id INT REFERENCES retail_bills(retail_bill_id) ON DELETE CASCADE,
    bill_type VARCHAR(20) CHECK (bill_type IN ('retail', 'wholesale')) NOT NULL,
    customer_id INT REFERENCES customers(customer_id) ON DELETE RESTRICT,

    total_bill_amount NUMERIC(12,2) NOT NULL,
    total_paid NUMERIC(12,2) DEFAULT 0,
    balance_due NUMERIC(12,2) DEFAULT 0, 

    status VARCHAR(20) CHECK (status IN ('pending', 'partial', 'cleared')) DEFAULT 'pending',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_balances_math CHECK (balance_due = total_bill_amount - total_paid),
    CONSTRAINT chk_no_overpayment CHECK (total_paid <= total_bill_amount),
    
    CONSTRAINT chk_bill_link CHECK (
        (wholesale_bill_id IS NOT NULL AND retail_bill_id IS NULL AND bill_type = 'wholesale') OR 
        (wholesale_bill_id IS NULL AND retail_bill_id IS NOT NULL AND bill_type = 'retail')
    ),
    CONSTRAINT uq_wholesale_due UNIQUE (wholesale_bill_id),
    CONSTRAINT uq_retail_due UNIQUE (retail_bill_id)
);

CREATE TABLE due_payment_history (
    payment_id SERIAL PRIMARY KEY,
    due_id INT REFERENCES customer_dues(due_id) ON DELETE CASCADE,
    amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
    payment_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    payment_method_id INT REFERENCES payment_methods(payment_method_id),
    remarks TEXT
);


-- ====================================================================================
-- 5. EXPENSES 
-- ====================================================================================

CREATE TABLE expenses (
    expense_id SERIAL PRIMARY KEY,
    category_id INT REFERENCES expense_categories(category_id) ON DELETE SET NULL,
    inventory_transaction_id INT REFERENCES inventory_transactions(transaction_id) ON DELETE SET NULL, -- Integrated from ALTER
    expense_name VARCHAR(150) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    expense_date DATE DEFAULT CURRENT_DATE, 
    paid_by INT REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- ====================================================================================
-- 6. STAFF & HR MANAGEMENT
-- ====================================================================================

CREATE TABLE staff_profiles (
    staff_id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(user_id) ON DELETE CASCADE, 
    
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    department VARCHAR(50),
    designation VARCHAR(50) NOT NULL,
    salary NUMERIC(10, 2), 
    salary_cycle VARCHAR(20) DEFAULT 'Monthly' CHECK (salary_cycle IN ('Daily', 'Monthly')), -- Integrated from ALTER
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    shift_timing VARCHAR(50), 
    employment_type VARCHAR(20) DEFAULT 'Full-time', 
    
    address TEXT,
    emergency_contact_name VARCHAR(100),
    emergency_contact_mobile VARCHAR(15),
    
    employment_status VARCHAR(20) DEFAULT 'Active', 
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE staff_transactions (
    transaction_id SERIAL PRIMARY KEY,
    staff_id INT REFERENCES staff_profiles(staff_id) ON DELETE CASCADE,
    
    transaction_type VARCHAR(20) NOT NULL, 
    payment_mode VARCHAR(20) DEFAULT 'Cash', 
    
    amount NUMERIC(12, 2) NOT NULL, 
    due_amount NUMERIC(12, 2) DEFAULT 0.00, 
    
    status VARCHAR(20) DEFAULT 'Completed', 
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    reference_no VARCHAR(100), 
    notes TEXT, 
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE staff_leaves (
    leave_id SERIAL PRIMARY KEY,
    staff_id INT REFERENCES staff_profiles(staff_id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    leave_type VARCHAR(50) DEFAULT 'Full Day', 
    reason TEXT,
    status VARCHAR(20) DEFAULT 'Approved', 
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_staff_date UNIQUE (staff_id, leave_date) 
);


-- ====================================================================================
-- 7. FUNCTIONS (Kept identical to original prompt)
-- ====================================================================================

CREATE OR REPLACE FUNCTION auto_create_due_record_func()
RETURNS TRIGGER AS $$
DECLARE
    v_balance NUMERIC;
    v_due_status VARCHAR(20);
    v_new_due_id INT; 
BEGIN
    v_balance := NEW.total_amount - NEW.amount_paid;

    IF v_balance > 0 AND NEW.customer_id IS NOT NULL THEN

        IF NEW.payment_status = 'unpaid' THEN
            v_due_status := 'pending';
        ELSE
            v_due_status := 'partial';
        END IF;

        IF TG_TABLE_NAME = 'wholesale_bills' THEN
            INSERT INTO customer_dues (
                wholesale_bill_id, retail_bill_id, bill_type, 
                customer_id, total_bill_amount, total_paid, 
                balance_due, status
            ) VALUES (
                NEW.wholesale_bill_id, NULL, 'wholesale',
                NEW.customer_id, NEW.total_amount, NEW.amount_paid,
                v_balance, v_due_status
            ) RETURNING due_id INTO v_new_due_id; 
            
        ELSIF TG_TABLE_NAME = 'retail_bills' THEN
            INSERT INTO customer_dues (
                wholesale_bill_id, retail_bill_id, bill_type, 
                customer_id, total_bill_amount, total_paid, 
                balance_due, status
            ) VALUES (
                NULL, NEW.retail_bill_id, 'retail',
                NEW.customer_id, NEW.total_amount, NEW.amount_paid,
                v_balance, v_due_status
            ) RETURNING due_id INTO v_new_due_id; 
        END IF;

        IF NEW.amount_paid > 0 THEN
            INSERT INTO due_payment_history (
                due_id, amount_paid, payment_method_id, remarks
            ) VALUES (
                v_new_due_id, NEW.amount_paid, NEW.payment_method_id, 'Initial Payment at Bill Creation'
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION update_bill_and_dues_func()
RETURNS TRIGGER AS $$
DECLARE
    v_total_bill NUMERIC;
    v_current_total_paid NUMERIC;
    v_new_balance NUMERIC;
    v_retail_id INT;
    v_wholesale_id INT;
    v_bill_type VARCHAR(20);
    v_new_status VARCHAR(20);
BEGIN
    SELECT total_bill_amount, retail_bill_id, wholesale_bill_id, bill_type
    INTO v_total_bill, v_retail_id, v_wholesale_id, v_bill_type
    FROM customer_dues
    WHERE due_id = NEW.due_id;

    SELECT COALESCE(SUM(amount_paid), 0) INTO v_current_total_paid
    FROM due_payment_history
    WHERE due_id = NEW.due_id;

    v_new_balance := v_total_bill - v_current_total_paid;

    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Payment rejected: Amount % exceeds remaining balance of %', 
        NEW.amount_paid, (v_total_bill - (v_current_total_paid - NEW.amount_paid));
    END IF;

    IF v_new_balance = 0 THEN
        v_new_status := 'paid';
    ELSIF v_new_balance = v_total_bill THEN
        v_new_status := 'unpaid';
    ELSE
        v_new_status := 'partial';
    END IF;

    UPDATE customer_dues
    SET 
        total_paid = v_current_total_paid,
        balance_due = v_new_balance,
        status = CASE WHEN v_new_balance = 0 THEN 'cleared' ELSE 'pending' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE due_id = NEW.due_id;

    IF v_bill_type = 'wholesale' THEN
        UPDATE wholesale_bills
        SET amount_paid = v_current_total_paid, payment_status = v_new_status
        WHERE wholesale_bill_id = v_wholesale_id;
    ELSIF v_bill_type = 'retail' THEN
        UPDATE retail_bills
        SET amount_paid = v_current_total_paid, payment_status = v_new_status
        WHERE retail_bill_id = v_retail_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION process_inventory_transaction_func()
RETURNS TRIGGER AS $$
DECLARE
    v_multiplier INT;
    v_new_supplied_date TIMESTAMPTZ := NULL; 
BEGIN
    IF NEW.transaction_type IN ('restock', 'initial_stock', 'return') THEN
        v_multiplier := 1;
    ELSIF NEW.transaction_type IN ('sale', 'damage') THEN
        v_multiplier := -1;
    ELSE
        v_multiplier := 1; 
    END IF;

    IF NEW.transaction_type IN ('restock', 'initial_stock') THEN
        v_new_supplied_date := NEW.transaction_date;
    END IF;

    INSERT INTO inventory (
        product_id, available_quantity_in_hand, last_supplied_date, last_updated
    )
    VALUES (
        NEW.product_id, (NEW.quantity * v_multiplier), v_new_supplied_date, CURRENT_TIMESTAMP
    )
    ON CONFLICT (product_id) 
    DO UPDATE SET 
        available_quantity_in_hand = COALESCE(inventory.available_quantity_in_hand, 0) + EXCLUDED.available_quantity_in_hand,
        last_supplied_date = COALESCE(EXCLUDED.last_supplied_date, inventory.last_supplied_date),
        last_updated = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION update_customer_balance_func()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id INT;
    v_total_balance NUMERIC(12,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_customer_id := OLD.customer_id;
    ELSE
        v_customer_id := NEW.customer_id;
    END IF;

    SELECT COALESCE(SUM(balance_due), 0)
    INTO v_total_balance
    FROM customer_dues
    WHERE customer_id = v_customer_id;

    UPDATE customers
    SET 
        current_balance = v_total_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = v_customer_id;

    IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
        SELECT COALESCE(SUM(balance_due), 0)
        INTO v_total_balance
        FROM customer_dues
        WHERE customer_id = OLD.customer_id;

        UPDATE customers
        SET 
            current_balance = v_total_balance,
            updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = OLD.customer_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_auto_create_wholesale_due
AFTER INSERT ON wholesale_bills
FOR EACH ROW
EXECUTE FUNCTION auto_create_due_record_func();

CREATE TRIGGER trg_auto_create_retail_due
AFTER INSERT ON retail_bills
FOR EACH ROW
EXECUTE FUNCTION auto_create_due_record_func();

CREATE TRIGGER trg_update_customer_balance
AFTER INSERT OR UPDATE OR DELETE ON customer_dues
FOR EACH ROW
EXECUTE FUNCTION update_customer_balance_func();


CREATE TRIGGER trg_process_inventory
AFTER INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION process_inventory_transaction_func();

CREATE TRIGGER trg_sync_payments_to_bills
AFTER INSERT ON due_payment_history
FOR EACH ROW
EXECUTE FUNCTION update_bill_and_dues_func();