const db = require('../../config/db');
const notifications = require('../notification/repository');

exports.create = async (data) => {
  const [merchantRows] = await db.query(
    `SELECT payin_commission
     FROM merchant_details
     WHERE merchant_id=?`,
    [data.merchantId]
  );
  if (!merchantRows.length) {
    const error = new Error('Merchant not found');
    error.status = 404;
    throw error;
  }
  const commissionPercent = Number(merchantRows[0].payin_commission);
  const commissionAmount = Math.round(data.amount * commissionPercent) / 100;
  const netAmount = Math.round((data.amount - commissionAmount) * 100) / 100;

  let providerName = data.providerName;
  if (data.gatewayAccountId) {
    const [gatewayRows] = await db.query(
      `SELECT provider_name
       FROM payment_gateway_accounts
       WHERE id=? AND status='enabled' AND direction IN ('payin', 'both')`,
      [data.gatewayAccountId]
    );
    if (!gatewayRows.length) {
      const error = new Error('Payin gateway account not found or disabled');
      error.status = 400;
      throw error;
    }
    if (!providerName) providerName = gatewayRows[0].provider_name;
  }

  const connection = await db.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    [result] = await connection.query(
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
    await notifications.createForAdmins(connection, {
      category: 'payin',
      title: 'New payin request',
      message: `Merchant submitted payin ${data.reference} for ${data.currency} ${Number(data.amount).toFixed(2)}.`,
      resourceType: 'payin',
      resourceId: result.insertId
    });
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back payin creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
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

exports.updateAdminStatus = async (id, updates) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.query(
      `SELECT merchant_id, reference, status, settlement_status, utr, payment_id,
        amount, currency
       FROM payments WHERE id=? FOR UPDATE`,
      [id]
    );
    if (!payments.length) {
      await connection.rollback();
      return false;
    }

    const payment = payments[0];
    const changed = Object.keys(updates).some((field) => {
      const currentField = field === 'settlement' ? 'settlement_status'
        : field === 'paymentId' ? 'payment_id' : field;
      return String(payment[currentField] || '') !== String(updates[field] || '');
    });

    if (changed) {
      const columns = {
        status: 'status',
        settlement: 'settlement_status',
        utr: 'utr',
        paymentId: 'payment_id'
      };
      const fields = Object.keys(updates);
      await connection.query(
        `UPDATE payments SET ${fields.map(field => `${columns[field]}=?`).join(', ')},
          updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [...fields.map(field => updates[field]), id]
      );
      const changes = [];
      if (updates.status !== undefined) changes.push(`status is ${updates.status}`);
      if (updates.settlement !== undefined) changes.push(`settlement is ${updates.settlement}`);
      await notifications.createForMerchant(connection, payment.merchant_id, {
        category: 'payin',
        title: 'Payin request updated',
        message: `Payin ${payment.reference} was updated${changes.length ? `: ${changes.join(', ')}` : '.'}`,
        resourceType: 'payin',
        resourceId: id
      });
    }
    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back payin status update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};
