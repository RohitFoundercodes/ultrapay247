const db = require('../../config/db');

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

function escaped(value) {
  return value.replace(/[!%_]/g, '!$&');
}

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  if (filters.merchantRecordId !== undefined) {
    conditions.push('r.merchant_id=?');
    values.push(filters.merchantRecordId);
  }
  if (filters.merchantId) {
    conditions.push('d.merchant_code=?');
    values.push(filters.merchantId);
  }
  if (filters.search) {
    const search = `%${escaped(filters.search)}%`;
    conditions.push(`(
      CONCAT('DFR', LPAD(r.id, 6, '0')) LIKE ? ESCAPE '!'
      OR r.utr LIKE ? ESCAPE '!' OR r.description LIKE ? ESCAPE '!'
      OR d.merchant_code LIKE ? ESCAPE '!' OR d.company_name LIKE ? ESCAPE '!'
      OR m.name LIKE ? ESCAPE '!'
    )`);
    values.push(search, search, search, search, search, search);
  }
  if (filters.status) {
    conditions.push('r.status=?');
    values.push(filters.status);
  }
  if (filters.from) {
    conditions.push('r.created_at>=?');
    values.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    const nextDay = new Date(`${filters.to}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    conditions.push('r.created_at<?');
    values.push(`${nextDay.toISOString().slice(0, 10)} 00:00:00`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

const selectColumns = `
  r.id, r.merchant_id, d.merchant_code, d.company_name, m.name AS merchant_name,
  r.amount, r.commission_amount, r.description, r.utr, r.receipt_url,
  r.status, r.review_note, r.created_at, r.updated_at
`;
const joins = `
  FROM direct_fund_requests r
  JOIN merchants m ON m.id=r.merchant_id
  JOIN merchant_details d ON d.merchant_id=r.merchant_id
`;

exports.create = async (merchantId, request) => {
  const [result] = await db.query(
    `INSERT INTO direct_fund_requests
      (merchant_id, amount, description, utr, receipt_url)
     VALUES (?, ?, ?, ?, ?)`,
    [merchantId, request.amount, request.description, request.utr, request.receiptUrl]
  );
  return exports.getMerchantById(merchantId, result.insertId);
};

exports.list = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [countResult, requestResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total ${joins} ${where}`,
      values
    ),
    db.query(
      `SELECT ${selectColumns} ${joins} ${where}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return {
    rows: requestResult[0],
    total: Number(countResult[0][0].total)
  };
};

exports.summary = async (filters) => {
  const summaryFilters = { ...filters, status: undefined };
  const { where, values } = buildWhere(summaryFilters);
  const [rows] = await db.query(
    `SELECT
      COUNT(*) AS total_requests,
      COALESCE(SUM(CASE WHEN r.status='pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN r.status='in_process' THEN 1 ELSE 0 END), 0) AS in_process,
      COALESCE(SUM(CASE WHEN r.status='approved' THEN 1 ELSE 0 END), 0) AS approved,
      COALESCE(SUM(CASE WHEN r.status='rejected' THEN 1 ELSE 0 END), 0) AS rejected
     ${joins}
     ${where}`,
    values
  );
  return rows[0];
};

exports.getMerchantById = async (merchantId, id) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns} ${joins}
     WHERE r.merchant_id=? AND r.id=?`,
    [merchantId, id]
  );
  return rows[0];
};

exports.getById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${selectColumns} ${joins} WHERE r.id=?`,
    [id]
  );
  return rows[0];
};

exports.review = async (id, status, reviewNote) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.query(
      `SELECT ${selectColumns}, d.direct_fund_commission_enabled,
        d.direct_fund_commission_percent
       ${joins}
       WHERE r.id=? FOR UPDATE`,
      [id]
    );
    if (!requests.length) {
      await connection.rollback();
      return null;
    }

    const request = requests[0];
    if (request.status === status) {
      await connection.commit();
      return request;
    }
    if (request.status !== 'pending' && request.status !== 'in_process') {
      const error = new Error('A completed direct fund request cannot be changed');
      error.status = 409;
      throw error;
    }

    let commissionAmount = String(request.commission_amount || '0.00');
    if (status === 'approved') {
      const [merchants] = await connection.query(
        'SELECT id FROM merchants WHERE id=? FOR UPDATE',
        [request.merchant_id]
      );
      if (!merchants.length) {
        const error = new Error('Merchant not found');
        error.status = 404;
        throw error;
      }

      const [[totals]] = await connection.query(
        `SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount
          WHEN entry_type='debit' THEN -amount ELSE 0 END), 0) AS balance
         FROM merchant_wallet_ledger
         WHERE merchant_id=?`,
        [request.merchant_id]
      );
      const balanceCents = decimalToCents(totals.balance);
      const amountCents = decimalToCents(request.amount);
      let commissionCents = 0n;
      if (Number(request.direct_fund_commission_enabled) === 1) {
        const commissionPercent = Number(request.direct_fund_commission_percent);
        if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
          throw new Error('Direct fund commission configuration is invalid');
        }
        const commissionRate = Math.round(commissionPercent * 100);
        commissionCents = (amountCents * BigInt(commissionRate) + 5000n) / 10000n;
      }
      const balanceAfterCents = balanceCents + amountCents;
      if (balanceAfterCents > 999999999999n || balanceAfterCents < -999999999999n) {
        const error = new Error('Merchant wallet balance limit exceeded');
        error.status = 409;
        throw error;
      }

      const requestCode = `DFR${String(request.id).padStart(6, '0')}`;
      commissionAmount = centsToDecimal(commissionCents);
      await connection.query(
        `INSERT INTO merchant_wallet_ledger (
          merchant_id, entry_type, amount, commission_amount, balance_after,
          reference, description
        ) VALUES (?, 'credit', ?, ?, ?, ?, ?)`,
        [
          request.merchant_id,
          request.amount,
          centsToDecimal(commissionCents),
          centsToDecimal(balanceAfterCents),
          requestCode,
          `Approved direct fund request ${requestCode}`
        ]
      );
    }

    let updateSql = 'UPDATE direct_fund_requests SET status=?, commission_amount=?';
    const updateValues = [status, commissionAmount];
    if (reviewNote !== undefined) {
      updateSql += ', review_note=?';
      updateValues.push(reviewNote);
    }
    updateSql += ', updated_at=CURRENT_TIMESTAMP WHERE id=?';
    updateValues.push(id);
    await connection.query(updateSql, updateValues);

    const [updatedRows] = await connection.query(
      `SELECT ${selectColumns} ${joins} WHERE r.id=?`,
      [id]
    );
    await connection.commit();
    return updatedRows[0];
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back direct fund review:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};
