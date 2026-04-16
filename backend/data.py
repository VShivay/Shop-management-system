import psycopg2
import bcrypt

# --- Database Connection Details ---
DB_HOST = "localhost"
DB_NAME = "shop4"
DB_USER = "postgres"
DB_PASS = "panchal2004"
DB_PORT = "5432"

def hash_password(password):
    """Hashes a plain-text password using bcrypt."""
    salt = bcrypt.gensalt()
    # bcrypt requires bytes, so we encode to utf-8 before hashing
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    # Decode back to a string so it can be inserted into the VARCHAR column
    return hashed.decode('utf-8')

# --- User Data to Insert ---
# Format: (role_id, name, email, mobile, login_id, raw_password)
# We are using unique mock emails and mobiles to respect your UNIQUE constraints.
users_to_insert = [
    # 2 Owners (role_id: 1)
    (1, "Owner One", "owner1@shop.com", "1111111111", "owner2222", "Owner123"),
    (1, "Owner Two", "owner2@shop.com", "1111111112", "owner3333", "Owner123"),

    # 1 Admin (role_id: 2)
    (2, "Admin One", "admin1@shop.com", "2222222221", "admin2222", "Admin123"),

    # 1 Cashier (role_id: 3)
    (3, "Cashier One", "cashier1@shop.com", "3333333331", "cashier2222", "Cashier"), 

    # 3 Staff (role_id: 4)
    (4, "Staff One", "staff1@shop.com", "4444444441", "staff2222", "Staff123"),
    (4, "Staff Two", "staff2@shop.com", "4444444442", "staff3333", "Staff123"),
    (4, "Staff Three", "staff3@shop.com", "4444444443", "staff4444", "Staff123"),
]

def seed_database():
    conn = None
    cur = None
    try:
        # Establish connection
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT
        )
        cur = conn.cursor()

        # SQL Insert Query
        insert_query = """
            INSERT INTO users (role_id, name, email, mobile, login_id, password_hash)
            VALUES (%s, %s, %s, %s, %s, %s)
        """

        # Hash passwords and insert
        for user in users_to_insert:
            role_id, name, email, mobile, login_id, raw_password = user
            
            hashed_pw = hash_password(raw_password)
            
            # Execute the query
            cur.execute(insert_query, (role_id, name, email, mobile, login_id, hashed_pw))
            print(f"Successfully inserted: {name} (Login ID: {login_id})")

        # Commit the transaction
        conn.commit()
        print("\nAll users inserted successfully!")

    except Exception as e:
        print(f"\nAn error occurred: {e}")
        if conn:
            conn.rollback() # Roll back changes if an error occurs
            print("Transaction rolled back.")
            
    finally:
        # Close database connections
        if cur:
            cur.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    seed_database()