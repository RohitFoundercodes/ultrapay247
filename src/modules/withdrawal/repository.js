const db = require('../../config/db');
const notifications = require('../notification/repository');

function decimalToCents(value) {
  const text = String(value);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

function centsToDecimal(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

const selectColumns = `
  w.id, w.merchant_id, w.full_name, w.bank_name,
  w.account_number_encrypted, w.account_number_last4, w.ifsc, w.amount,
  w.status, w.review_note, w.reviewed_by, w.reviewed_at,
  w.created_at, w.updated_at
`;

exports.create = async (merchantId, request) => {
  const connection = await db.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    [result] = await connection.query(
      `INSERT INTO merchant_withdrawal_requests (
        merchant_id, full_name, bank_name, account_number_encrypted,
        account_number_last4, ifsc, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        merchantId, request.fullName, request.bankName, request.accountNumberEncrypted,
        request.accountNumberLast4, request.ifsc, request.amount
      ]
    );
    const requestCode = `WDR${String(result.insertId).padStart(6, '0')}`;
    await notifications.createForAdmins(connection, {
      category: 'withdrawal',
      title: 'New withdrawal request',
      message: `Merchant submitted withdrawal ${requestCode} for INR ${Number(request.amount).toFixed(2)}.`,
      resourceType: 'withdrawal',
      resourceId: requestCode
    });
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back withdrawal creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
  return exports.getMerchantById(merchantId, result.insertId);
};

exports.listMerchant = async (merchantId) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns}, d.merchant_code
     FROM merchant_withdrawal_requests w
     LEFT JOIN merchant_details d ON d.merchant_id=w.merchant_id
     WHERE w.merchant_id=?
     ORDER BY w.created_at DESC
     LIMIT 100`,
    [merchantId]
  );
  return rows;
};

exports.statsMerchant = async (merchantId) => {
  const [rows] = await db.query(
    `SELECT
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN amount ELSE 0 END), 0) AS total_payout,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND DATE(created_at)=CURDATE()
        THEN amount ELSE 0 END), 0) AS today_payout,
      COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END), 0) AS pending_payout,
      COALESCE(SUM(CASE WHEN status='approved' THEN amount ELSE 0 END), 0) AS successful_payout
     FROM merchant_withdrawal_requests
     WHERE merchant_id=?`,
    [merchantId]
  );
  return rows[0];
};

exports.getMerchantById = async (merchantId, id) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns}, d.merchant_code
     FROM merchant_withdrawal_requests w
     LEFT JOIN merchant_details d ON d.merchant_id=w.merchant_id
     WHERE w.merchant_id=? AND w.id=?`,
    [merchantId, id]
  );
  return rows[0];
};

exports.listAdmin = async (filters) => {
  const conditions = [];
  const values = [];
  if (filters.status) {
    conditions.push('w.status=?');
    values.push(filters.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countRows, requestRows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM merchant_withdrawal_requests w
       ${where}`,
      values
    ),
    db.query(
      `SELECT ${selectColumns}, d.merchant_code
       FROM merchant_withdrawal_requests w
       LEFT JOIN merchant_details d ON d.merchant_id=w.merchant_id
       ${where}
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return { rows: requestRows[0], total: Number(countRows[0][0].total) };
};

exports.getById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns}, d.merchant_code
     FROM merchant_withdrawal_requests w
     LEFT JOIN merchant_details d ON d.merchant_id=w.merchant_id
     WHERE w.id=?`,
    [id]
  );
  return rows[0];
};

exports.review = async (id, status, reviewNote, adminId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.query(
      `SELECT ${selectColumns}, d.merchant_code
       FROM merchant_withdrawal_requests w
       LEFT JOIN merchant_details d ON d.merchant_id=w.merchant_id
       WHERE w.id=? FOR UPDATE`,
      [id]
    );
    if (!requests.length) {
      await connection.rollback();
      return null;
    }

    const request = requests[0];
    if (request.status !== 'pending') {
      if (request.status === status) {
        await connection.commit();
        return request;
      }
      const error = new Error('A reviewed withdrawal request cannot be changed');
      error.status = 409;
      throw error;
    }

    if (status === 'approved') {
      await connection.query('SELECT id FROM merchants WHERE id=? FOR UPDATE', [request.merchant_id]);
      const [[totals]] = await connection.query(
        `SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount
          WHEN entry_type='debit' THEN -amount ELSE 0 END), 0) AS balance
         FROM merchant_wallet_ledger
         WHERE merchant_id=?`,
        [request.merchant_id]
      );
      const balanceCents = decimalToCents(totals.balance);
      const amountCents = decimalToCents(request.amount);
      if (amountCents > balanceCents) {
        const error = new Error('Insufficient merchant wallet balance');
        error.status = 409;
        throw error;
      }

      const balanceAfter = centsToDecimal(balanceCents - amountCents);
      const reference = `WDR${String(request.id).padStart(6, '0')}`;
      await connection.query(
        `INSERT INTO merchant_wallet_ledger (
          merchant_id, entry_type, amount, commission_amount, balance_after,
          reference, description
        ) VALUES (?, 'debit', ?, 0, ?, ?, ?)`,
        [
          request.merchant_id, request.amount, balanceAfter, reference,
          `Approved withdrawal request ${reference}`
        ]
      );
    }

    await connection.query(
      `UPDATE merchant_withdrawal_requests
       SET status=?, review_note=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [status, reviewNote, adminId, id]
    );
    const [updatedRows] = await connection.query(
      `SELECT ${selectColumns}, d.merchant_code
       FROM merchant_withdrawal_requests w
       LEFT JOIN merchant_details d ON d.merchant_id=w.merchant_id
       WHERE w.id=?`,
      [id]
    );
    const requestCode = `WDR${String(request.id).padStart(6, '0')}`;
    await notifications.createForMerchant(connection, request.merchant_id, {
      category: 'withdrawal',
      title: 'Withdrawal request updated',
      message: `Withdrawal ${requestCode} was ${status}${reviewNote ? `: ${reviewNote}` : '.'}`,
      resourceType: 'withdrawal',
      resourceId: requestCode
    });
    await connection.commit();
    return updatedRows[0];
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back withdrawal review:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};
