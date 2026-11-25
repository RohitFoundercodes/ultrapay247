const db = require('../../config/db');

function buildWhere(filters) {
  const conditions = [];
  const values = [];
  if (filters.status) {
    conditions.push('s.status=?');
    values.push(filters.status);
  }
  if (filters.mode) {
    conditions.push('s.mode=?');
    values.push(filters.mode);
  }
  if (filters.from) {
    conditions.push('COALESCE(s.settlement_date, DATE(s.created_at))>=?');
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push('COALESCE(s.settlement_date, DATE(s.created_at))<=?');
    values.push(filters.to);
  }
  if (filters.search) {
    const escapedSearch = filters.search.replace(/[!%_]/g, '!$&');
    const searchValue = `%${escapedSearch}%`;
    conditions.push(`(
      CONCAT('ST', LPAD(s.id, 6, '0')) LIKE ? ESCAPE '!'
      OR d.merchant_code LIKE ? ESCAPE '!' OR d.company_name LIKE ? ESCAPE '!'
      OR s.utr LIKE ? ESCAPE '!'
    )`);
    values.push(searchValue, searchValue, searchValue, searchValue);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

function buildDailyWhere(filters, includeStatus = true) {
  const conditions = [];
  const values = [];
  if (includeStatus && filters.status) {
    conditions.push('s.status=?');
    values.push(filters.status);
  }
  if (filters.mode) {
    conditions.push('s.mode=?');
    values.push(filters.mode);
  }
  if (filters.transactionFrom) {
    conditions.push('s.created_at>=?');
    values.push(`${filters.transactionFrom} 00:00:00`);
  }
  if (filters.transactionTo) {
    conditions.push('s.created_at<DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(filters.transactionTo);
  }
  if (filters.settlementFrom) {
    conditions.push('s.settlement_date>=?');
    values.push(filters.settlementFrom);
  }
  if (filters.settlementTo) {
    conditions.push('s.settlement_date<=?');
    values.push(filters.settlementTo);
  }
  if (filters.search) {
    const escapedSearch = filters.search.replace(/[!%_]/g, '!$&');
    const searchValue = `%${escapedSearch}%`;
    conditions.push(`(
      CONCAT('ST', LPAD(s.id, 6, '0')) LIKE ? ESCAPE '!'
      OR d.merchant_code LIKE ? ESCAPE '!' OR d.company_name LIKE ? ESCAPE '!'
      OR s.utr LIKE ? ESCAPE '!'
    )`);
    values.push(searchValue, searchValue, searchValue, searchValue);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

const joins = `
  FROM merchant_settlements s
  JOIN merchants m ON m.id=s.merchant_id
  JOIN merchant_details d ON d.merchant_id=s.merchant_id
`;
const columns = `s.id, DATE_FORMAT(s.settlement_date, '%Y-%m-%d') AS settlement_date,
  s.payin_amount, s.charge_amount,
  s.settled_amount, s.mode, s.utr, s.status, s.created_at, s.updated_at,
  d.merchant_code, d.company_name, m.name AS merchant_name`;

exports.list = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [countResult, rowsResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total ${joins} ${where}`, values),
    db.query(
      `SELECT ${columns} ${joins} ${where}
       ORDER BY COALESCE(s.settlement_date, DATE(s.created_at)) DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return {
    rows: rowsResult[0],
    total: Number(countResult[0][0].total)
  };
};

exports.stats = async (filters) => {
  const summaryFilters = { ...filters, status: undefined };
  const { where, values } = buildWhere(summaryFilters);
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN s.status='settled' THEN s.settled_amount ELSE 0 END), 0) AS total_settled_amount,
       COALESCE(SUM(CASE WHEN s.status='pending' THEN s.settled_amount ELSE 0 END), 0) AS pending_settlement,
       COALESCE(SUM(CASE WHEN s.status='processing' THEN s.settled_amount ELSE 0 END), 0) AS processing,
       COALESCE(SUM(CASE WHEN s.status='failed' THEN s.settled_amount ELSE 0 END), 0) AS failed_settlement
     ${joins}
     ${where}`,
    values
  );
  return rows[0];
};

exports.dailyList = async (filters) => {
  const { where, values } = buildDailyWhere(filters);
  const [countResult, rowsResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total ${joins} ${where}`, values),
    db.query(
      `SELECT s.id, DATE_FORMAT(s.created_at, '%Y-%m-%d') AS transaction_date,
        DATE_FORMAT(s.settlement_date, '%Y-%m-%d') AS settlement_date,
        s.payin_amount, s.charge_amount, s.settled_amount, s.mode, s.utr, s.status,
        s.created_at, s.updated_at, d.merchant_code, d.company_name,
        m.name AS merchant_name,
        COALESCE((
          SELECT previous_entry.balance_after
          FROM merchant_wallet_ledger previous_entry
          WHERE previous_entry.merchant_id=s.merchant_id
            AND previous_entry.created_at<s.created_at
          ORDER BY previous_entry.created_at DESC, previous_entry.id DESC LIMIT 1
        ), (
          SELECT first_entry.balance_after - CASE
            WHEN first_entry.entry_type='credit' THEN first_entry.amount
            WHEN first_entry.entry_type='debit' THEN -first_entry.amount
            ELSE 0 END
          FROM merchant_wallet_ledger first_entry
          WHERE first_entry.merchant_id=s.merchant_id
          ORDER BY first_entry.id ASC LIMIT 1
        ), 0) + COALESCE((
          SELECT SUM(previous.settled_amount)
          FROM merchant_settlements previous
          WHERE previous.merchant_id=s.merchant_id
            AND previous.status='settled'
            AND (previous.created_at<s.created_at
              OR (previous.created_at=s.created_at AND previous.id<s.id))
        ), 0) AS opening_balance,
        COALESCE((
          SELECT previous_entry.balance_after
          FROM merchant_wallet_ledger previous_entry
          WHERE previous_entry.merchant_id=s.merchant_id
            AND previous_entry.created_at<s.created_at
          ORDER BY previous_entry.created_at DESC, previous_entry.id DESC LIMIT 1
        ), (
          SELECT first_entry.balance_after - CASE
            WHEN first_entry.entry_type='credit' THEN first_entry.amount
            WHEN first_entry.entry_type='debit' THEN -first_entry.amount
            ELSE 0 END
          FROM merchant_wallet_ledger first_entry
          WHERE first_entry.merchant_id=s.merchant_id
          ORDER BY first_entry.id ASC LIMIT 1
        ), 0) + COALESCE((
          SELECT SUM(previous.settled_amount)
          FROM merchant_settlements previous
          WHERE previous.merchant_id=s.merchant_id
            AND previous.status='settled'
            AND (previous.created_at<s.created_at
              OR (previous.created_at=s.created_at AND previous.id<s.id))
        ), 0) + CASE WHEN s.status='settled' THEN s.settled_amount ELSE 0 END
          AS closing_balance
       ${joins}
       ${where}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return {
    rows: rowsResult[0],
    total: Number(countResult[0][0].total)
  };
};

exports.dailyStats = async (filters) => {
  const { where, values } = buildDailyWhere(filters, false);
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN s.status='settled' THEN s.settled_amount ELSE 0 END), 0) AS total_settlement_amount,
       COALESCE(SUM(CASE WHEN s.status='pending' THEN s.settled_amount ELSE 0 END), 0) AS pending_settlement,
       COALESCE(SUM(CASE WHEN s.status='settled' AND s.settlement_date=CURDATE()
         THEN s.settled_amount ELSE 0 END), 0) AS todays_settlement,
       COALESCE(SUM(s.charge_amount), 0) AS total_charges,
       COALESCE(SUM(CASE WHEN s.status='processing' THEN s.settled_amount ELSE 0 END), 0) AS processing,
       COALESCE(SUM(CASE WHEN s.status='failed' THEN s.settled_amount ELSE 0 END), 0) AS failed_settlement
     ${joins}
     ${where}`,
    values
  );
  return rows[0];
};

exports.getById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${columns} ${joins} WHERE s.id=?`,
    [id]
  );
  return rows[0];
};

exports.create = async (data, adminId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.query(
      `SELECT m.id FROM merchants m
       JOIN merchant_details d ON d.merchant_id=m.id
       WHERE d.merchant_code=? FOR UPDATE`,
      [data.merchantId]
    );
    if (!merchantRows.length) {
      const error = new Error('Merchant not found');
      error.status = 404;
      throw error;
    }

    const [result] = await connection.query(
      `INSERT INTO merchant_settlements (
        merchant_id, settlement_date, payin_amount, charge_amount, settled_amount,
        mode, utr, status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merchantRows[0].id, data.settlementDate, data.payinAmount, data.chargeAmount,
        data.settledAmount, data.mode, data.utr, data.status, adminId, adminId
      ]
    );
    const [rows] = await connection.query(
      `SELECT ${columns} ${joins} WHERE s.id=?`,
      [result.insertId]
    );
    await connection.commit();
    return rows[0];
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back settlement creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.update = async (id, updates, adminId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.query(
      `SELECT s.status, s.utr, s.mode, s.settlement_date
       FROM merchant_settlements s WHERE s.id=? FOR UPDATE`,
      [id]
    );
    if (!currentRows.length) {
      await connection.rollback();
      return null;
    }
    const current = currentRows[0];
    const status = updates.status === undefined ? current.status : updates.status;
    const utr = updates.utr === undefined ? current.utr : updates.utr;
    const mode = updates.mode === undefined ? current.mode : updates.mode;
    const settlementDate = updates.settlementDate === undefined
      ? current.settlement_date
      : updates.settlementDate;
    if (status === 'settled' && !utr) {
      const error = new Error('A UTR is required for settled records');
      error.status = 400;
      throw error;
    }

    await connection.query(
      `UPDATE merchant_settlements SET
        status=?, utr=?, mode=?,
        settlement_date=CASE WHEN ?='settled'
          THEN COALESCE(?, CURRENT_DATE) ELSE ? END,
        updated_by=?,
        updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        status, utr, mode, status, settlementDate, settlementDate, adminId, id
      ]
    );
    const [rows] = await connection.query(
      `SELECT ${columns} ${joins} WHERE s.id=?`,
      [id]
    );
    await connection.commit();
    return rows[0];
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back settlement update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

