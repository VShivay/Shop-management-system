"""
Dummy Bill Inserter for Retail & Wholesale Bills
Date Range: 01/01/2026 to 28/04/2026
Requirements:
- Wholesale: High revenue days (30000+, at least 5/month), Normal days (10000-12000)
- Retail: High revenue days (5000+, at least 5/month), Normal days (2000-3000)
- Bill times: 8:00 AM to 6:00 PM IST
- Amounts rounded to nearest 10 (no decimals like 122.33)
- Proper inventory management with auto-restock if needed
- Proper dues management for partial/unpaid bills
"""

import psycopg2
import random
from datetime import datetime, date, timedelta
import pytz

# ─────────────────────────────────────────────
# DB CONNECTION — update credentials as needed
# ─────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "shop",   # <-- Change this
    "user": "postgres",             # <-- Change this
    "password": "panchal2004",     # <-- Change this
}

IST = pytz.timezone("Asia/Kolkata")
START_DATE = date(2026, 1, 1)
END_DATE   = date(2026, 5, 15)

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def round10(val):
    """Round to nearest 10 (no decimal)."""
    return int(round(val / 10) * 10)

def random_bill_time(bill_date: date) -> datetime:
    """Return a random IST datetime between 08:00 and 18:00 on bill_date."""
    hour   = random.randint(8, 17)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    naive  = datetime(bill_date.year, bill_date.month, bill_date.day, hour, minute, second)
    return IST.localize(naive)

def all_dates(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)

def pick_high_days(month_dates):
    """Pick at least 5 random high-revenue days from the month."""
    sample_size = min(len(month_dates), max(5, random.randint(5, 8)))
    return set(random.sample(month_dates, sample_size))

# ─────────────────────────────────────────────
# FETCH REFERENCE DATA
# ─────────────────────────────────────────────

def fetch_reference_data(conn):
    cur = conn.cursor()

    # Wholesale customers (wholesale or both)
    cur.execute("""
        SELECT customer_id FROM customers
        WHERE is_active = TRUE
          AND customer_type IN ('wholesale')
    """)
    wholesale_customers = [r[0] for r in cur.fetchall()]

    # Retail customers (retail or both) — used only for partial/unpaid retail bills
    cur.execute("""
        SELECT customer_id FROM customers
        WHERE is_active = TRUE
          AND customer_type IN ('retail', 'wholesale')
    """)
    retail_customers = [r[0] for r in cur.fetchall()]

    # Products available for wholesale (sales_channel Wholesale or Both)
    cur.execute("""
        SELECT p.product_id, pr.wholesale_price, pr.cost_price
        FROM products p
        JOIN prices pr ON pr.product_id = p.product_id AND pr.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.sales_channel IN ('Wholesale', 'Both')
          AND pr.wholesale_price IS NOT NULL
    """)
    wholesale_products = cur.fetchall()  # [(product_id, wholesale_price, cost_price), ...]

    # Products available for retail (sales_channel Retail or Both)
    cur.execute("""
        SELECT p.product_id, pr.retail_price, pr.cost_price
        FROM products p
        JOIN prices pr ON pr.product_id = p.product_id AND pr.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.sales_channel IN ('Retail', 'Both')
          AND pr.retail_price IS NOT NULL
    """)
    retail_products = cur.fetchall()  # [(product_id, retail_price, cost_price), ...]

    # Payment methods
    cur.execute("SELECT payment_method_id FROM payment_methods WHERE is_active = TRUE")
    payment_methods = [r[0] for r in cur.fetchall()]

    # Default user (created_by)
    cur.execute("SELECT user_id FROM users LIMIT 1")
    row = cur.fetchone()
    default_user = row[0] if row else None

    cur.close()

    return {
        "wholesale_customers": wholesale_customers,
        "retail_customers":    retail_customers,
        "wholesale_products":  wholesale_products,
        "retail_products":     retail_products,
        "payment_methods":     payment_methods,
        "default_user":        default_user,
    }

# ─────────────────────────────────────────────
# INVENTORY MANAGEMENT
# ─────────────────────────────────────────────

def get_available_qty(conn, product_id: int) -> float:
    cur = conn.cursor()
    cur.execute("""
        SELECT COALESCE(available_quantity_in_hand, 0)
        FROM inventory WHERE product_id = %s
    """, (product_id,))
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row else 0.0

def restock_product(conn, product_id: int, needed_qty: float, user_id, bill_time: datetime):
    """Insert a restock transaction so inventory trigger fires."""
    restock_qty = max(needed_qty + random.randint(50, 200), 100)
    restock_qty = round(restock_qty)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO inventory_transactions
            (product_id, transaction_type, quantity, performed_by, transaction_date, remarks)
        VALUES (%s, 'restock', %s, %s, %s, 'Auto-restock for dummy data generation')
        RETURNING transaction_id
    """, (product_id, restock_qty, user_id, bill_time))
    conn.commit()
    cur.close()

def deduct_inventory(conn, product_id: int, qty: float, user_id, reference_id, ref_type: str, bill_time: datetime):
    """Insert a sale transaction so inventory trigger fires."""
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO inventory_transactions
            (product_id, transaction_type, quantity, reference_id, reference_type, performed_by, transaction_date)
        VALUES (%s, 'sale', %s, %s, %s, %s, %s)
    """, (product_id, qty, reference_id, ref_type, user_id, bill_time))
    conn.commit()
    cur.close()

def ensure_stock(conn, product_id: int, needed_qty: float, user_id, bill_time: datetime):
    """Make sure there's enough stock; restock if not."""
    available = get_available_qty(conn, product_id)
    if available < needed_qty:
        restock_product(conn, product_id, needed_qty - available, user_id, bill_time)

# ─────────────────────────────────────────────
# BILL NUMBER GENERATORS
# ─────────────────────────────────────────────

_bill_counters = {"retail": 1, "wholesale": 1}

def next_bill_number(bill_type: str) -> str:
    prefix = "RB" if bill_type == "retail" else "WB"
    num = _bill_counters[bill_type]
    _bill_counters[bill_type] += 1
    return f"{prefix}{num:06d}"

# ─────────────────────────────────────────────
# SELECT PRODUCTS FOR A BILL
# ─────────────────────────────────────────────

def pick_products_for_target(products, target_revenue: int, price_index: int = 1):
    """
    Choose a basket of products whose total is approximately target_revenue.
    price_index: 1 = wholesale_price, 1 = retail_price (same index in tuple)
    Returns list of (product_id, unit_price, qty, line_total)
    """
    selected = []
    total = 0
    available = list(products)
    random.shuffle(available)

    for prod in available:
        if total >= target_revenue:
            break
        product_id  = prod[0]
        unit_price  = round10(float(prod[price_index]))
        if unit_price == 0:
            continue
        remaining = target_revenue - total
        # qty so line total is close to remaining (or a chunk of it)
        max_qty = max(1, int(remaining / unit_price))
        qty = random.randint(1, max(1, max_qty))
        line_total = round10(unit_price * qty)
        if line_total == 0:
            continue
        selected.append((product_id, unit_price, qty, line_total))
        total += line_total

    return selected, total

# ─────────────────────────────────────────────
# INSERT WHOLESALE BILL
# ─────────────────────────────────────────────

def insert_wholesale_bill(conn, ref, bill_date: date, target_revenue: int):
    bill_time  = random_bill_time(bill_date)
    user_id    = ref["default_user"]
    customer_id = random.choice(ref["wholesale_customers"])

    items, total_amount = pick_products_for_target(ref["wholesale_products"], target_revenue, price_index=1)
    if not items or total_amount == 0:
        return 0

    total_amount = round10(total_amount)

    # Payment status: 60% paid, 25% partial, 15% unpaid
    r = random.random()
    if r < 0.60:
        payment_status = "paid"
        amount_paid    = total_amount
    elif r < 0.85:
        payment_status = "partial"
        amount_paid    = round10(random.uniform(0.1, 0.9) * total_amount)
        amount_paid    = max(10, amount_paid)
        if amount_paid >= total_amount:
            amount_paid = total_amount - 10
    else:
        payment_status = "unpaid"
        amount_paid    = 0

    payment_method_id = random.choice(ref["payment_methods"])
    bill_number = next_bill_number("wholesale")

    cur = conn.cursor()
    cur.execute("""
        INSERT INTO wholesale_bills
            (customer_id, bill_number, bill_date,
             total_amount, amount_paid,
             payment_method_id, payment_status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING wholesale_bill_id
    """, (customer_id, bill_number, bill_time,
          total_amount, amount_paid,
          payment_method_id, payment_status, user_id))
    wb_id = cur.fetchone()[0]

    for (product_id, unit_price, qty, line_total) in items:
        ensure_stock(conn, product_id, qty, user_id, bill_time)
        cur.execute("""
            INSERT INTO wholesale_bill_items
                (wholesale_bill_id, product_id, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (wholesale_bill_id, product_id) DO NOTHING
        """, (wb_id, product_id, qty, unit_price, line_total))
        deduct_inventory(conn, product_id, qty, user_id, wb_id, "wholesale_bill", bill_time)

    conn.commit()
    cur.close()
    return total_amount

# ─────────────────────────────────────────────
# INSERT RETAIL BILL
# ─────────────────────────────────────────────

def insert_retail_bill(conn, ref, bill_date: date, target_revenue: int):
    bill_time  = random_bill_time(bill_date)
    user_id    = ref["default_user"]

    items, total_amount = pick_products_for_target(ref["retail_products"], target_revenue, price_index=1)
    if not items or total_amount == 0:
        return 0

    total_amount = round10(total_amount)

    # Payment: 75% paid, 15% partial, 10% unpaid
    r = random.random()
    if r < 0.75:
        payment_status = "paid"
        amount_paid    = total_amount
        customer_id    = None          # paid retail — no customer needed
    elif r < 0.90:
        payment_status = "partial"
        amount_paid    = round10(random.uniform(0.1, 0.9) * total_amount)
        amount_paid    = max(10, amount_paid)
        if amount_paid >= total_amount:
            amount_paid = total_amount - 10
        customer_id = random.choice(ref["retail_customers"]) if ref["retail_customers"] else None
    else:
        payment_status = "unpaid"
        amount_paid    = 0
        customer_id = random.choice(ref["retail_customers"]) if ref["retail_customers"] else None

    payment_method_id = random.choice(ref["payment_methods"])
    bill_number = next_bill_number("retail")

    cur = conn.cursor()
    cur.execute("""
        INSERT INTO retail_bills
            (customer_id, bill_number, bill_date,
             subtotal, tax_amount, discount_amount,
             total_amount, amount_paid,
             payment_method_id, payment_status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING retail_bill_id
    """, (customer_id, bill_number, bill_time,
          total_amount, 0, 0,
          total_amount, amount_paid,
          payment_method_id, payment_status, user_id))
    rb_id = cur.fetchone()[0]

    for (product_id, unit_price, qty, line_total) in items:
        ensure_stock(conn, product_id, qty, user_id, bill_time)
        cur.execute("""
            INSERT INTO retail_bill_items
                (retail_bill_id, product_id, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (retail_bill_id, product_id) DO NOTHING
        """, (rb_id, product_id, qty, unit_price, line_total))
        deduct_inventory(conn, product_id, qty, user_id, rb_id, "retail_bill", bill_time)

    conn.commit()
    cur.close()
    return total_amount

# ─────────────────────────────────────────────
# GENERATE BILLS FOR A SINGLE DAY
# ─────────────────────────────────────────────

def generate_day_bills(conn, ref, bill_date: date, is_high_ws: bool, is_high_rt: bool):
    # ── Wholesale target ──────────────────────
    if is_high_ws:
        ws_target = random.randint(30000, 40000)
    else:
        ws_target = random.randint(10000, 12000)

    # ── Retail target ─────────────────────────
    if is_high_rt:
        rt_target = random.randint(5000, 7000)
    else:
        rt_target = random.randint(2000, 3000)

    ws_total_day = 0
    rt_total_day = 0

    # Insert wholesale bills until we hit the day target
    attempts = 0
    while ws_total_day < ws_target and attempts < 30:
        # Each bill is a chunk; keep bills reasonably sized
        chunk = min(ws_target - ws_total_day, random.randint(5000, 15000))
        chunk = round10(chunk)
        if chunk < 100:
            break
        ws_total_day += insert_wholesale_bill(conn, ref, bill_date, chunk)
        attempts += 1

    # Insert retail bills until we hit the day target
    attempts = 0
    while rt_total_day < rt_target and attempts < 20:
        chunk = min(rt_target - rt_total_day, random.randint(500, 2000))
        chunk = round10(chunk)
        if chunk < 50:
            break
        rt_total_day += insert_retail_bill(conn, ref, bill_date, chunk)
        attempts += 1

    return ws_total_day, rt_total_day

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("Connecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)

    # Force IST session timezone
    with conn.cursor() as cur:
        cur.execute("SET timezone = 'Asia/Kolkata'")
    conn.commit()

    print("Fetching reference data...")
    ref = fetch_reference_data(conn)

    if not ref["wholesale_products"]:
        print("ERROR: No wholesale/both products found. Please seed products first.")
        conn.close()
        return
    if not ref["retail_products"]:
        print("ERROR: No retail/both products found. Please seed products first.")
        conn.close()
        return
    if not ref["wholesale_customers"]:
        print("ERROR: No wholesale customers found.")
        conn.close()
        return
    if not ref["payment_methods"]:
        print("ERROR: No active payment methods found.")
        conn.close()
        return

    print(f"  Wholesale products : {len(ref['wholesale_products'])}")
    print(f"  Retail products    : {len(ref['retail_products'])}")
    print(f"  Wholesale customers: {len(ref['wholesale_customers'])}")
    print(f"  Retail customers   : {len(ref['retail_customers'])}")
    print(f"  Payment methods    : {len(ref['payment_methods'])}")
    print(f"  Default user       : {ref['default_user']}")
    print()

    # Group dates by month to assign high-revenue days
    from collections import defaultdict
    months = defaultdict(list)
    for d in all_dates(START_DATE, END_DATE):
        months[(d.year, d.month)].append(d)

    grand_ws = 0
    grand_rt = 0

    for (yr, mo), month_dates in sorted(months.items()):
        high_ws_days = pick_high_days(month_dates)
        high_rt_days = pick_high_days(month_dates)

        print(f"Processing {yr}-{mo:02d}  ({len(month_dates)} days)  "
              f"| High WS days: {len(high_ws_days)}  | High RT days: {len(high_rt_days)}")

        month_ws = 0
        month_rt = 0
        for d in month_dates:
            ws, rt = generate_day_bills(
                conn, ref, d,
                is_high_ws=(d in high_ws_days),
                is_high_rt=(d in high_rt_days),
            )
            month_ws += ws
            month_rt += rt
            print(f"  {d}  WS={ws:>8,}  RT={rt:>6,}")

        grand_ws += month_ws
        grand_rt += month_rt
        print(f"  Month total  WS={month_ws:>10,}  RT={month_rt:>8,}\n")

    print("=" * 60)
    print(f"GRAND TOTAL  Wholesale={grand_ws:,}  Retail={grand_rt:,}")
    print("Done.")
    conn.close()


if __name__ == "__main__":
    main()