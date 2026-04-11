const XLSX = require("xlsx");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

// Load .env
const envPath = path.join(__dirname, "../../.env");
const envVars = {};
fs.readFileSync(envPath, "utf-8")
  .split(/\r?\n/)
  .forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0) envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });

const s3 = new S3Client({
  region: envVars.AWS_REGION,
  credentials: {
    accessKeyId: envVars.AWS_ACCESS_KEY_ID,
    secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = envVars.S3_BUCKET;

function extractFileId(url) {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function downloadFromDrive(fileId) {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "image/jpeg";
  return { buf, contentType: ct };
}

async function uploadToS3(buf, contentType, productName) {
  const ext = contentType.includes("png") ? "png" : "jpg";
  const safeName = productName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
  const key = `products/${randomUUID()}-${safeName}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buf,
      ContentType: contentType,
    })
  );
  return key;
}

async function main() {
  // Read Excel
  const xlsxPath = path.join(__dirname, "../../../1mg SHEET.xlsx");
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Collect products with Drive links
  const items = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;
    const name = String(row[2]).trim();
    const link = row[39];
    if (link && typeof link === "string" && link.includes("drive.google.com")) {
      const fileId = extractFileId(link);
      if (fileId) items.push({ name, fileId });
    }
  }
  console.log(`Found ${items.length} products with Drive image links\n`);

  // Connect to DB
  const connStr = envVars.DB_URL.replace("?default_query_exec_mode=simple_protocol", "");
  const db = new Client({ connectionString: connStr });
  await db.connect();

  // Get product name -> id mapping
  const { rows: products } = await db.query("SELECT id, name FROM products");
  const nameToId = {};
  for (const p of products) {
    nameToId[p.name.trim()] = p.id;
  }

  // Check which products already have images
  const { rows: existingImages } = await db.query(
    "SELECT DISTINCT product_id FROM product_images"
  );
  const hasImage = new Set(existingImages.map((r) => r.product_id));

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let notFound = 0;

  for (let i = 0; i < items.length; i++) {
    const { name, fileId } = items[i];
    const productId = nameToId[name];

    if (!productId) {
      notFound++;
      continue;
    }

    if (hasImage.has(productId)) {
      skipped++;
      continue;
    }

    try {
      const { buf, contentType } = await downloadFromDrive(fileId);
      const key = await uploadToS3(buf, contentType, name);

      await db.query(
        "INSERT INTO product_images (product_id, image_key, sort_order) VALUES ($1, $2, $3)",
        [productId, key, 0]
      );

      uploaded++;
      if (uploaded % 10 === 0 || uploaded === 1) {
        console.log(`[${uploaded}/${items.length}] Uploaded: ${name}`);
      }
    } catch (err) {
      failed++;
      console.error(`FAILED: ${name} - ${err.message}`);
    }
  }

  console.log(`\nDone!`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped (already has image): ${skipped}`);
  console.log(`Not found in DB: ${notFound}`);
  console.log(`Failed: ${failed}`);

  await db.end();
}

main().catch(console.error);
