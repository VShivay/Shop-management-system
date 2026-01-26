const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { format } = require("date-fns");

const app = express();
app.use(cors());
app.use(express.json());

/* PostgreSQL Connection */
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "shop",
  password: "panchal2004",
  port: 5432,
});

/* ---------------------------------------
   1. GET ALL PRODUCTS
   URL: http://localhost:6000/products
--------------------------------------- */
app.get("/products", async (req, res) => {
  try {
    const query = `
      SELECT 
        p.product_id,
        p.product_name,
        p.available_quantity,
        p.low_stock_threshold,
        p.sales_channel,
        p.is_active,
        c.category_name,
        u.unit_name,
        pr.retail_price,
        pr.wholesale_price,
        pr.cost_price
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN units u ON p.unit_id = u.unit_id
      LEFT JOIN prices pr 
        ON p.product_id = pr.product_id AND pr.is_active = TRUE
      ORDER BY p.product_id;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------
   2. GET PRODUCT BY ID (FULL DETAILS)
   URL: http://localhost:6000/products/:id
--------------------------------------- */
app.get("/products/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT 
        p.product_id,
        p.product_name,
        p.available_quantity,
        p.low_stock_threshold,
        p.sales_channel,
        p.is_active,
        p.created_at,
        c.category_id,
        c.category_name,
        u.unit_id,
        u.unit_name,
        pr.retail_price,
        pr.wholesale_price,
        pr.cost_price,
        pr.effective_from
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN units u ON p.unit_id = u.unit_id
      LEFT JOIN prices pr 
        ON p.product_id = pr.product_id AND pr.is_active = TRUE
      WHERE p.product_id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = result.rows[0];

    /* FORMAT DATES USING date-fns */
    product.created_at = product.created_at
      ? format(new Date(product.created_at), "dd-MM-yyyy HH:mm:ss")
      : null;

    product.effective_from = product.effective_from
      ? format(new Date(product.effective_from), "dd-MM-yyyy HH:mm:ss")
      : null;

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------
   3. GET ALL CATEGORIES (FILTER)
   URL: http://localhost:6000/categories
--------------------------------------- */
app.get("/categories", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT category_id, category_name FROM categories ORDER BY category_name"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------
   4. GET ALL UNITS (FILTER)
   URL: http://localhost:6000/units
--------------------------------------- */
app.get("/units", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT unit_id, unit_name FROM units ORDER BY unit_name"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------
   SERVER START
--------------------------------------- */
const PORT = 6000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
