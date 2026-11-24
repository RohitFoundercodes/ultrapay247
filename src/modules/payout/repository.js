const db = require('../../config/db');
const notifications = require('../notification/repository');
const transactionLimits = require('../merchant/transaction-limits');

function escaped(value) {
  return value.replace(/[!%_]/g, '!$&');
}

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  if (filters.merchantRecordId !== undefined) {
    conditions.push('p.merchant_id=?');
    values.push(filters.merchantRecordId);
  }
  if (filters.search) {
    const search = `%${escaped(filters.search)}%`;
    conditions.push(`(
      p.reference LIKE ? ESCAPE '!' OR p.order_id LIKE ? ESCAPE '!'
      OR p.payment_id LIKE ? ESCAPE '!' OR d.merchant_code LIKE ? ESCAPE '!'
      OR d.company_name LIKE ? ESCAPE '!' OR p.provider_name LIKE ? ESCAPE '!'
    )`);
    values.push(search, search, search, search, search, search);
  }
  if (filters.merchantId) {
    conditions.push('d.merchant_code=?');
    values.push(filters.merchantId);
  }
  if (filters.provider) {
    conditions.push('p.provider_name=?');
    values.push(filters.provider);
  }
  if (filters.status) {
    conditions.push('p.status=?');
    values.push(filters.status);
  }
  if (filters.settlement) {
    conditions.push('p.settlement_status=?');
    values.push(filters.settlement);
  }
  if (filters.from) {
    conditions.push('p.created_at>=?');
    values.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    const nextDay = new Date(`${filters.to}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    conditions.push('p.created_at<?');
    values.push(`${nextDay.toISOString().slice(0, 10)} 00:00:00`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

const selectColumns = `
  p.id, p.merchant_id AS merchant_record_id, p.created_at, p.reference,
  p.order_id, p.gateway_account_id, d.merchant_code AS merchant_id,
  d.company_name, p.provider_name, p.payout_type, p.beneficiary_name,
  p.beneficiary_account_last4, p.beneficiary_ifsc, p.amount,
  p.commission_amount, p.net_amount, p.currency, p.payment_id,
  p.status, p.settlement_status, p.utr, p.customer_email,
  p.description, p.updated_at
`;

exports.create = async (data) => {
  const connection = await db.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    const merchant = await transactionLimits.validate({
      queryable: connection,
      merchantId: data.merchantId,
      direction: 'payout',
      amount: data.amount,
      currency: data.currency,
      lock: true
    });

    let providerName = data.providerName;
    if (data.gatewayAccountId) {
      const [gateways] = await connection.query(
        `SELECT provider_name
         FROM payment_gateway_accounts
         WHERE id=? AND status='enabled' AND direction IN ('payout', 'both')`,
        [data.gatewayAccountId]
      );
      if (!gateways.length) {
        const error = new Error('Payout gateway account not found or disabled');
        error.status = 400;
        throw error;
      }
      if (!providerName) providerName = gateways[0].provider_name;
    }

    const commissionAmount = Math.round(
      data.amount * Number(merchant.payout_commission) / 100 * 100
    ) / 100;
    [result] = await connection.query(
      `INSERT INTO payout_transactions (
        merchant_id, reference, order_id, gateway_account_id, provider_name, payout_type,
        beneficiary_name, beneficiary_account_encrypted, beneficiary_account_last4,
        beneficiary_ifsc, amount, commission_amount, net_amount, currency,
        payment_id, customer_email, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.merchantId, data.reference, data.orderId, data.gatewayAccountId,
        providerName, data.payoutType, data.beneficiaryName, data.accountNumberEncrypted,
        data.accountNumberLast4, data.ifsc, data.amount, commissionAmount,
        data.amount, data.currency, data.paymentId, data.customerEmail, data.description
      ]
    );
    await notifications.createForAdmins(connection, {
      category: 'payout',
      title: 'New payout request',
      message: `Merchant submitted payout ${data.reference} for ${data.currency} ${Number(data.amount).toFixed(2)}.`,
      resourceType: 'payout',
      resourceId: result.insertId
    });
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back payout creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
  return exports.getMerchantById(data.merchantId, result.insertId);
};

exports.list = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [countRows, rows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM payout_transactions p
       LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
       ${where}`,
      values
    ),
    db.query(
      `SELECT ${selectColumns}
       FROM payout_transactions p
       LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return { rows: rows[0], total: Number(countRows[0][0].total) };
};

exports.getById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns}
     FROM payout_transactions p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     WHERE p.id=?`,
    [id]
  );
  return rows[0];
};

exports.getMerchantById = async (merchantRecordId, id) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns}
     FROM payout_transactions p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     WHERE p.merchant_id=? AND p.id=?`,
    [merchantRecordId, id]
  );
  return rows[0];
};

exports.stats = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [rows] = await db.query(
    `SELECT
      COALESCE(SUM(p.amount), 0) AS total_payout,
      COALESCE(SUM(CASE WHEN p.status='succeeded' THEN p.amount ELSE 0 END), 0) AS successful_payout,
      COALESCE(SUM(CASE WHEN p.status='pending' THEN p.amount ELSE 0 END), 0) AS pending_payout,
      COALESCE(SUM(CASE WHEN p.status='failed' THEN p.amount ELSE 0 END), 0) AS failed_payout,
      COALESCE(SUM(p.commission_amount), 0) AS total_commission,
      COALESCE(SUM(CASE WHEN DATE(p.created_at)=CURDATE() THEN p.amount ELSE 0 END), 0) AS today_payout
     FROM payout_transactions p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     ${where}`,
    values
  );
  return rows[0];
};

exports.updateStatus = async (id, updates) => {
  const columns = {
    status: 'status',
    settlement: 'settlement_status',
    utr: 'utr',
    paymentId: 'payment_id'
  };
  const fields = Object.keys(updates);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [transactions] = await connection.query(
      `SELECT merchant_id, reference, status, settlement_status, utr, payment_id
       FROM payout_transactions WHERE id=? FOR UPDATE`,
      [id]
    );
    if (!transactions.length) {
      await connection.rollback();
      return false;
    }
    const transaction = transactions[0];
    const changed = fields.some((field) => {
      const currentField = field === 'settlement' ? 'settlement_status'
        : field === 'paymentId' ? 'payment_id' : field;
      return String(transaction[currentField] || '') !== String(updates[field] || '');
    });
    if (changed) {
      const assignments = fields.map(field => `${columns[field]}=?`);
      await connection.query(
        `UPDATE payout_transactions
         SET ${assignments.join(', ')}, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [...fields.map(field => updates[field]), id]
      );
      const changes = [];
      if (updates.status !== undefined) changes.push(`status is ${updates.status}`);
      if (updates.settlement !== undefined) changes.push(`settlement is ${updates.settlement}`);
      await notifications.createForMerchant(connection, transaction.merchant_id, {
        category: 'payout',
        title: 'Payout request updated',
        message: `Payout ${transaction.reference} was updated${changes.length ? `: ${changes.join(', ')}` : '.'}`,
        resourceType: 'payout',
        resourceId: id
      });
    }
    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back payout status update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.exportRows = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [rows] = await db.query(
    `SELECT ${selectColumns}
     FROM payout_transactions p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT 10000`,
    values
  );
  return rows;
};
