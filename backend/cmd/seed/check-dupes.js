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

  // Total products
  const {
    rows: [{ count: total }],
  } = await db.query("SELECT COUNT(*) as count FROM products");
  console.log("Total products:", total);

  // Duplicated names
  const { rows: dupes } = await db.query(`
    SELECT name, COUNT(*) as cnt
    FROM products
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `);
  console.log("\nDuplicated names (top 10):");
  dupes.forEach((d) => console.log("  " + d.cnt + "x", d.name));

  // Total unique names
  const {
    rows: [{ count: unique }],
  } = await db.query("SELECT COUNT(DISTINCT name) as count FROM products");
  console.log("\nUnique product names:", unique);
  console.log("Duplicate entries:", total - unique);

  // Check which duplicate has the image
  if (dupes.length > 0) {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.created_at,
        (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) as img_count
      FROM products p
      WHERE p.name = $1
      ORDER BY p.created_at ASC`,
      [dupes[0].name]
    );
    console.log("\nExample duplicate:", dupes[0].name);
    rows.forEach((r) =>
      console.log(
        "  id:",
        r.id,
        "| images:",
        r.img_count,
        "| created:",
        r.created_at
      )
    );
  }

  // Count products with images vs without
  const {
    rows: [{ count: withImg }],
  } = await db.query(
    "SELECT COUNT(DISTINCT product_id) as count FROM product_images"
  );
  console.log("\nProducts with images:", withImg);
  console.log("Products without images:", total - withImg);

  await db.end();
}

main().catch(console.error);
