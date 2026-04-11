const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envVars = {};
fs.readFileSync(path.join(__dirname, "../../.env"), "utf-8")
  .split(/\r?\n/)
  .forEach((l) => {
    const i = l.indexOf("=");
    if (i > 0) envVars[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  });

const connStr = envVars.DB_URL.replace(
  "?default_query_exec_mode=simple_protocol",
  ""
);

async function main() {
  const db = new Client({ connectionString: connStr });
  await db.connect();

  // Find all duplicate names and for each, keep the one with more images (or the newer one)
  const { rows: dupes } = await db.query(`
    SELECT name FROM products
    GROUP BY name
    HAVING COUNT(*) > 1
  `);

  console.log("Found", dupes.length, "duplicated product names\n");

  let deleted = 0;

  for (const { name } of dupes) {
    // Get all copies of this product, with image count
    const { rows: copies } = await db.query(
      `SELECT p.id, p.created_at,
        (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) as img_count
      FROM products p
      WHERE p.name = $1
      ORDER BY img_count DESC, created_at DESC`,
      [name]
    );

    // Keep the first one (most images, or newest), delete the rest
    const toDelete = copies.slice(1);

    for (const d of toDelete) {
      // Delete related images and documents first
      await db.query("DELETE FROM product_images WHERE product_id = $1", [d.id]);
      await db.query("DELETE FROM product_documents WHERE product_id = $1", [d.id]);
      await db.query("DELETE FROM products WHERE id = $1", [d.id]);
      deleted++;
    }
  }

  console.log("Deleted", deleted, "duplicate products");

  // Verify
  const {
    rows: [{ count }],
  } = await db.query("SELECT COUNT(*) as count FROM products");
  console.log("Remaining products:", count);

  await db.end();
}

main().catch(console.error);
