"""
Dummy Bills Inserter for Retail & Wholesale Billing System
Date Range: 01/01/2026 to 28/03/2026
Timezone: Asia/Kolkata (IST)
"""

import psycopg2
import random
from datetime import datetime, date, timedelta
import pytz

# ─────────────────────────────────────────────
# DB CONFIG — update these
# ─────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "shop3",   # <-- change this
    "user": "postgres",                 # <-- change this
    "password": "panchal2004",         # <-- change this
}

IST = pytz.timezone("Asia/Kolkata")
START_DATE = date(2026, 1, 1)
END_DATE   = date(2026, 3, 28)

# Revenue targets (per day)
WS_HIGH_DAY   = 50000   # wholesale high-revenue day target
WS_NORMAL_MIN = 15000
WS_NORMAL_MAX = 20000
WS_HIGH_DAYS_PER_MONTH = 5

RT_HIGH_DAY   = 10000   # retail high-revenue day target
RT_NORMAL_MIN = 4000
RT_NORMAL_MAX = 6000
RT_HIGH_DAYS_PER_MONTH = 5

BILL_HOUR_START = 8
BILL_HOUR_END   = 18   # 6 PM


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def round_to_tens(value: float) -> int:
    """Round to nearest 10 so totals are never decimal."""
    return int(round(value / 10) * 10)

def rand_bill_time(day: date) -> datetime:
    """Random datetime between 8:00 and 18:00 IST for a given date."""
    hour   = random.randint(BILL_HOUR_START, BILL_HOUR_END - 1)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    naive  = datetime(day.year, day.month, day.day, hour, minute, second)
    return IST.localize(naive)

def get_all_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)

def determine_high_days(all_dates):
    """Pick 5 high-revenue days per month for each channel."""
    from collections import defaultdict
    by_month = defaultdict(list)
    for d in all_dates:
        by_month[(d.year, d.month)].append(d)

    ws_high, rt_high = set(), set()
    for dates_in_month in by_month.values():
        if len(dates_in_month) >= WS_HIGH_DAYS_PER_MONTH:
            ws_high.update(random.sample(dates_in_month, WS_HIGH_DAYS_PER_MONTH))
            rt_high.update(random.sample(dates_in_month, RT_HIGH_DAYS_PER_MONTH))
        else:
            ws_high.update(dates_in_month)
            rt_high.update(dates_in_month)
    return ws_high, rt_high


# ─────────────────────────────────────────────
# DATA FETCHERS
# ─────────────────────────────────────────────

def fetch_products(cur, channel_filter):
    """
    channel_filter: 'retail'    → sales_channel IN ('Retail','Both')
                    'wholesale' → sales_channel IN ('Wholesale','Both')
    """
    if channel_filter == "retail":
        channels = ("Retail", "Both")
    else:
        channels = ("Wholesale", "Both")

    cur.execute("""
        SELECT p.product_id, p.product_name,
               pr.retail_price, pr.wholesale_price, pr.cost_price
        FROM products p
        JOIN prices pr ON pr.product_id = p.product_id AND pr.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.sales_channel = ANY(%s)
    """, (list(channels),))
    rows = cur.fetchall()
    return [
        {
            "product_id": r[0],
            "product_name": r[1],
            "retail_price": float(r[2]) if r[2] else None,
            "wholesale_price": float(r[3]) if r[3] else None,
            "cost_price": float(r[4]),
        }
        for r in rows
    ]

def fetch_customers(cur, customer_type):
    """customer_type: 'retail' or 'wholesale'"""
    cur.execute("""
        SELECT customer_id FROM customers
        WHERE is_active = TRUE AND customer_type = %s
    """, (customer_type,))
    return [r[0] for r in cur.fetchall()]

def fetch_payment_methods(cur):
    cur.execute("SELECT payment_method_id FROM payment_methods WHERE is_active = TRUE")
    return [r[0] for r in cur.fetchall()]

def fetch_inventory(cur):
    cur.execute("SELECT product_id, available_quantity_in_hand FROM inventory")
    return {r[0]: float(r[1]) for r in cur.fetchall()}

def fetch_supplier_for_product(cur, product_id):
    cur.execute("""
        SELECT supplier_id FROM product_suppliers WHERE product_id = %s LIMIT 1
    """, (product_id,))
    row = cur.fetchone()
    return row[0] if row else None

def fetch_any_user(cur):
    cur.execute("SELECT user_id FROM users WHERE is_active = TRUE LIMIT 1")
    row = cur.fetchone()
    return row[0] if row else None

def next_bill_number(cur, prefix):
    cur.execute("""
        SELECT COUNT(*) FROM (
            SELECT bill_number FROM retail_bills WHERE bill_number LIKE %s
            UNION ALL
            SELECT bill_number FROM wholesale_bills WHERE bill_number LIKE %s
        ) t
    """, (f"{prefix}%", f"{prefix}%"))
    count = cur.fetchone()[0]
    return f"{prefix}{count + 1:06d}"


# ─────────────────────────────────────────────
# INVENTORY MANAGEMENT
# ─────────────────────────────────────────────

def ensure_stock(cur, product_id, qty_needed, inventory_cache, user_id):
    """Restock if not enough inventory. Updates cache in-place."""
    available = inventory_cache.get(product_id, 0)
    if available < qty_needed:
        restock_qty = max(qty_needed * 3, 100)  # restock generously
        supplier_id = fetch_supplier_for_product(cur, product_id)
        cur.execute("""
            INSERT INTO inventory_transactions
              (product_id, transaction_type, quantity, supplier_id,
               performed_by, transaction_date, remarks)
            VALUES (%s, 'restock', %s, %s, %s, %s, 'Auto-restock for dummy data')
        """, (product_id, restock_qty, supplier_id, user_id,
              IST.localize(datetime(2025, 12, 31, 7, 0, 0))))
        inventory_cache[product_id] = available + restock_qty

def deduct_stock(inventory_cache, product_id, qty):
    inventory_cache[product_id] = inventory_cache.get(product_id, 0) - qty

def record_sale_transaction(cur, product_id, qty, reference_id, ref_type, user_id, bill_time):
    cur.execute("""
        INSERT INTO inventory_transactions
          (product_id, transaction_type, quantity, reference_id,
           reference_type, performed_by, transaction_date)
        VALUES (%s, 'sale', %s, %s, %s, %s, %s)
    """, (product_id, qty, reference_id, ref_type, user_id, bill_time))


# ─────────────────────────────────────────────
# BILL BUILDERS
# ─────────────────────────────────────────────

def build_items_for_target(products, target_revenue, price_key, inventory_cache, cur, user_id):
    """
    Choose random products and quantities so total ≈ target_revenue.
    Returns list of dicts: {product_id, quantity, unit_price, total_price}
    Also ensures stock exists.
    """
    items   = []
    running = 0
    shuffled = products[:]
    random.shuffle(shuffled)

    for prod in shuffled:
        if running >= target_revenue:
            break
        price = prod.get(price_key)
        if not price or price <= 0:
            continue

        remaining = target_revenue - running
        max_qty = max(1, int(remaining / price))
        qty = random.randint(1, min(max_qty, 50))

        ensure_stock(cur, prod["product_id"], qty, inventory_cache, user_id)
        unit_price  = round_to_tens(price)
        total_price = unit_price * qty
        items.append({
            "product_id": prod["product_id"],
            "quantity": qty,
            "unit_price": unit_price,
            "total_price": total_price,
        })
        running += total_price

    return items

def determine_payment(total):
    """Returns (payment_status, amount_paid)"""
    r = random.random()
    if r < 0.55:
        return "paid", total
    elif r < 0.80:
        partial = round_to_tens(total * random.uniform(0.2, 0.8))
        partial = max(10, min(partial, total - 10))
        return "partial", partial
    else:
        return "unpaid", 0


# ─────────────────────────────────────────────
# INSERT WHOLESALE BILL
# ─────────────────────────────────────────────

def insert_wholesale_bill(cur, bill_time, products, customers, payment_methods,
                           inventory_cache, user_id, target):
    if not products or not customers:
        return

    items = build_items_for_target(
        products, target, "wholesale_price", inventory_cache, cur, user_id
    )
    if not items:
        return

    total = round_to_tens(sum(i["total_price"] for i in items))
    if total <= 0:
        return

    payment_status, amount_paid = determine_payment(total)
    customer_id   = random.choice(customers)
    pay_method_id = random.choice(payment_methods)
    bill_number   = next_bill_number(cur, "WB")

    cur.execute("""
        INSERT INTO wholesale_bills
          (customer_id, bill_number, bill_date, total_amount,
           amount_paid, payment_method_id, payment_status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING wholesale_bill_id
    """, (customer_id, bill_number, bill_time, total,
          amount_paid, pay_method_id, payment_status, user_id))
    bill_id = cur.fetchone()[0]

    for item in items:
        cur.execute("""
            INSERT INTO wholesale_bill_items
              (wholesale_bill_id, product_id, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
        """, (bill_id, item["product_id"], item["quantity"],
              item["unit_price"], item["total_price"]))
        record_sale_transaction(cur, item["product_id"], item["quantity"],
                                bill_id, "wholesale_bill", user_id, bill_time)
        deduct_stock(inventory_cache, item["product_id"], item["quantity"])

    return total


# ─────────────────────────────────────────────
# INSERT RETAIL BILL
# ─────────────────────────────────────────────

def insert_retail_bill(cur, bill_time, products, retail_customers, payment_methods,
                        inventory_cache, user_id, target):
    if not products:
        return

    items = build_items_for_target(
        products, target, "retail_price", inventory_cache, cur, user_id
    )
    if not items:
        return

    total = round_to_tens(sum(i["total_price"] for i in items))
    if total <= 0:
        return

    payment_status, amount_paid = determine_payment(total)

    # customer_id only needed when there's a due
    if payment_status in ("partial", "unpaid") and retail_customers:
        customer_id = random.choice(retail_customers)
    else:
        customer_id = None  # cash sale, fully paid

    pay_method_id = random.choice(payment_methods)
    bill_number   = next_bill_number(cur, "RB")

    # subtotal = total (no extra tax/discount for simplicity)
    cur.execute("""
        INSERT INTO retail_bills
          (bill_number, customer_id, bill_date, subtotal, tax_amount,
           discount_amount, total_amount, amount_paid,
           payment_method_id, payment_status, created_by)
        VALUES (%s, %s, %s, %s, 0, 0, %s, %s, %s, %s, %s)
        RETURNING retail_bill_id
    """, (bill_number, customer_id, bill_time, total, total,
          amount_paid, pay_method_id, payment_status, user_id))
    bill_id = cur.fetchone()[0]

    for item in items:
        cur.execute("""
            INSERT INTO retail_bill_items
              (retail_bill_id, product_id, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
        """, (bill_id, item["product_id"], item["quantity"],
              item["unit_price"], item["total_price"]))
        record_sale_transaction(cur, item["product_id"], item["quantity"],
                                bill_id, "retail_bill", user_id, bill_time)
        deduct_stock(inventory_cache, item["product_id"], item["quantity"])

    return total


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()

    # Enforce IST in session
    cur.execute("SET timezone = 'Asia/Kolkata'")

    print("Fetching master data...")
    ws_products      = fetch_products(cur, "wholesale")
    rt_products      = fetch_products(cur, "retail")
    ws_customers     = fetch_customers(cur, "wholesale")
    rt_customers     = fetch_customers(cur, "retail")
    payment_methods  = fetch_payment_methods(cur)
    inventory_cache  = fetch_inventory(cur)
    user_id          = fetch_any_user(cur)

    if not ws_products:
        print("ERROR: No wholesale/both products found. Please add products first.")
        cur.close(); conn.close(); return
    if not rt_products:
        print("ERROR: No retail/both products found. Please add products first.")
        cur.close(); conn.close(); return
    if not payment_methods:
        print("ERROR: No active payment methods found.")
        cur.close(); conn.close(); return
    if not user_id:
        print("ERROR: No active users found.")
        cur.close(); conn.close(); return

    print(f"  Wholesale products : {len(ws_products)}")
    print(f"  Retail products    : {len(rt_products)}")
    print(f"  WS customers       : {len(ws_customers)}")
    print(f"  RT customers       : {len(rt_customers)}")
    print(f"  Payment methods    : {len(payment_methods)}")
    print(f"  User for created_by: {user_id}")

    all_dates = list(get_all_dates(START_DATE, END_DATE))
    ws_high_days, rt_high_days = determine_high_days(all_dates)

    total_ws_revenue = 0
    total_rt_revenue = 0
    total_bills = 0

    try:
        for day in all_dates:
            # ── WHOLESALE ──────────────────────────────
            is_ws_high = day in ws_high_days
            ws_target  = WS_HIGH_DAY if is_ws_high else random.randint(WS_NORMAL_MIN, WS_NORMAL_MAX)

            ws_generated = 0
            while ws_generated < ws_target:
                remaining = ws_target - ws_generated
                # Each bill covers a chunk of the target
                bill_target = min(remaining, random.randint(5000, 15000))
                bill_target = round_to_tens(bill_target)
                bill_time   = rand_bill_time(day)
                rev = insert_wholesale_bill(
                    cur, bill_time, ws_products, ws_customers,
                    payment_methods, inventory_cache, user_id, bill_target
                )
                if rev:
                    ws_generated   += rev
                    total_ws_revenue += rev
                    total_bills     += 1
                else:
                    break  # no products could be used

            # ── RETAIL ────────────────────────────────
            is_rt_high = day in rt_high_days
            rt_target  = RT_HIGH_DAY if is_rt_high else random.randint(RT_NORMAL_MIN, RT_NORMAL_MAX)

            rt_generated = 0
            while rt_generated < rt_target:
                remaining   = rt_target - rt_generated
                bill_target = min(remaining, random.randint(500, 2000))
                bill_target = round_to_tens(bill_target)
                bill_time   = rand_bill_time(day)
                rev = insert_retail_bill(
                    cur, bill_time, rt_products, rt_customers,
                    payment_methods, inventory_cache, user_id, bill_target
                )
                if rev:
                    rt_generated   += rev
                    total_rt_revenue += rev
                    total_bills     += 1
                else:
                    break

            if day.day % 5 == 0:
                conn.commit()
                print(f"  Committed through {day} | Bills so far: {total_bills}")

        conn.commit()
        print("\n✅ All done!")
        print(f"   Total bills inserted : {total_bills}")
        print(f"   Total WS revenue     : ₹{total_ws_revenue:,.0f}")
        print(f"   Total RT revenue     : ₹{total_rt_revenue:,.0f}")
        print(f"   Grand total revenue  : ₹{total_ws_revenue + total_rt_revenue:,.0f}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error — rolled back. Details:\n{e}")
        import traceback; traceback.print_exc()

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()