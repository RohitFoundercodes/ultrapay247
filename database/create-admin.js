require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

async function createAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters)');
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [result] = await db.query(
    'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
    [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
  );
  console.log(`Created UltraPay admin ${ADMIN_EMAIL.trim().toLowerCase()} (id ${result.insertId})`);
}

createAdmin()
  .catch((error) => {
    console.error(`Unable to create admin: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
