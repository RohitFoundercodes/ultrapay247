const db = require('../../config/db');

exports.create = async(data)=>{
  const [res] = await db.query(
    "INSERT INTO merchants (name,email,password) VALUES (?,?,?)",
    [data.name,data.email,data.password]
  );
  return {id:res.insertId,...data};
};

exports.findByEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT m.id, m.name, m.email, m.password, m.status,
      d.merchant_code, d.mobile, d.payin_enabled, d.payout_enabled
     FROM merchants m
     LEFT JOIN merchant_details d ON d.merchant_id=m.id
     WHERE m.email=?`,
    [email]
  );
  return rows[0];
};

exports.getPasswordHash = async (merchantId) => {
  const [rows] = await db.query(
    'SELECT password FROM merchants WHERE id=?',
    [merchantId]
  );
  return rows[0] && rows[0].password;
};

exports.updatePasswordAndLog = async (merchantId, currentHash, newHash) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      'UPDATE merchants SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND password=?',
      [newHash, merchantId, currentHash]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return false;
    }

    await connection.query(
      'INSERT INTO merchant_password_change_logs (merchant_id) VALUES (?)',
      [merchantId]
    );
    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back merchant password change:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.createLoginLog = async (merchantId, device) => {
  await db.query(
    `INSERT INTO merchant_login_logs (merchant_id, device_id, device_name)
     VALUES (?, ?, ?)`,
    [merchantId, device.deviceId, device.deviceName]
  );
};
