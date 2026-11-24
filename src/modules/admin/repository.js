const db = require('../../config/db');

exports.findByEmail = async (email) => {
  const [rows] = await db.query(
    'SELECT id, name, email, password_hash, status FROM admins WHERE email=?',
    [email]
  );
  return rows[0];
};

exports.getPasswordHash = async (adminId) => {
  const [rows] = await db.query(
    'SELECT password_hash FROM admins WHERE id=?',
    [adminId]
  );
  return rows[0] && rows[0].password_hash;
};

exports.updatePassword = async (adminId, currentHash, newHash) => {
  const [result] = await db.query(
    'UPDATE admins SET password_hash=? WHERE id=? AND password_hash=?',
    [newHash, adminId, currentHash]
  );
  return result.affectedRows > 0;
};
