-- 1. ROLES & PERMISSIONS
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

-- 2. USERS
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    role_id INT REFERENCES roles(role_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    mobile VARCHAR(15) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CATEGORIES
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. UNITS
CREATE TABLE units (
    unit_id SERIAL PRIMARY KEY,
    unit_name VARCHAR(20) NOT NULL UNIQUE 
);

-- 5. PAYMENT METHODS
CREATE TABLE payment_methods (
    payment_method_id SERIAL PRIMARY KEY,
    method_name VARCHAR(50) UNIQUE NOT NULL, 
    is_active BOOLEAN DEFAULT TRUE
);

-- 6. SUPPLIERS
CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(150) NOT NULL UNIQUE,
    contact_person VARCHAR(100),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(100) UNIQUE,
    gst_number VARCHAR(20) UNIQUE,
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. CUSTOMERS
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 8. PRODUCTS
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    category_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    unit_id INT REFERENCES units(unit_id) ON DELETE SET NULL,
    available_quantity NUMERIC(10,2) DEFAULT 0,
    low_stock_threshold NUMERIC(10,2) DEFAULT 10,
    sales_channel VARCHAR(20) DEFAULT 'Both' CHECK (sales_channel IN ('Retail', 'Wholesale', 'Both')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. PRICES
CREATE TABLE prices (
    price_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(product_id) ON DELETE CASCADE,
    retail_price NUMERIC(10,2), 
    wholesale_price NUMERIC(10,2),
    cost_price NUMERIC(10,2) NOT NULL,
    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT check_selling_price CHECK (retail_price IS NOT NULL OR wholesale_price IS NOT NULL)
);
CREATE UNIQUE INDEX uq_active_price_per_product ON prices (product_id) WHERE is_active = TRUE;

-- 10. PRODUCT SUPPLIERS
CREATE TABLE product_suppliers (
    product_id INT REFERENCES products(product_id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    supply_price NUMERIC(10,2),
    last_supplied_date TIMESTAMP,
    PRIMARY KEY (product_id, supplier_id)
);
-- 11. RETAIL BILLS
CREATE TABLE retail_bills (
    retail_bill_id SERIAL PRIMARY KEY,
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INT REFERENCES customers(customer_id) ON DELETE SET NULL,
    bill_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Financials
    subtotal NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid NUMERIC(10,2) DEFAULT 0,
    
    -- Status
    payment_method_id INT REFERENCES payment_methods(payment_method_id),
    payment_status VARCHAR(20) CHECK (payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    
    created_by INT REFERENCES users(user_id),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Logic Constraints
    CONSTRAINT chk_retail_payment_range CHECK (amount_paid >= 0 AND amount_paid <= total_amount),
    CONSTRAINT chk_retail_status_logic CHECK (
        (payment_status = 'paid'    AND amount_paid = total_amount) OR
        (payment_status = 'unpaid'  AND amount_paid = 0) OR
        (payment_status = 'partial' AND amount_paid > 0 AND amount_paid < total_amount)
    )
);

-- 12. RETAIL BILL ITEMS
CREATE TABLE retail_bill_items (
    item_id SERIAL PRIMARY KEY,
    retail_bill_id INT REFERENCES retail_bills(retail_bill_id) ON DELETE CASCADE,
    product_id INT REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    CONSTRAINT uq_retail_bill_product UNIQUE (retail_bill_id, product_id)
);

-- 13. WHOLESALE BILLS
CREATE TABLE wholesale_bills (
    wholesale_bill_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(customer_id),
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    bill_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Financials
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid NUMERIC(10,2) DEFAULT 0,
    
    -- Status
    payment_method_id INT REFERENCES payment_methods(payment_method_id),
    payment_status VARCHAR(20) CHECK (payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    
    created_by INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Logic Constraints
    CONSTRAINT chk_wholesale_payment_range CHECK (amount_paid >= 0 AND amount_paid <= total_amount),
    CONSTRAINT chk_wholesale_status_logic CHECK (
        (payment_status = 'paid'    AND amount_paid = total_amount) OR
        (payment_status = 'unpaid'  AND amount_paid = 0) OR
        (payment_status = 'partial' AND amount_paid > 0 AND amount_paid < total_amount)
    )
);

-- 14. WHOLESALE BILL ITEMS
CREATE TABLE wholesale_bill_items (
    item_id SERIAL PRIMARY KEY,
    wholesale_bill_id INT REFERENCES wholesale_bills(wholesale_bill_id) ON DELETE CASCADE,
    product_id INT REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    CONSTRAINT uq_wholesale_bill_product UNIQUE (wholesale_bill_id, product_id)
);
-- 15. CUSTOMER DUES (Linked to Bills)
CREATE TABLE customer_dues (
    due_id SERIAL PRIMARY KEY,
    
    -- Links (One or the other)
    wholesale_bill_id INT REFERENCES wholesale_bills(wholesale_bill_id) ON DELETE CASCADE,
    retail_bill_id INT REFERENCES retail_bills(retail_bill_id) ON DELETE CASCADE,
    bill_type VARCHAR(20) CHECK (bill_type IN ('retail', 'wholesale')) NOT NULL,

    customer_id INT REFERENCES customers(customer_id) ON DELETE RESTRICT,

    -- Balances (Updated by Trigger)
    total_bill_amount NUMERIC(12,2) NOT NULL,
    total_paid NUMERIC(12,2) DEFAULT 0,
    balance_due NUMERIC(12,2) DEFAULT 0, -- Initially equals total_bill_amount

    status VARCHAR(20) CHECK (status IN ('pending', 'partial', 'cleared')) DEFAULT 'pending',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_balances_math CHECK (balance_due = total_bill_amount - total_paid),
    CONSTRAINT chk_no_overpayment CHECK (total_paid <= total_bill_amount),
    
    -- Ensure logical integrity
    CONSTRAINT chk_bill_link CHECK (
        (wholesale_bill_id IS NOT NULL AND retail_bill_id IS NULL AND bill_type = 'wholesale') OR 
        (wholesale_bill_id IS NULL AND retail_bill_id IS NOT NULL AND bill_type = 'retail')
    ),
    CONSTRAINT uq_wholesale_due UNIQUE (wholesale_bill_id),
    CONSTRAINT uq_retail_due UNIQUE (retail_bill_id)
);

-- 16. DUE PAYMENT HISTORY (The Input Log)
CREATE TABLE due_payment_history (
    payment_id SERIAL PRIMARY KEY,
    due_id INT REFERENCES customer_dues(due_id) ON DELETE CASCADE,
    amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method_id INT REFERENCES payment_methods(payment_method_id),
    remarks TEXT
);
-- 17. EXPENSE CATEGORIES
CREATE TABLE expense_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL
);

-- 18. EXPENSES
CREATE TABLE expenses (
    expense_id SERIAL PRIMARY KEY,
    category_id INT REFERENCES expense_categories(category_id) ON DELETE SET NULL,
    expense_name VARCHAR(150) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    expense_date DATE DEFAULT CURRENT_DATE,
    paid_by INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. INVENTORY LOGS
CREATE TABLE inventory_logs (
    log_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(product_id) ON DELETE CASCADE,
    change_type VARCHAR(20) CHECK (change_type IN ('restock', 'sale', 'return', 'damage', 'adjustment')),
    quantity_change NUMERIC(10,2) NOT NULL,
    previous_quantity NUMERIC(10,2),
    new_quantity NUMERIC(10,2),
    performed_by INT REFERENCES users(user_id),
    change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 1. Create the Function
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
    -- Get Context
    SELECT total_bill_amount, retail_bill_id, wholesale_bill_id, bill_type
    INTO v_total_bill, v_retail_id, v_wholesale_id, v_bill_type
    FROM customer_dues
    WHERE due_id = NEW.due_id;

    -- Calculate Totals
    SELECT COALESCE(SUM(amount_paid), 0) INTO v_current_total_paid
    FROM due_payment_history
    WHERE due_id = NEW.due_id;

    v_new_balance := v_total_bill - v_current_total_paid;

    -- Validation
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Payment rejected: Amount % exceeds remaining balance of %', 
        NEW.amount_paid, (v_total_bill - (v_current_total_paid - NEW.amount_paid));
    END IF;

    -- Determine Status
    IF v_new_balance = 0 THEN
        v_new_status := 'paid';
    ELSIF v_new_balance = v_total_bill THEN
        v_new_status := 'unpaid';
    ELSE
        v_new_status := 'partial';
    END IF;

    -- UPDATE 1: Customer Dues
    UPDATE customer_dues
    SET 
        total_paid = v_current_total_paid,
        balance_due = v_new_balance,
        status = CASE WHEN v_new_balance = 0 THEN 'cleared' ELSE 'pending' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE due_id = NEW.due_id;

    -- UPDATE 2: Original Bill (Retail or Wholesale)
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

-- 2. Attach the Trigger
CREATE TRIGGER trg_sync_payments_to_bills
AFTER INSERT ON due_payment_history
FOR EACH ROW
EXECUTE FUNCTION update_bill_and_dues_func();
CREATE OR REPLACE FUNCTION auto_create_due_record_func()
RETURNS TRIGGER AS $$
DECLARE
    v_balance NUMERIC;
    v_due_status VARCHAR(20);
BEGIN
    -- 1. Calculate Balance
    v_balance := NEW.total_amount - NEW.amount_paid;

    -- 2. ONLY proceed if there is debt (Balance > 0) AND a valid customer
    -- (Walk-in customers with NULL ID cannot have debt)
    IF v_balance > 0 AND NEW.customer_id IS NOT NULL THEN

        -- Map Bill Status to Due Status
        IF NEW.payment_status = 'unpaid' THEN
            v_due_status := 'pending';
        ELSE
            v_due_status := 'partial';
        END IF;

        -- 3. Insert into Customer Dues
        IF TG_TABLE_NAME = 'wholesale_bills' THEN
            INSERT INTO customer_dues (
                wholesale_bill_id, retail_bill_id, bill_type, 
                customer_id, total_bill_amount, total_paid, 
                balance_due, status
            ) VALUES (
                NEW.wholesale_bill_id, NULL, 'wholesale',
                NEW.customer_id, NEW.total_amount, NEW.amount_paid,
                v_balance, v_due_status
            );
            
        ELSIF TG_TABLE_NAME = 'retail_bills' THEN
            INSERT INTO customer_dues (
                wholesale_bill_id, retail_bill_id, bill_type, 
                customer_id, total_bill_amount, total_paid, 
                balance_due, status
            ) VALUES (
                NULL, NEW.retail_bill_id, 'retail',
                NEW.customer_id, NEW.total_amount, NEW.amount_paid,
                v_balance, v_due_status
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger for Wholesale Bills
CREATE TRIGGER trg_auto_create_wholesale_due
AFTER INSERT ON wholesale_bills
FOR EACH ROW
EXECUTE FUNCTION auto_create_due_record_func();

-- Trigger for Retail Bills
CREATE TRIGGER trg_auto_create_retail_due
AFTER INSERT ON retail_bills
FOR EACH ROW
EXECUTE FUNCTION auto_create_due_record_func();