const db = require('../../config/db');

exports.findByEmail = async (email) => {
  const [rows] = await db.query(
    'SELECT id, name, email, password_hash, status FROM admins WHERE email=?',
    [email]
  );
  return rows[0];
};
