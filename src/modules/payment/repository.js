const db = require('../../config/db');

exports.create = async (data) => {
  const [[commissionRow]] = await db.query(
    `SELECT payin_commission
     FROM merchant_details
     WHERE merchant_id=?`,
    [data.merchantId]
  );
  const commissionPercent = commissionRow ? Number(commissionRow.payin_commission) : 0;
  const commissionAmount = Math.round(data.amount * commissionPercent) / 100;
  const netAmount = Math.round((data.amount - commissionAmount) * 100) / 100;

  let providerName = data.providerName;
  if (data.gatewayAccountId && !providerName) {
    const [gatewayRows] = await db.query(
      `SELECT provider_name FROM payment_gateway_accounts WHERE id=?`,
      [data.gatewayAccountId]
    );
    providerName = gatewayRows[0]?.provider_name || null;
  }

  const [result] = await db.query(
    `INSERT INTO payments
      (merchant_id, reference, order_id, gateway_account_id, provider_name,
       amount, commission_amount, net_amount, currency, payment_id,
       customer_email, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.merchantId, data.reference, data.orderId, data.gatewayAccountId,
      providerName, data.amount, commissionAmount, netAmount, data.currency,
      data.paymentId, data.customerEmail, data.description
    ]
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
