// Imports historical purchase orders from "1 Purchase Order V6 (3).xlsm" into the DB.
// Usage: node backend/cmd/seed/import-pos.js
//
// Reads from the "Moulins" sheet (the most current one) and the "List" sheet
// for the canonical manufacturer list. Creates manufacturers as needed.

const path = require("path");
const XLSX = require("xlsx");
const { Client } = require("pg");

const EXCEL = path.join(__dirname, "../../../1 Purchase Order V6 (3).xlsm");
const DB_URL = process.env.DB_URL;

if (!DB_URL) {
  console.error("DB_URL env var is required");
  process.exit(1);
}

// Status mapping from Excel labels → DB enum values
const STATUS_MAP = {
  "received": "received",
  "design ok": "design_ok",
  "mock up received": "mock_up_received",
  "rate ok": "rate_ok",
  "mail done": "mail_done",
  "hold": "hold",
  "cancelled": "cancelled",
  "canceled": "cancelled",
  "repeat": "repeat",
};

function normalizeStatus(s) {
  if (!s) return "mail_done";
  const key = String(s).trim().toLowerCase();
  return STATUS_MAP[key] || "mail_done";
}

// Excel dates can be either a string ("30/01/2025", "22-02-2025") or a serial number (45718)
function parseExcelDate(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    // Excel serial date → JS date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + val * 86400000);
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  // Try DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseNum(val) {
  if (val == null || val === "") return null;
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
}

function parseInt2(val) {
  if (val == null || val === "") return 0;
  const n = parseInt(String(val).replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function cleanStr(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

async function main() {
  const wb = XLSX.readFile(EXCEL);
  const sheet = wb.Sheets["Moulins"];
  if (!sheet) {
    console.error("Sheet 'Moulins' not found");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  // Row 0: empty/totals; Row 1: headers; Row 2+: data
  const dataRows = rows.slice(2).filter((r) => r && r[2]); // must have a P-O Number

  console.log(`Found ${dataRows.length} rows in Moulins sheet`);

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Load existing manufacturers (case-insensitive lookup)
  const mfrRes = await client.query("SELECT id, name FROM manufacturers");
  const mfrByName = new Map();
  for (const m of mfrRes.rows) mfrByName.set(m.name.trim().toUpperCase(), m.id);

  // Get an admin user_id for created_by
  const adminRes = await client.query(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  );
  if (adminRes.rowCount === 0) {
    console.error("No admin user found — create one first");
    process.exit(1);
  }
  const adminId = adminRes.rows[0].id;

  let imported = 0;
  let skipped = 0;
  let mfrCreated = 0;

  for (const row of dataRows) {
    const [srNo, poDateRaw, poNumber, productName, qty, mrp, rate, , specs, type, company, qtyReceived, remarks, category, status, , , billNumber] = row;

    const poDate = parseExcelDate(poDateRaw);
    if (!poDate) {
      console.log(`SKIP ${poNumber}: invalid date "${poDateRaw}"`);
      skipped++;
      continue;
    }
    if (!productName) {
      skipped++;
      continue;
    }

    // Resolve or create manufacturer
    let mfrId = null;
    const cleanCompany = cleanStr(company);
    if (cleanCompany) {
      const key = cleanCompany.toUpperCase();
      mfrId = mfrByName.get(key);
      if (!mfrId) {
        const ins = await client.query(
          "INSERT INTO manufacturers (name, emails) VALUES ($1, '{}') RETURNING id",
          [cleanCompany]
        );
        mfrId = ins.rows[0].id;
        mfrByName.set(key, mfrId);
        mfrCreated++;
      }
    }

    if (!mfrId) {
      // Insert a placeholder for blank manufacturers
      const key = "(UNKNOWN)";
      mfrId = mfrByName.get(key);
      if (!mfrId) {
        const ins = await client.query(
          "INSERT INTO manufacturers (name, emails) VALUES ($1, '{}') RETURNING id",
          ["(Unknown)"]
        );
        mfrId = ins.rows[0].id;
        mfrByName.set(key, mfrId);
        mfrCreated++;
      }
    }

    const quantity = parseInt2(qty);
    const mrpNum = parseNum(mrp);
    const rateNum = parseNum(rate);
    const estimate = rateNum != null ? quantity * rateNum : null;

    try {
      await client.query(
        `INSERT INTO purchase_orders (
          po_number, sr_no, po_date, product_name, quantity, mrp, rate, estimate,
          specifications, type, manufacturer_id, qty_received, remarks, category, status, bill_number, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (po_number) DO NOTHING`,
        [
          String(poNumber).trim(),
          parseInt2(srNo) || null,
          poDate,
          String(productName).trim(),
          quantity,
          mrpNum,
          rateNum,
          estimate,
          cleanStr(specs),
          cleanStr(type),
          mfrId,
          parseInt2(qtyReceived),
          cleanStr(remarks),
          cleanStr(category),
          normalizeStatus(status),
          cleanStr(billNumber),
          adminId,
        ]
      );
      imported++;
    } catch (e) {
      console.error(`FAIL ${poNumber}:`, e.message);
      skipped++;
    }
  }

  console.log(`\nDone. Imported: ${imported}, skipped: ${skipped}, manufacturers created: ${mfrCreated}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
