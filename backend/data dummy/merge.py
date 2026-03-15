"""
Database Merge Script: shop3 (local) → shop1 (already contains render/shop data)
===================================================================================
SETUP:
  pip install psycopg2-binary

USAGE:
  1. Update SOURCE_DB and TARGET_DB connection strings below
  2. Run: python merge_shop3_into_shop1.py
  3. Review the generated .log file carefully after running

STRATEGY:
  - Reference tables   : merged by natural key (name), IDs remapped
  - Users/Suppliers    : deduplicated by email / supplier name
  - Customers          : deduplicated by phone, then email
  - Products           : deduplicated by product name
  - Bills (retail &    : SAME bill = same bill_number + same total_amount → skip
    wholesale)           DIFFERENT bill = same bill_number + different total → rename with _changed
  - Customer dues      : linked to merged bill IDs, no duplicates
  - Inventory          : metadata (threshold) only — qty NOT manually summed
  - Inv. transactions  : full history from shop3 inserted (deduplicated by
                         product + type + qty + date + reference_type)
  - Inv. qty           : recalculated from scratch from all transactions after merge
                         (single source of truth — no double-counting)
  - Triggers           : disabled during all inserts, re-enabled at end
  - Sequences          : reset after all inserts so future records don't conflict
  - All changes wrapped in one transaction — full rollback on any error
"""

import psycopg2
from psycopg2.extras import execute_values
import logging
import sys
from datetime import datetime

_log_filename = f"merge_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

# File handler: always UTF-8 so arrows/symbols save correctly to .log file
_file_handler = logging.FileHandler(_log_filename, encoding="utf-8")
_file_handler.setFormatter(_fmt)

# Console handler: UTF-8 to avoid Windows cp1252 UnicodeEncodeError
_console_handler = logging.StreamHandler(
    stream=open(sys.stdout.fileno(), mode="w", encoding="utf-8", closefd=False)
)
_console_handler.setFormatter(_fmt)

logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _console_handler])
log = logging.getLogger()

# ─── CONNECTION STRINGS ──────────────────────────────────────────────────────
SOURCE_DB = "postgresql://postgres:panchal2004@localhost:5432/shop3"
TARGET_DB = "postgresql://postgres:panchal2004@localhost:5432/shop1"
# ─────────────────────────────────────────────────────────────────────────────


def connect(dsn):
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    return conn


def disable_triggers(cur, table):
    cur.execute(f"ALTER TABLE {table} DISABLE TRIGGER ALL;")


def enable_triggers(cur, table):
    cur.execute(f"ALTER TABLE {table} ENABLE TRIGGER ALL;")


TABLES_WITH_TRIGGERS = [
    "retail_bills", "wholesale_bills",
    "due_payment_history", "customer_dues",
    "inventory_transactions", "inventory"
]


def set_sequence(cur, table, id_col):
    cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', '{id_col}'), MAX({id_col})) FROM {table};")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 – LOOKUP / REFERENCE TABLES (merge by natural key)
# Returns a dict: {source_id: target_id}
# ══════════════════════════════════════════════════════════════════════════════

def merge_lookup_table(src_cur, tgt_cur, table, id_col, name_col):
    src_cur.execute(f"SELECT {id_col}, {name_col} FROM {table};")
    rows = src_cur.fetchall()
    id_map = {}
    for src_id, name in rows:
        tgt_cur.execute(f"SELECT {id_col} FROM {table} WHERE {name_col} = %s;", (name,))
        existing = tgt_cur.fetchone()
        if existing:
            id_map[src_id] = existing[0]
            log.info(f"  [{table}] '{name}' already exists → id {existing[0]}")
        else:
            tgt_cur.execute(
                f"INSERT INTO {table} ({name_col}) VALUES (%s) RETURNING {id_col};",
                (name,)
            )
            new_id = tgt_cur.fetchone()[0]
            id_map[src_id] = new_id
            log.info(f"  [{table}] Inserted '{name}' → new id {new_id}")
    return id_map


def merge_roles(src_cur, tgt_cur):
    log.info("Merging roles...")
    return merge_lookup_table(src_cur, tgt_cur, "roles", "role_id", "role_name")


def merge_categories(src_cur, tgt_cur):
    log.info("Merging categories...")
    return merge_lookup_table(src_cur, tgt_cur, "categories", "category_id", "category_name")


def merge_units(src_cur, tgt_cur):
    log.info("Merging units...")
    return merge_lookup_table(src_cur, tgt_cur, "units", "unit_id", "unit_name")


def merge_payment_methods(src_cur, tgt_cur):
    log.info("Merging payment_methods...")
    return merge_lookup_table(src_cur, tgt_cur, "payment_methods", "payment_method_id", "method_name")


def merge_expense_categories(src_cur, tgt_cur):
    log.info("Merging expense_categories...")
    return merge_lookup_table(src_cur, tgt_cur, "expense_categories", "category_id", "category_name")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 – USERS
# ══════════════════════════════════════════════════════════════════════════════

def merge_users(src_cur, tgt_cur, role_map):
    log.info("Merging users...")
    src_cur.execute("SELECT user_id, role_id, name, email, mobile, password_hash, is_active, created_at FROM users;")
    rows = src_cur.fetchall()
    id_map = {}
    for row in rows:
        src_id, role_id, name, email, mobile, pw, is_active, created_at = row
        tgt_role = role_map.get(role_id)
        tgt_cur.execute("SELECT user_id FROM users WHERE email = %s;", (email,))
        existing = tgt_cur.fetchone()
        if existing:
            id_map[src_id] = existing[0]
            log.info(f"  [users] '{email}' exists → id {existing[0]}")
        else:
            tgt_cur.execute(
                """INSERT INTO users (role_id, name, email, mobile, password_hash, is_active, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING user_id;""",
                (tgt_role, name, email, mobile, pw, is_active, created_at)
            )
            new_id = tgt_cur.fetchone()[0]
            id_map[src_id] = new_id
            log.info(f"  [users] Inserted '{email}' → id {new_id}")
    return id_map


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 – SUPPLIERS
# ══════════════════════════════════════════════════════════════════════════════

def merge_suppliers(src_cur, tgt_cur):
    log.info("Merging suppliers...")
    src_cur.execute("SELECT supplier_id, supplier_name, contact_person, phone, email, gst_number, address, is_active, created_at FROM suppliers;")
    rows = src_cur.fetchall()
    id_map = {}
    for row in rows:
        src_id, name, contact, phone, email, gst, address, is_active, created_at = row
        tgt_cur.execute("SELECT supplier_id FROM suppliers WHERE supplier_name = %s;", (name,))
        existing = tgt_cur.fetchone()
        if existing:
            id_map[src_id] = existing[0]
        else:
            tgt_cur.execute(
                """INSERT INTO suppliers (supplier_name, contact_person, phone, email, gst_number, address, is_active, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING supplier_id;""",
                (name, contact, phone, email, gst, address, is_active, created_at)
            )
            new_id = tgt_cur.fetchone()[0]
            id_map[src_id] = new_id
            log.info(f"  [suppliers] Inserted '{name}' → id {new_id}")
    return id_map


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 – CUSTOMERS
# ══════════════════════════════════════════════════════════════════════════════

def merge_customers(src_cur, tgt_cur):
    log.info("Merging customers...")
    src_cur.execute(
        "SELECT customer_id, customer_name, customer_type, phone, email, address, credit_limit, is_active, created_at FROM customers;"
    )
    rows = src_cur.fetchall()
    id_map = {}
    for row in rows:
        src_id, name, ctype, phone, email, address, credit_limit, is_active, created_at = row
        # Match by phone (most reliable unique identifier)
        tgt_cur.execute("SELECT customer_id FROM customers WHERE phone = %s;", (phone,))
        existing = tgt_cur.fetchone()
        if not existing and email:
            tgt_cur.execute("SELECT customer_id FROM customers WHERE email = %s;", (email,))
            existing = tgt_cur.fetchone()
        if existing:
            id_map[src_id] = existing[0]
            log.info(f"  [customers] '{name}' exists → id {existing[0]}")
        else:
            tgt_cur.execute(
                """INSERT INTO customers (customer_name, customer_type, phone, email, address, credit_limit, is_active, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING customer_id;""",
                (name, ctype, phone, email, address, credit_limit, is_active, created_at)
            )
            new_id = tgt_cur.fetchone()[0]
            id_map[src_id] = new_id
            log.info(f"  [customers] Inserted '{name}' → id {new_id}")
    return id_map


# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 – PRODUCTS
# ══════════════════════════════════════════════════════════════════════════════

def merge_products(src_cur, tgt_cur, cat_map, unit_map):
    log.info("Merging products...")
    src_cur.execute(
        "SELECT product_id, product_name, category_id, unit_id, sales_channel, is_active, created_at FROM products;"
    )
    rows = src_cur.fetchall()
    id_map = {}
    for row in rows:
        src_id, name, cat_id, unit_id, channel, is_active, created_at = row
        tgt_cat = cat_map.get(cat_id)
        tgt_unit = unit_map.get(unit_id)
        tgt_cur.execute("SELECT product_id FROM products WHERE product_name = %s;", (name,))
        existing = tgt_cur.fetchone()
        if existing:
            id_map[src_id] = existing[0]
            log.info(f"  [products] '{name}' exists → id {existing[0]}")
        else:
            tgt_cur.execute(
                """INSERT INTO products (product_name, category_id, unit_id, sales_channel, is_active, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s) RETURNING product_id;""",
                (name, tgt_cat, tgt_unit, channel, is_active, created_at)
            )
            new_id = tgt_cur.fetchone()[0]
            id_map[src_id] = new_id
            log.info(f"  [products] Inserted '{name}' → id {new_id}")
    return id_map


# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 – PRICES
# ══════════════════════════════════════════════════════════════════════════════

def merge_prices(src_cur, tgt_cur, product_map):
    log.info("Merging prices...")
    src_cur.execute(
        "SELECT product_id, retail_price, wholesale_price, cost_price, effective_from, is_active FROM prices;"
    )
    for row in src_cur.fetchall():
        src_pid, rp, wp, cp, eff_from, is_active = row
        tgt_pid = product_map.get(src_pid)
        if not tgt_pid:
            continue
        # Check if active price already exists for this product in target
        tgt_cur.execute("SELECT price_id FROM prices WHERE product_id = %s AND is_active = TRUE;", (tgt_pid,))
        if tgt_cur.fetchone():
            log.info(f"  [prices] Active price for product_id {tgt_pid} already exists, skipping.")
            continue
        tgt_cur.execute(
            """INSERT INTO prices (product_id, retail_price, wholesale_price, cost_price, effective_from, is_active)
               VALUES (%s,%s,%s,%s,%s,%s);""",
            (tgt_pid, rp, wp, cp, eff_from, is_active)
        )


def merge_product_suppliers(src_cur, tgt_cur, product_map, supplier_map):
    log.info("Merging product_suppliers...")
    src_cur.execute("SELECT product_id, supplier_id, supply_price FROM product_suppliers;")
    for row in src_cur.fetchall():
        src_pid, src_sid, supply_price = row
        tgt_pid = product_map.get(src_pid)
        tgt_sid = supplier_map.get(src_sid)
        if not tgt_pid or not tgt_sid:
            continue
        tgt_cur.execute(
            """INSERT INTO product_suppliers (product_id, supplier_id, supply_price)
               VALUES (%s,%s,%s)
               ON CONFLICT (product_id, supplier_id) DO NOTHING;""",
            (tgt_pid, tgt_sid, supply_price)
        )


# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 – RETAIL BILLS + ITEMS
# ══════════════════════════════════════════════════════════════════════════════

def resolve_bill_number(tgt_cur, table, bill_num, src_total_amount):
    """
    Deduplication rules:
      1. No existing bill with this bill_number              -> insert as-is
      2. Same bill_number + same total_amount                -> SAME bill, skip
      3. Same bill_number + different total_amount           -> DIFFERENT bill, rename to bill_num + '_changed'

    For case 3 the '_changed' suffix is appended repeatedly until the name is unique.

    Returns: (final_bill_number, skip, existing_id)
      - skip=True  -> do not insert, just map src_id to existing_id
      - skip=False -> insert using final_bill_number
    """
    id_col = "retail_bill_id" if table == "retail_bills" else "wholesale_bill_id"
    tgt_cur.execute(
        f"SELECT {id_col}, total_amount FROM {table} WHERE bill_number = %s;",
        (bill_num,)
    )
    existing = tgt_cur.fetchone()

    if existing is None:
        # No conflict - insert as-is
        return bill_num, False, None

    existing_id, existing_total = existing

    # Normalize to float for safe numeric comparison
    src_total = float(src_total_amount) if src_total_amount is not None else None
    tgt_total = float(existing_total)   if existing_total   is not None else None

    if src_total == tgt_total:
        # Same bill_number + same total -> same bill, skip
        return None, True, existing_id
    else:
        # Same bill_number + different total -> different bill, rename
        new_num = bill_num + "_changed"
        while True:
            tgt_cur.execute(
                f"SELECT {id_col} FROM {table} WHERE bill_number = %s;", (new_num,)
            )
            if tgt_cur.fetchone() is None:
                break
            new_num += "_changed"
        return new_num, False, None


def insert_bill_items(src_cur, tgt_cur, src_bill_id, tgt_bill_id, product_map, items_table, bill_fk):
    src_cur.execute(
        f"SELECT product_id, quantity, unit_price, total_price FROM {items_table} WHERE {bill_fk} = %s;",
        (src_bill_id,)
    )
    for item in src_cur.fetchall():
        src_pid, qty, unit_p, total_p = item
        tgt_pid = product_map.get(src_pid)
        if not tgt_pid:
            log.warning(f"  [{items_table}] No target product for src product_id {src_pid}, skipping item.")
            continue
        tgt_cur.execute(
            f"""INSERT INTO {items_table} ({bill_fk}, product_id, quantity, unit_price, total_price)
               VALUES (%s,%s,%s,%s,%s)
               ON CONFLICT ({bill_fk}, product_id) DO NOTHING;""",
            (tgt_bill_id, tgt_pid, qty, unit_p, total_p)
        )


def merge_retail_bills(src_cur, tgt_cur, customer_map, payment_map, user_map, product_map):
    log.info("Merging retail_bills...")
    src_cur.execute(
        """SELECT retail_bill_id, bill_number, customer_id, bill_date,
                  subtotal, tax_amount, discount_amount, total_amount,
                  amount_paid, payment_method_id, payment_status, created_by, remarks, created_at
           FROM retail_bills ORDER BY bill_date;"""
    )
    bill_id_map = {}
    for row in src_cur.fetchall():
        (src_id, bill_num, cust_id, bill_date, subtotal, tax, discount,
         total, paid, pm_id, pay_status, created_by, remarks, created_at) = row

        final_bill_num, skip, existing_id = resolve_bill_number(
            tgt_cur, "retail_bills", bill_num, total
        )

        if skip:
            # Exact duplicate — map to existing record, do not insert
            bill_id_map[src_id] = existing_id
            log.info(f"  [retail_bills] DUPLICATE (same bill_number + timestamp) '{bill_num}' → mapped to existing id {existing_id}, skipped.")
            continue

        if final_bill_num != bill_num:
            log.warning(
                f"  [retail_bills] CONFLICT: bill_number '{bill_num}' exists with different timestamp. "
                f"Inserting as '{final_bill_num}'."
            )

        tgt_cust = customer_map.get(cust_id)
        tgt_pm   = payment_map.get(pm_id)
        tgt_user = user_map.get(created_by)

        tgt_cur.execute(
            """INSERT INTO retail_bills
               (bill_number, customer_id, bill_date, subtotal, tax_amount, discount_amount,
                total_amount, amount_paid, payment_method_id, payment_status, created_by, remarks, created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING retail_bill_id;""",
            (final_bill_num, tgt_cust, bill_date, subtotal, tax, discount,
             total, paid, tgt_pm, pay_status, tgt_user, remarks, created_at)
        )
        new_id = tgt_cur.fetchone()[0]
        bill_id_map[src_id] = new_id
        log.info(f"  [retail_bills] Inserted '{final_bill_num}' → id {new_id}")

        insert_bill_items(src_cur, tgt_cur, src_id, new_id, product_map,
                          "retail_bill_items", "retail_bill_id")

    return bill_id_map


# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 – WHOLESALE BILLS + ITEMS
# ══════════════════════════════════════════════════════════════════════════════

def merge_wholesale_bills(src_cur, tgt_cur, customer_map, payment_map, user_map, product_map):
    log.info("Merging wholesale_bills...")
    src_cur.execute(
        """SELECT wholesale_bill_id, customer_id, bill_number, bill_date,
                  total_amount, amount_paid, payment_method_id, payment_status, created_by, created_at
           FROM wholesale_bills ORDER BY bill_date;"""
    )
    bill_id_map = {}
    for row in src_cur.fetchall():
        (src_id, cust_id, bill_num, bill_date,
         total, paid, pm_id, pay_status, created_by, created_at) = row

        final_bill_num, skip, existing_id = resolve_bill_number(
            tgt_cur, "wholesale_bills", bill_num, total
        )

        if skip:
            bill_id_map[src_id] = existing_id
            log.info(f"  [wholesale_bills] DUPLICATE (same bill_number + timestamp) '{bill_num}' → mapped to existing id {existing_id}, skipped.")
            continue

        if final_bill_num != bill_num:
            log.warning(
                f"  [wholesale_bills] CONFLICT: bill_number '{bill_num}' exists with different timestamp. "
                f"Inserting as '{final_bill_num}'."
            )

        tgt_cust = customer_map.get(cust_id)
        tgt_pm   = payment_map.get(pm_id)
        tgt_user = user_map.get(created_by)

        tgt_cur.execute(
            """INSERT INTO wholesale_bills
               (customer_id, bill_number, bill_date, total_amount, amount_paid,
                payment_method_id, payment_status, created_by, created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING wholesale_bill_id;""",
            (tgt_cust, final_bill_num, bill_date, total, paid, tgt_pm, pay_status, tgt_user, created_at)
        )
        new_id = tgt_cur.fetchone()[0]
        bill_id_map[src_id] = new_id
        log.info(f"  [wholesale_bills] Inserted '{final_bill_num}' → id {new_id}")

        insert_bill_items(src_cur, tgt_cur, src_id, new_id, product_map,
                          "wholesale_bill_items", "wholesale_bill_id")

    return bill_id_map


# ══════════════════════════════════════════════════════════════════════════════
# STEP 9 – CUSTOMER DUES + PAYMENT HISTORY
# ══════════════════════════════════════════════════════════════════════════════

def merge_customer_dues(src_cur, tgt_cur, customer_map, retail_bill_map, wholesale_bill_map, payment_map):
    log.info("Merging customer_dues...")
    src_cur.execute(
        """SELECT due_id, wholesale_bill_id, retail_bill_id, bill_type,
                  customer_id, total_bill_amount, total_paid, balance_due, status, updated_at
           FROM customer_dues;"""
    )
    due_id_map = {}
    for row in src_cur.fetchall():
        (src_due_id, ws_id, rt_id, bill_type,
         cust_id, total_bill, total_paid, balance, status, updated_at) = row

        tgt_ws = wholesale_bill_map.get(ws_id) if ws_id else None
        tgt_rt = retail_bill_map.get(rt_id) if rt_id else None
        tgt_cust = customer_map.get(cust_id)

        # Check if due already exists for this bill
        if bill_type == 'wholesale' and tgt_ws:
            tgt_cur.execute("SELECT due_id FROM customer_dues WHERE wholesale_bill_id = %s;", (tgt_ws,))
        elif bill_type == 'retail' and tgt_rt:
            tgt_cur.execute("SELECT due_id FROM customer_dues WHERE retail_bill_id = %s;", (tgt_rt,))
        else:
            continue

        existing = tgt_cur.fetchone()
        if existing:
            due_id_map[src_due_id] = existing[0]
            continue

        tgt_cur.execute(
            """INSERT INTO customer_dues
               (wholesale_bill_id, retail_bill_id, bill_type, customer_id,
                total_bill_amount, total_paid, balance_due, status, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING due_id;""",
            (tgt_ws, tgt_rt, bill_type, tgt_cust,
             total_bill, total_paid, balance, status, updated_at)
        )
        new_due_id = tgt_cur.fetchone()[0]
        due_id_map[src_due_id] = new_due_id

    log.info("Merging due_payment_history...")
    src_cur.execute(
        "SELECT due_id, amount_paid, payment_date, payment_method_id, remarks FROM due_payment_history;"
    )
    for row in src_cur.fetchall():
        src_due_id, amount, pay_date, pm_id, remarks = row
        tgt_due_id = due_id_map.get(src_due_id)
        if not tgt_due_id:
            continue
        tgt_pm = payment_map.get(pm_id)
        # Avoid duplicate payment entries (same due + amount + date)
        tgt_cur.execute(
            "SELECT payment_id FROM due_payment_history WHERE due_id=%s AND amount_paid=%s AND payment_date=%s;",
            (tgt_due_id, amount, pay_date)
        )
        if tgt_cur.fetchone():
            continue
        tgt_cur.execute(
            """INSERT INTO due_payment_history (due_id, amount_paid, payment_date, payment_method_id, remarks)
               VALUES (%s,%s,%s,%s,%s);""",
            (tgt_due_id, amount, pay_date, tgt_pm, remarks)
        )


# ══════════════════════════════════════════════════════════════════════════════
# STEP 10 – EXPENSES
# ══════════════════════════════════════════════════════════════════════════════

def merge_expenses(src_cur, tgt_cur, expense_cat_map, user_map):
    log.info("Merging expenses...")
    src_cur.execute(
        "SELECT category_id, expense_name, amount, expense_date, paid_by, created_at FROM expenses;"
    )
    for row in src_cur.fetchall():
        cat_id, name, amount, exp_date, paid_by, created_at = row
        tgt_cat = expense_cat_map.get(cat_id)
        tgt_user = user_map.get(paid_by)
        # Deduplicate: same name + date + amount
        tgt_cur.execute(
            "SELECT expense_id FROM expenses WHERE expense_name=%s AND expense_date=%s AND amount=%s;",
            (name, exp_date, amount)
        )
        if tgt_cur.fetchone():
            continue
        tgt_cur.execute(
            """INSERT INTO expenses (category_id, expense_name, amount, expense_date, paid_by, created_at)
               VALUES (%s,%s,%s,%s,%s,%s);""",
            (tgt_cat, name, amount, exp_date, tgt_user, created_at)
        )


# ══════════════════════════════════════════════════════════════════════════════
# STEP 11 – INVENTORY (SUM quantities)
# ══════════════════════════════════════════════════════════════════════════════

def merge_inventory(src_cur, tgt_cur, product_map):
    """
    Sync low_stock_threshold and last_supplied_date from shop3 for new products.
    DO NOT touch available_quantity_in_hand here - it will be recalculated
    from inventory_transactions after all transactions are merged.
    """
    log.info("Merging inventory metadata (thresholds only - qty will be recalculated)...")
    src_cur.execute(
        """SELECT product_id, reserved_quantity, low_stock_threshold, last_supplied_date
           FROM inventory;"""
    )
    for row in src_cur.fetchall():
        src_pid, reserved, threshold, last_supplied = row
        tgt_pid = product_map.get(src_pid)
        if not tgt_pid:
            log.warning(f"  [inventory] No target product_id for source {src_pid}, skipping.")
            continue

        tgt_cur.execute("SELECT inventory_id FROM inventory WHERE product_id = %s;", (tgt_pid,))
        existing = tgt_cur.fetchone()

        if not existing:
            # New product not in target yet - insert with 0 qty, will be recalculated
            tgt_cur.execute(
                """INSERT INTO inventory
                   (product_id, available_quantity_in_hand, reserved_quantity, low_stock_threshold, last_supplied_date, last_updated)
                   VALUES (%s, 0, %s, %s, %s, CURRENT_TIMESTAMP);""",
                (tgt_pid, reserved, threshold, last_supplied)
            )
            log.info(f"  [inventory] Inserted new inventory record for product_id {tgt_pid} (qty=0, will recalculate)")


def recalculate_inventory_from_transactions(tgt_cur):
    """
    After all inventory_transactions are merged, recalculate
    available_quantity_in_hand for every product from scratch.
    This is the single source of truth - no manual summing needed.
    """
    log.info("Recalculating all inventory quantities from transaction history...")
    tgt_cur.execute("""
        UPDATE inventory inv
        SET
            available_quantity_in_hand = calc.correct_qty,
            last_updated = CURRENT_TIMESTAMP
        FROM (
            SELECT
                product_id,
                COALESCE(SUM(CASE
                    WHEN transaction_type IN ('restock', 'initial_stock', 'return') THEN quantity
                    WHEN transaction_type IN ('sale', 'damage')                     THEN -quantity
                    WHEN transaction_type = 'adjustment'                            THEN quantity
                    ELSE 0
                END), 0) AS correct_qty
            FROM inventory_transactions
            GROUP BY product_id
        ) calc
        WHERE inv.product_id = calc.product_id;
    """)
    log.info("  [inventory] Quantities recalculated from transactions.")

    # Verify - log any remaining mismatches
    tgt_cur.execute("""
        SELECT inv.product_id, inv.available_quantity_in_hand,
               COALESCE(SUM(CASE
                   WHEN it.transaction_type IN ('restock', 'initial_stock', 'return') THEN it.quantity
                   WHEN it.transaction_type IN ('sale', 'damage')                     THEN -it.quantity
                   WHEN it.transaction_type = 'adjustment'                            THEN it.quantity
                   ELSE 0
               END), 0) AS expected_qty
        FROM inventory inv
        LEFT JOIN inventory_transactions it ON it.product_id = inv.product_id
        GROUP BY inv.product_id, inv.available_quantity_in_hand
        HAVING inv.available_quantity_in_hand != COALESCE(SUM(CASE
                   WHEN it.transaction_type IN ('restock', 'initial_stock', 'return') THEN it.quantity
                   WHEN it.transaction_type IN ('sale', 'damage')                     THEN -it.quantity
                   WHEN it.transaction_type = 'adjustment'                            THEN it.quantity
                   ELSE 0
               END), 0);
    """)
    remaining = tgt_cur.fetchall()
    if remaining:
        log.warning(f"  [inventory] WARNING: {len(remaining)} product(s) still mismatched after recalculation:")
        for row in remaining:
            log.warning(f"    product_id={row[0]} actual={row[1]} expected={row[2]}")
    else:
        log.info("  [inventory] All inventory quantities consistent. Zero mismatches.")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 12 – INVENTORY TRANSACTIONS (full history)
# ══════════════════════════════════════════════════════════════════════════════

def merge_inventory_transactions(src_cur, tgt_cur, product_map, supplier_map, user_map,
                                  retail_bill_map, ws_bill_map):
    """
    Deduplication strategy for inventory transactions:

    Transactions are linked to bills via reference_id + reference_type.
    A transaction is a TRUE DUPLICATE only if it came from the EXACT SAME
    source bill that already exists in shop1.

    Cases:
      1. reference_type = 'retail_bill' or 'wholesale_bill':
            - Remap reference_id using bill_map
            - If remapped reference_id already has a transaction for this
              product + type → it is the same transaction, SKIP
            - If reference_id maps to a _changed bill → it is a NEW bill
              from shop3, INSERT with remapped reference_id

      2. reference_type = NULL / 'restock' / 'adjustment' / 'damage' etc
         (no bill link — manual entries):
            - Deduplicate by: product + type + qty + transaction_date + supplier
            - If all match exactly → SKIP (same manual entry)
            - Otherwise INSERT (different event, even if same qty)
    """
    log.info("Merging inventory_transactions (full history)...")

    # Fetch all source transactions with transaction_id for tracing
    src_cur.execute(
        """SELECT transaction_id, product_id, transaction_type, quantity,
                  reference_id, reference_type,
                  supplier_id, performed_by, transaction_date, remarks
           FROM inventory_transactions ORDER BY transaction_date;"""
    )
    inserted = 0
    skipped = 0

    for row in src_cur.fetchall():
        (src_txn_id, src_pid, txn_type, qty, ref_id, ref_type,
         sup_id, perf_by, txn_date, remarks) = row

        tgt_pid = product_map.get(src_pid)
        if not tgt_pid:
            log.warning(f"  [inv_txn] src transaction_id={src_txn_id}: no target product for src_pid={src_pid}, skipping.")
            continue

        tgt_sup  = supplier_map.get(sup_id) if sup_id else None
        tgt_user = user_map.get(perf_by)    if perf_by else None

        # ── Case 1: transaction linked to a bill ─────────────────────────
        if ref_type in ('retail_bill', 'wholesale_bill') and ref_id is not None:
            if ref_type == 'retail_bill':
                tgt_ref_id = retail_bill_map.get(ref_id)
            else:
                tgt_ref_id = ws_bill_map.get(ref_id)

            if tgt_ref_id is None:
                # Bill not merged (orphan) — insert without reference link
                log.warning(f"  [inv_txn] src txn_id={src_txn_id}: ref bill id={ref_id} ({ref_type}) not in bill_map, inserting without reference.")
                tgt_ref_id = None

            # Check: does a transaction already exist for this target bill + product?
            if tgt_ref_id is not None:
                tgt_cur.execute(
                    """SELECT transaction_id FROM inventory_transactions
                       WHERE product_id = %s
                         AND transaction_type = %s
                         AND reference_id = %s
                         AND reference_type = %s;""",
                    (tgt_pid, txn_type, tgt_ref_id, ref_type)
                )
                if tgt_cur.fetchone():
                    skipped += 1
                    continue  # exact same bill transaction already exists

            tgt_cur.execute(
                """INSERT INTO inventory_transactions
                   (product_id, transaction_type, quantity, reference_id, reference_type,
                    supplier_id, performed_by, transaction_date, remarks)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s);""",
                (tgt_pid, txn_type, qty, tgt_ref_id, ref_type,
                 tgt_sup, tgt_user, txn_date, remarks)
            )
            inserted += 1

        # ── Case 2: manual transaction (restock, adjustment, damage, initial_stock)
        else:
            # Deduplicate by product + type + qty + date + supplier
            # All five must match to be considered the same event
            tgt_cur.execute(
                """SELECT transaction_id FROM inventory_transactions
                   WHERE product_id        = %s
                     AND transaction_type  = %s
                     AND quantity          = %s
                     AND transaction_date  = %s
                     AND supplier_id IS NOT DISTINCT FROM %s
                     AND reference_type IS NULL;""",
                (tgt_pid, txn_type, qty, txn_date, tgt_sup)
            )
            if tgt_cur.fetchone():
                skipped += 1
                continue  # identical manual entry already exists

            tgt_cur.execute(
                """INSERT INTO inventory_transactions
                   (product_id, transaction_type, quantity, reference_id, reference_type,
                    supplier_id, performed_by, transaction_date, remarks)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s);""",
                (tgt_pid, txn_type, qty, ref_id, ref_type,
                 tgt_sup, tgt_user, txn_date, remarks)
            )
            inserted += 1

    log.info(f"  [inventory_transactions] Inserted {inserted} | Skipped {skipped} (duplicates).")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("=" * 60)
    log.info("Starting database merge: shop3 → shop1")
    log.info("=" * 60)

    src_conn = connect(SOURCE_DB)
    tgt_conn = connect(TARGET_DB)
    src_cur = src_conn.cursor()
    tgt_cur = tgt_conn.cursor()

    try:
        # Set timezone
        tgt_cur.execute("SET timezone = 'Asia/Kolkata';")

        # Disable triggers on target
        log.info("Disabling triggers on target tables...")
        for t in TABLES_WITH_TRIGGERS:
            disable_triggers(tgt_cur, t)

        # ── Reference/lookup tables ──────────────────────────────────────
        role_map          = merge_roles(src_cur, tgt_cur)
        cat_map           = merge_categories(src_cur, tgt_cur)
        unit_map          = merge_units(src_cur, tgt_cur)
        pm_map            = merge_payment_methods(src_cur, tgt_cur)
        exp_cat_map       = merge_expense_categories(src_cur, tgt_cur)

        # ── Entity tables ────────────────────────────────────────────────
        user_map          = merge_users(src_cur, tgt_cur, role_map)
        supplier_map      = merge_suppliers(src_cur, tgt_cur)
        customer_map      = merge_customers(src_cur, tgt_cur)
        product_map       = merge_products(src_cur, tgt_cur, cat_map, unit_map)
        merge_prices(src_cur, tgt_cur, product_map)
        merge_product_suppliers(src_cur, tgt_cur, product_map, supplier_map)

        # ── Transactional tables ─────────────────────────────────────────
        retail_bill_map   = merge_retail_bills(src_cur, tgt_cur, customer_map, pm_map, user_map, product_map)
        ws_bill_map       = merge_wholesale_bills(src_cur, tgt_cur, customer_map, pm_map, user_map, product_map)
        merge_customer_dues(src_cur, tgt_cur, customer_map, retail_bill_map, ws_bill_map, pm_map)
        merge_expenses(src_cur, tgt_cur, exp_cat_map, user_map)

        # ── Inventory (SUM quantities) ───────────────────────────────────
        merge_inventory(src_cur, tgt_cur, product_map)
        merge_inventory_transactions(src_cur, tgt_cur, product_map, supplier_map, user_map,
                                          retail_bill_map, ws_bill_map)
        recalculate_inventory_from_transactions(tgt_cur)

        # Re-enable triggers
        log.info("Re-enabling triggers...")
        for t in TABLES_WITH_TRIGGERS:
            enable_triggers(tgt_cur, t)

        # Reset all sequences so future inserts work correctly
        log.info("Resetting sequences...")
        seqs = [
            ("roles","role_id"), ("categories","category_id"), ("units","unit_id"),
            ("payment_methods","payment_method_id"), ("expense_categories","category_id"),
            ("users","user_id"), ("suppliers","supplier_id"), ("customers","customer_id"),
            ("products","product_id"), ("prices","price_id"),
            ("retail_bills","retail_bill_id"), ("retail_bill_items","item_id"),
            ("wholesale_bills","wholesale_bill_id"), ("wholesale_bill_items","item_id"),
            ("customer_dues","due_id"), ("due_payment_history","payment_id"),
            ("expenses","expense_id"), ("inventory","inventory_id"),
            ("inventory_transactions","transaction_id"),
        ]
        for tbl, col in seqs:
            try:
                set_sequence(tgt_cur, tbl, col)
            except Exception as e:
                log.warning(f"  Could not reset sequence for {tbl}.{col}: {e}")
                tgt_conn.rollback()
                # Re-disable triggers again if needed to continue after rollback
                tgt_cur.execute("SET timezone = 'Asia/Kolkata';")

        tgt_conn.commit()
        log.info("=" * 60)
        log.info("✅ Merge completed successfully! All changes committed.")
        log.info("=" * 60)

    except Exception as e:
        tgt_conn.rollback()
        log.error(f"❌ Merge FAILED: {e}")
        log.error("All changes rolled back. shop1 is unchanged.")
        raise
    finally:
        src_cur.close()
        tgt_cur.close()
        src_conn.close()
        tgt_conn.close()


if __name__ == "__main__":
    main()