require('dotenv').config();
const db = require('../src/config/db');

const merchantCode = process.env.SAMPLE_SETTLEMENT_MERCHANT_CODE || 'MCH0001';
const referenceUtr = `DEMO-UTR-${merchantCode}-20261116`;

async function seedSampleSettlement() {
  if (process.env.NODE_ENV !== 'development' ||
      process.env.ALLOW_SAMPLE_SETTLEMENT_SEED !== 'true') {
    throw new Error(
      'Sample settlement seeding requires NODE_ENV=development and ALLOW_SAMPLE_SETTLEMENT_SEED=true'
    );
  }
  const developmentTarget = /dev|test|local|staging/i.test(process.env.DB_NAME || '') ||
    /localhost|127\.0\.0\.1/i.test(process.env.DB_HOST || '');
  if (!developmentTarget) {
    throw new Error(
      'Sample data may only be seeded into a local, development, test, or staging database'
    );
  }

  const [tables] = await db.query(
    `SELECT COUNT(*) AS found
     FROM information_schema.tables
     WHERE table_schema=DATABASE() AND table_name='merchant_settlements'`
  );
  if (Number(tables[0].found) === 0) {
    throw new Error('merchant_settlements table is missing; run npm run migrate first');
  }

  const [merchants] = await db.query(
    `SELECT m.id
     FROM merchants m
     JOIN merchant_details d ON d.merchant_id=m.id
     WHERE d.merchant_code=?`,
    [merchantCode]
  );
  if (!merchants.length) {
    throw new Error(`Merchant ${merchantCode} was not found; configure a valid SAMPLE_SETTLEMENT_MERCHANT_CODE`);
  }

  const merchantId = merchants[0].id;
  const [existing] = await db.query(
    `SELECT id FROM merchant_settlements
     WHERE merchant_id=? AND utr=? LIMIT 1`,
    [merchantId, referenceUtr]
  );
  if (existing.length) {
    console.log(`Sample settlement already exists: ST${String(existing[0].id).padStart(6, '0')}`);
    return;
  }

  const [result] = await db.query(
    `INSERT INTO merchant_settlements (
      merchant_id, settlement_date, payin_amount, charge_amount, settled_amount,
      mode, utr, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'settled', ?, ?)`,
    [
      merchantId,
      '2026-11-16',
      500000,
      2500,
      497500,
      'IMPS',
      referenceUtr,
      '2026-11-16 12:00:00',
      '2026-11-16 12:00:00'
    ]
  );
  console.log(`Inserted sample settlement ST${String(result.insertId).padStart(6, '0')} for ${merchantCode}.`);
}

seedSampleSettlement()
  .catch((error) => {
    console.error(`Unable to seed sample settlement: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
