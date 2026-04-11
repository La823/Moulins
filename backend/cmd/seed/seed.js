const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Load .env
const envPath = path.join(__dirname, "../../.env");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const dbURL = env.DB_URL;
if (!dbURL) {
  console.error("DB_URL is not set in .env");
  process.exit(1);
}

const excelPath = process.argv[2] || path.join(__dirname, "../../..", "1mg SHEET.xlsx");

// Column indices (0-based)
const COL = {
  PRODUCT_NAME: 2,
  BRAND_NAME: 3,
  HSN_CODE: 9,
  GST_RATE: 10,
  MRP: 11,
  SELLING_PRICE: 12,
  PRODUCT_FORM: 16,
  CONSUME_TYPE: 17,
  PACK_SIZE: 20,
  PACK_FORM: 22,
  KEY_INGREDIENT: 24,
  STRENGTH: 25,
  PRODUCT_WEIGHT: 29,
  USES: 34,
  DESCRIPTION: 43,
  KEY_BENEFITS: 45,
  DIR_FOR_USE: 46,
  SAFETY_INFO: 47,
};

function cellStr(row, col) {
  const val = row[col];
  if (val === undefined || val === null) return "";
  return String(val).trim();
}

function cellFloat(row, col) {
  const s = cellStr(row, col);
  if (!s) return 0;
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function esc(s) {
  if (!s) return "NULL";
  return "'" + s.replace(/'/g, "''") + "'";
}

function escNum(n) {
  if (!n || n === 0) return "NULL";
  return String(n);
}

// Read Excel
const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log(`Found ${data.length} rows (including headers)`);

// Generate SQL
const migrationSQL = fs.readFileSync(
  path.join(__dirname, "../../internal/database/migrations/006_add_product_detail_columns.sql"),
  "utf8"
);

let sql = "-- Auto-generated seed from 1mg SHEET.xlsx\n\n";
sql += "-- Run migration first\n";
sql += migrationSQL + "\n\n";
sql += "-- Insert products\n";

let count = 0;
// Data rows start at index 3
for (let i = 3; i < data.length; i++) {
  const row = data[i];
  const name = cellStr(row, COL.PRODUCT_NAME);
  if (!name) continue;

  let price = cellFloat(row, COL.SELLING_PRICE);
  if (price <= 0) price = cellFloat(row, COL.MRP);
  if (price <= 0) continue;

  const brandName = cellStr(row, COL.BRAND_NAME);
  const hsnCode = cellStr(row, COL.HSN_CODE);
  const gstRate = cellFloat(row, COL.GST_RATE);
  const mrp = cellFloat(row, COL.MRP);
  const productForm = cellStr(row, COL.PRODUCT_FORM);
  const consumeType = cellStr(row, COL.CONSUME_TYPE);
  const packSize = cellStr(row, COL.PACK_SIZE);
  const packForm = cellStr(row, COL.PACK_FORM);
  const keyIngredient = cellStr(row, COL.KEY_INGREDIENT);
  const strength = cellStr(row, COL.STRENGTH);
  const productWeight = cellStr(row, COL.PRODUCT_WEIGHT);
  const uses = cellStr(row, COL.USES);
  const description = cellStr(row, COL.DESCRIPTION);
  const keyBenefits = cellStr(row, COL.KEY_BENEFITS);
  const dirForUse = cellStr(row, COL.DIR_FOR_USE);
  const safetyInfo = cellStr(row, COL.SAFETY_INFO);

  const categories = uses ? `ARRAY[${esc(uses)}]` : "'{}'";

  sql += `INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES (${esc(name)}, ${esc(description)}, ${price}, ${categories}, 0,
  ${esc(brandName)}, ${esc(hsnCode)}, ${escNum(gstRate)}, ${escNum(mrp)}, ${esc(productForm)}, ${esc(consumeType)},
  ${esc(packSize)}, ${esc(packForm)}, ${esc(keyIngredient)}, ${esc(strength)}, ${esc(productWeight)},
  ${esc(keyBenefits)}, ${esc(dirForUse)}, ${esc(safetyInfo)});\n\n`;

  count++;
}

const outPath = path.join(__dirname, "../../seed.sql");
fs.writeFileSync(outPath, sql);
console.log(`Generated ${outPath} with ${count} INSERT statements.`);
console.log("You can run this in the Supabase SQL editor, or pipe it via psql.");
