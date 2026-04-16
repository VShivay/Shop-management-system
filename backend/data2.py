import psycopg2
from datetime import date

# --- Database Connection Details ---
DB_HOST = "localhost"
DB_NAME = "shop4"
DB_USER = "postgres"
DB_PASS = "panchal2004"
DB_PORT = "5432"

def populate_staff_profiles():
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT
        )
        cur = conn.cursor()

        # 1. Fetch user_id and role_id for all Admins (2) and Staff (4)
        cur.execute("SELECT user_id, role_id, name FROM users WHERE role_id IN (2, 4);")
        eligible_users = cur.fetchall()

        if not eligible_users:
            print("No Admin or Staff users found in the users table.")
            return

        insert_query = """
            INSERT INTO staff_profiles (
                user_id, employee_code, department, designation, 
                salary, hire_date, employment_type, address
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id) DO NOTHING;
        """

        for user in eligible_users:
            u_id, r_id, u_name = user
            
            # Logic to differentiate data based on role
            if r_id == 2:  # Admin
                emp_code = f"ADM-{u_id:03d}"
                dept = "Management"
                desig = "Store Manager"
                sal = 45000.00
            else:  # Staff
                emp_code = f"STF-{u_id:03d}"
                dept = "Operations"
                desig = "Floor Assistant"
                sal = 15000.00

            # Execute Insert
            cur.execute(insert_query, (
                u_id, 
                emp_code, 
                dept, 
                desig, 
                sal, 
                date.today(), 
                'Full-time', 
                'Main Street Branch'
            ))
            print(f"Profile created for {u_name} (Code: {emp_code})")

        conn.commit()
        print("\nStaff profiles populated successfully!")

    except Exception as e:
        print(f"Error: {e}")
        if conn: conn.rollback()
    finally:
        if cur: cur.close()
        if conn: conn.close()

if __name__ == "__main__":
    populate_staff_profiles()