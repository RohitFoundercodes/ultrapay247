require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const email = 'admin@test.ultrapay.local';
const password = 'UltraPay-Test-Admin-2026!';

async function seedTestAdmin() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Test admin seeding is allowed only when NODE_ENV=development');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.query(
    `INSERT INTO admins (name, email, password_hash, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       name=VALUES(name),
       password_hash=VALUES(password_hash),
       status='active'`,
    ['UltraPay Test Admin', email, passwordHash]
  );
  console.log(`Created or reset local test admin: ${email}`);
}

seedTestAdmin()
  .catch((error) => {
    console.error(`Unable to seed test admin: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
