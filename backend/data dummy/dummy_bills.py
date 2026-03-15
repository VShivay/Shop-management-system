"""
Dummy Bills Insertion Script
Date Range: 01/01/2026 to 14/03/2026
- Retail & Wholesale bills with inventory management
- Revenue targets: Wholesale high days >=50000, normal 15000-20000
-                  Retail high days >=10000, normal 5000-7000
- Amounts are rounded to nearest 10 (no decimals)
- Proper dues management for partial/unpaid bills
"""

import psycopg2
import psycopg2.extras
import random
from datetime import date, timedelta, datetime

# ─── DB CONFIG ────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "shop2",
    "user": "postgres",
    "password": "panchal2004",
}

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def round10(val):
    """Round to nearest 10, no decimals."""
    return int(round(val / 10) * 10)

def connect():
    return psycopg2.connect(**DB_CONFIG)

def fetch_data(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Retail or Both products
    cur.execute("""
        SELECT p.product_id, p.product_name, pr.retail_price, pr.cost_price
        FROM products p
        JOIN prices pr ON pr.product_id = p.product_id AND pr.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.sales_channel IN ('Retail', 'Both')
          AND pr.retail_price IS NOT NULL
    """)
    retail_products = cur.fetchall()

    # Wholesale or Both products
    cur.execute("""
        SELECT p.product_id, p.product_name, pr.wholesale_price, pr.cost_price
        FROM products p
        JOIN prices pr ON pr.product_id = p.product_id AND pr.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.sales_channel IN ('Wholesale', 'Both')
          AND pr.wholesale_price IS NOT NULL
    """)
    wholesale_products = cur.fetchall()

    # Retail customers only (needed for partial/unpaid retail bills)
    cur.execute("""
        SELECT customer_id, customer_name FROM customers
        WHERE is_active = TRUE AND customer_type = 'retail'
    """)
    retail_customers = cur.fetchall()

    # Wholesale customers only
    cur.execute("""
        SELECT customer_id, customer_name FROM customers
        WHERE is_active = TRUE AND customer_type = 'wholesale'
    """)
    wholesale_customers = cur.fetchall()

    # Payment methods
    cur.execute("SELECT payment_method_id FROM payment_methods WHERE is_active = TRUE")
    payment_methods = [r["payment_method_id"] for r in cur.fetchall()]

    # Users
    cur.execute("SELECT user_id FROM users WHERE is_active = TRUE")
    users = [r["user_id"] for r in cur.fetchall()]

    cur.close()
    return retail_products, wholesale_products, retail_customers, wholesale_customers, payment_methods, users

def get_inventory(conn, product_id):
    cur = conn.cursor()
    cur.execute(
        "SELECT available_quantity_in_hand FROM inventory WHERE product_id = %s",
        (product_id,)
    )
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row else 0.0

def restock_product(conn, product_id, quantity, user_id, bill_date):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO inventory_transactions
            (product_id, transaction_type, quantity, reference_type, performed_by, transaction_date, remarks)
        VALUES (%s, 'restock', %s, 'auto_restock', %s, %s, 'Auto restock before sale')
    """, (product_id, quantity, user_id, bill_date))
    cur.close()

def deduct_inventory(conn, product_id, quantity, ref_id, ref_type, user_id, bill_date):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO inventory_transactions
            (product_id, transaction_type, quantity, reference_id, reference_type, performed_by, transaction_date)
        VALUES (%s, 'sale', %s, %s, %s, %s, %s)
    """, (product_id, quantity, ref_id, ref_type, user_id, bill_date))
    cur.close()

def next_bill_number(conn, prefix):
    cur = conn.cursor()
    if prefix == "RB":
        cur.execute("SELECT COUNT(*) FROM retail_bills")
    else:
        cur.execute("SELECT COUNT(*) FROM wholesale_bills")
    count = cur.fetchone()[0]
    cur.close()
    return f"{prefix}-{str(count + 1).zfill(6)}"

# ─── BILL CREATORS ────────────────────────────────────────────────────────────

def create_retail_bill(conn, products, retail_customers, payment_methods, users, bill_date):
    """
    Retail bill rules:
      - paid   (70%) => customer_id = NULL
      - partial(15%) => retail customer required
      - unpaid (15%) => retail customer required
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    user_id = random.choice(users)
    pm_id   = random.choice(payment_methods)

    n       = min(random.randint(1, 5), len(products))
    chosen  = random.sample(products, n)

    items    = []
    subtotal = 0

    for prod in chosen:
        pid   = prod["product_id"]
        price = round10(float(prod["retail_price"]))
        if price == 0:
            price = 10
        qty   = random.randint(1, 10)

        avail = get_inventory(conn, pid)
        if avail < qty:
            restock_product(conn, pid, qty + random.randint(20, 50), user_id, bill_date)

        line_total = round10(price * qty)
        items.append({"product_id": pid, "quantity": qty, "unit_price": price, "total_price": line_total})
        subtotal += line_total

    subtotal     = round10(subtotal) or 10
    total_amount = subtotal

    pay_chance = random.random()
    if pay_chance < 0.70 or not retail_customers:
        # Fully paid — no customer needed
        amount_paid    = total_amount
        payment_status = "paid"
        customer_id    = None
    elif pay_chance < 0.85:
        # Partial — retail customer required
        raw            = round10(total_amount * random.uniform(0.3, 0.8))
        amount_paid    = max(10, min(raw, total_amount - 10))
        payment_status = "partial"
        customer_id    = random.choice(retail_customers)["customer_id"]
    else:
        # Unpaid — retail customer required
        amount_paid    = 0
        payment_status = "unpaid"
        customer_id    = random.choice(retail_customers)["customer_id"]

    bill_number = next_bill_number(conn, "RB")

    cur.execute("""
        INSERT INTO retail_bills
            (bill_number, customer_id, bill_date, subtotal, tax_amount, discount_amount,
             total_amount, amount_paid, payment_method_id, payment_status, created_by)
        VALUES (%s, %s, %s, %s, 0, 0, %s, %s, %s, %s, %s)
        RETURNING retail_bill_id
    """, (bill_number, customer_id, bill_date, subtotal,
          total_amount, amount_paid, pm_id, payment_status, user_id))

    bill_id = cur.fetchone()["retail_bill_id"]

    for item in items:
        cur.execute("""
            INSERT INTO retail_bill_items
                (retail_bill_id, product_id, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
        """, (bill_id, item["product_id"], item["quantity"],
              item["unit_price"], item["total_price"]))
        deduct_inventory(conn, item["product_id"], item["quantity"],
                         bill_id, "retail_bill", user_id, bill_date)

    cur.close()
    return total_amount


def create_wholesale_bill(conn, products, wholesale_customers, payment_methods, users, bill_date):
    """
    Wholesale bill rules:
      - Always requires a wholesale customer
      - paid (50%) / partial (30%) / unpaid (20%)
    """
    cur         = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    user_id     = random.choice(users)
    pm_id       = random.choice(payment_methods)
    customer_id = random.choice(wholesale_customers)["customer_id"]

    n      = min(random.randint(2, 8), len(products))
    chosen = random.sample(products, n)

    items        = []
    total_amount = 0

    for prod in chosen:
        pid   = prod["product_id"]
        price = round10(float(prod["wholesale_price"]))
        if price == 0:
            price = 10
        qty   = random.randint(5, 50)

        avail = get_inventory(conn, pid)
        if avail < qty:
            restock_product(conn, pid, qty + random.randint(50, 200), user_id, bill_date)

        line_total = round10(price * qty)
        items.append({"product_id": pid, "quantity": qty, "unit_price": price, "total_price": line_total})
        total_amount += line_total

    total_amount = round10(total_amount) or 10

    pay_chance = random.random()
    if pay_chance < 0.50:
        amount_paid    = total_amount
        payment_status = "paid"
    elif pay_chance < 0.80:
        raw            = round10(total_amount * random.uniform(0.3, 0.7))
        amount_paid    = max(10, min(raw, total_amount - 10))
        payment_status = "partial"
    else:
        amount_paid    = 0
        payment_status = "unpaid"

    bill_number = next_bill_number(conn, "WB")

    cur.execute("""
        INSERT INTO wholesale_bills
            (customer_id, bill_number, bill_date, total_amount, amount_paid,
             payment_method_id, payment_status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING wholesale_bill_id
    """, (customer_id, bill_number, bill_date,
          total_amount, amount_paid, pm_id, payment_status, user_id))

    bill_id = cur.fetchone()["wholesale_bill_id"]

    for item in items:
        cur.execute("""
            INSERT INTO wholesale_bill_items
                (wholesale_bill_id, product_id, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
        """, (bill_id, item["product_id"], item["quantity"],
              item["unit_price"], item["total_price"]))
        deduct_inventory(conn, item["product_id"], item["quantity"],
                         bill_id, "wholesale_bill", user_id, bill_date)

    cur.close()
    return total_amount


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    conn = connect()
    conn.autocommit = False

    print("Fetching master data...")
    (retail_products, wholesale_products,
     retail_customers, wholesale_customers,
     payment_methods, users) = fetch_data(conn)

    for label, lst in [
        ("Retail products",    retail_products),
        ("Wholesale products", wholesale_products),
        ("Wholesale customers", wholesale_customers),
        ("Users",              users),
    ]:
        if not lst:
            print(f"ERROR: No {label} found. Aborting.")
            conn.close(); return

    print(f"  Retail products    : {len(retail_products)}")
    print(f"  Wholesale products : {len(wholesale_products)}")
    print(f"  Retail customers   : {len(retail_customers)}")
    print(f"  Wholesale customers: {len(wholesale_customers)}")
    print(f"  Payment methods    : {len(payment_methods)}")
    print(f"  Users              : {len(users)}")

    if not retail_customers:
        print("WARNING: No retail customers — partial/unpaid retail bills will be inserted as fully paid.")

    start_date = date(2026, 1, 1)
    end_date   = date(2026, 3, 14)

    all_dates = []
    d = start_date
    while d <= end_date:
        all_dates.append(d)
        d += timedelta(days=1)

    # Pick 5 high-revenue days per calendar month
    months = {}
    for d in all_dates:
        months.setdefault((d.year, d.month), []).append(d)

    high_days = set()
    for days in months.values():
        high_days.update(random.sample(days, min(5, len(days))))

    bill_counter = {"retail": 0, "wholesale": 0}

    for current_date in all_dates:
        is_high = current_date in high_days
        bill_ts = datetime(current_date.year, current_date.month, current_date.day, 10, 0, 0)

        # ── WHOLESALE ──────────────────────────────────────────────────────────
        ws_target  = 50000 if is_high else random.randint(15000, 20000)
        ws_revenue = 0
        ws_count   = 0
        for _ in range(50):
            if ws_revenue >= ws_target:
                break
            try:
                ws_revenue += create_wholesale_bill(
                    conn, wholesale_products, wholesale_customers,
                    payment_methods, users, bill_ts
                )
                bill_counter["wholesale"] += 1
                ws_count += 1
            except Exception as e:
                conn.rollback()
                print(f"  WS error {current_date}: {e}")
                break

        # ── RETAIL ─────────────────────────────────────────────────────────────
        rt_target  = 10000 if is_high else random.randint(5000, 7000)
        rt_revenue = 0
        rt_count   = 0
        for _ in range(50):
            if rt_revenue >= rt_target:
                break
            try:
                rt_revenue += create_retail_bill(
                    conn, retail_products, retail_customers,
                    payment_methods, users, bill_ts
                )
                bill_counter["retail"] += 1
                rt_count += 1
            except Exception as e:
                conn.rollback()
                print(f"  RT error {current_date}: {e}")
                break

        conn.commit()
        tag = "HIGH  " if is_high else "normal"
        print(
            f"  {current_date} [{tag}] | "
            f"WS: ₹{ws_revenue:>8,} ({ws_count} bills) | "
            f"RT: ₹{rt_revenue:>7,} ({rt_count} bills)"
        )

    print(f"\n✅ Done! Wholesale bills: {bill_counter['wholesale']}, Retail bills: {bill_counter['retail']}")
    conn.close()


if __name__ == "__main__":
    main()