const db = require('../../config/db');

exports.create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO payments
      (merchant_id, reference, amount, currency, customer_email, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.merchantId, data.reference, data.amount, data.currency, data.customerEmail, data.description]
  );
  return exports.getOne(data.merchantId, result.insertId);
};

exports.getAll = async (merchantId) => {
  const [rows] = await db.query(
    'SELECT * FROM payments WHERE merchant_id=? ORDER BY created_at DESC',
    [merchantId]
  );
  return rows;
};

exports.getOne = async (merchantId, id) => {
  const [rows] = await db.query(
    'SELECT * FROM payments WHERE merchant_id=? AND id=?',
    [merchantId, id]
  );
  return rows[0];
};

exports.updateStatus = async (merchantId, id, status) => {
  await db.query(
    'UPDATE payments SET status=? WHERE merchant_id=? AND id=?',
    [status, merchantId, id]
  );
  return exports.getOne(merchantId, id);
};
