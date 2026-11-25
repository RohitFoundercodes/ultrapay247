const db = require('../../config/db');

function transactionConditions(filters) {
  const conditions = [];
  const values = [];

  if (filters.merchantId) {
    conditions.push('d.merchant_code=?');
    values.push(filters.merchantId);
  }
  if (filters.type) {
    conditions.push('l.entry_type=?');
    values.push(filters.type);
  }
  if (filters.search) {
    const escapedSearch = filters.search.replace(/[!%_]/g, '!$&');
    const searchValue = `%${escapedSearch}%`;
    conditions.push(`(
      d.merchant_code LIKE ? ESCAPE '!' OR m.name LIKE ? ESCAPE '!'
      OR d.company_name LIKE ? ESCAPE '!' OR l.reference LIKE ? ESCAPE '!'
      OR l.description LIKE ? ESCAPE '!'
    )`);
    values.push(searchValue, searchValue, searchValue, searchValue, searchValue);
  }
  if (filters.from) {
    conditions.push('l.created_at >= ?');
    values.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    conditions.push('l.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(filters.to);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

exports.getSummary = async () => {
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount
         WHEN entry_type='debit' THEN -amount ELSE 0 END), 0) AS wallet_balance,
       COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END), 0) AS total_credit,
       COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount ELSE 0 END), 0) AS total_debit,
       COALESCE(SUM(commission_amount), 0) AS total_commission
     FROM merchant_wallet_ledger`
  );
  return rows[0];
};

exports.getMerchantSummary = async (merchantCode, filters) => {
  function dateConditions(alias) {
    let sql = '';
    const dateValues = [];
    if (filters.from) {
      sql += ` AND ${alias}.created_at>=?`;
      dateValues.push(`${filters.from} 00:00:00`);
    }
    if (filters.to) {
      sql += ` AND ${alias}.created_at<DATE_ADD(?, INTERVAL 1 DAY)`;
      dateValues.push(filters.to);
    }
    return { sql, values: dateValues };
  }
  const periodStart = filters.from ? '?' : null;
  const openingValues = filters.from ? [`${filters.from} 00:00:00`] : [];
  const ledgerDateConditions = dateConditions('l');
  const payinDateConditions = dateConditions('p');
  const payoutDateConditions = dateConditions('p');
  const directFundDateConditions = dateConditions('r');
  const manualCommissionDateConditions = dateConditions('l');

  const openingBalanceSql = periodStart
    ? `COALESCE(
        (SELECT l.balance_after FROM merchant_wallet_ledger l
         WHERE l.merchant_id=m.id AND l.created_at<${periodStart}
         ORDER BY l.created_at DESC, l.id DESC LIMIT 1),
        (SELECT first_entry.balance_after - CASE
           WHEN first_entry.entry_type='credit' THEN first_entry.amount
           WHEN first_entry.entry_type='debit' THEN -first_entry.amount
           ELSE 0 END
         FROM merchant_wallet_ledger first_entry
         WHERE first_entry.merchant_id=m.id
         ORDER BY first_entry.created_at ASC, first_entry.id ASC LIMIT 1),
        0)`
    : `COALESCE(
        (SELECT first_entry.balance_after - CASE
           WHEN first_entry.entry_type='credit' THEN first_entry.amount
           WHEN first_entry.entry_type='debit' THEN -first_entry.amount
           ELSE 0 END
         FROM merchant_wallet_ledger first_entry
         WHERE first_entry.merchant_id=m.id
         ORDER BY first_entry.created_at ASC, first_entry.id ASC LIMIT 1),
        0)`;
  const [rows] = await db.query(
    `SELECT m.id, d.merchant_code, m.name, m.email, m.status,
       d.mobile, d.company_name,
       ${openingBalanceSql} AS opening_balance,
       COALESCE((SELECT SUM(l.amount) FROM merchant_wallet_ledger l
         WHERE l.merchant_id=m.id AND l.entry_type='credit'${ledgerDateConditions.sql}), 0) AS total_credit,
       COALESCE((SELECT SUM(l.amount) FROM merchant_wallet_ledger l
         WHERE l.merchant_id=m.id AND l.entry_type='debit'${ledgerDateConditions.sql}), 0) AS total_debit,
       COALESCE((SELECT SUM(p.commission_amount) FROM payments p
         WHERE p.merchant_id=m.id${payinDateConditions.sql}), 0) AS payin_commission,
       COALESCE((SELECT SUM(p.commission_amount) FROM payout_transactions p
         WHERE p.merchant_id=m.id${payoutDateConditions.sql}), 0) AS payout_commission,
       COALESCE((SELECT SUM(r.commission_amount) FROM direct_fund_requests r
         WHERE r.merchant_id=m.id AND r.status='approved'${directFundDateConditions.sql}), 0) AS direct_fund_commission,
       COALESCE((SELECT SUM(l.commission_amount) FROM merchant_wallet_ledger l
         WHERE l.merchant_id=m.id AND l.entry_type='commission'${manualCommissionDateConditions.sql}), 0) AS other_commission
     FROM merchants m
     JOIN merchant_details d ON d.merchant_id=m.id
     WHERE d.merchant_code=?`,
    [
      ...openingValues,
      ...ledgerDateConditions.values,
      ...ledgerDateConditions.values,
      ...payinDateConditions.values,
      ...payoutDateConditions.values,
      ...directFundDateConditions.values,
      ...manualCommissionDateConditions.values,
      merchantCode
    ]
  );
  return rows[0];
};

function merchantTransactionQuery() {
  return `(
    SELECT CONCAT('PAY-', p.id) AS id, p.created_at,
      p.reference AS transaction_id,
      CASE WHEN p.status='succeeded' THEN 'credit'
        WHEN p.status='refunded' THEN 'debit' ELSE 'pending' END AS type,
      'payin' AS source, p.amount, p.commission_amount,
      CASE WHEN l.id IS NULL THEN NULL
        ELSE l.balance_after - CASE
          WHEN l.entry_type='credit' THEN l.amount
          WHEN l.entry_type='debit' THEN -l.amount ELSE 0 END
      END AS opening_balance,
      l.balance_after AS closing_balance,
      COALESCE(p.payment_id, p.order_id) AS reference_id,
      p.description,
      CASE WHEN p.status='succeeded' THEN 'success'
        WHEN p.status='pending' THEN 'pending'
        WHEN p.status='refunded' THEN 'refunded' ELSE 'failed' END AS status
    FROM payments p
    JOIN merchant_details d ON d.merchant_id=p.merchant_id
    LEFT JOIN merchant_wallet_ledger l
      ON l.merchant_id=p.merchant_id AND l.reference=p.reference
    WHERE d.merchant_code=?
  )
  UNION ALL
  (
    SELECT CONCAT('PO-', p.id), p.created_at, p.reference,
      CASE WHEN p.status='succeeded' THEN 'debit' ELSE 'pending' END,
      'payout', p.amount, p.commission_amount,
      CASE WHEN l.id IS NULL THEN NULL
        ELSE l.balance_after - CASE
          WHEN l.entry_type='credit' THEN l.amount
          WHEN l.entry_type='debit' THEN -l.amount ELSE 0 END
      END,
      l.balance_after, COALESCE(p.utr, p.payment_id), p.description,
      CASE WHEN p.status='succeeded' THEN 'success'
        WHEN p.status='pending' THEN 'pending' ELSE 'failed' END
    FROM payout_transactions p
    JOIN merchant_details d ON d.merchant_id=p.merchant_id
    LEFT JOIN merchant_wallet_ledger l
      ON l.merchant_id=p.merchant_id AND l.reference=p.reference
    WHERE d.merchant_code=?
  )
  UNION ALL
  (
    SELECT CONCAT('DFR-', r.id), r.created_at,
      CONCAT('DFR', LPAD(r.id, 6, '0')),
      CASE WHEN r.status='approved' THEN 'credit' ELSE 'pending' END,
      'directFund', r.amount, r.commission_amount,
      CASE WHEN l.id IS NULL THEN NULL
        ELSE l.balance_after - CASE
          WHEN l.entry_type='credit' THEN l.amount
          WHEN l.entry_type='debit' THEN -l.amount ELSE 0 END
      END,
      l.balance_after, r.utr, r.description,
      CASE WHEN r.status='approved' THEN 'success'
        WHEN r.status='rejected' THEN 'failed' ELSE 'pending' END
    FROM direct_fund_requests r
    JOIN merchant_details d ON d.merchant_id=r.merchant_id
    LEFT JOIN merchant_wallet_ledger l
      ON l.merchant_id=r.merchant_id
      AND l.reference=CONCAT('DFR', LPAD(r.id, 6, '0'))
    WHERE d.merchant_code=?
  )
  UNION ALL
  (
    SELECT CONCAT('WAL-', l.id), l.created_at, l.reference,
      l.entry_type, 'wallet', l.amount, l.commission_amount,
      l.balance_after - CASE
        WHEN l.entry_type='credit' THEN l.amount
        WHEN l.entry_type='debit' THEN -l.amount ELSE 0 END,
      l.balance_after, l.reference, l.description, 'success'
    FROM merchant_wallet_ledger l
    JOIN merchant_details d ON d.merchant_id=l.merchant_id
    WHERE d.merchant_code=?
      AND NOT EXISTS (
        SELECT 1 FROM direct_fund_requests r
        WHERE r.merchant_id=l.merchant_id
          AND l.reference=CONCAT('DFR', LPAD(r.id, 6, '0'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.merchant_id=l.merchant_id AND p.reference=l.reference
      )
      AND NOT EXISTS (
        SELECT 1 FROM payout_transactions p
        WHERE p.merchant_id=l.merchant_id AND p.reference=l.reference
      )
  )`;
}

exports.getMerchantTransactions = async (merchantCode, filters) => {
  const conditions = [];
  const filterValues = [];
  if (filters.source) {
    conditions.push('t.source=?');
    filterValues.push(filters.source);
  }
  if (filters.type) {
    conditions.push('t.type=?');
    filterValues.push(filters.type);
  }
  if (filters.status) {
    conditions.push('t.status=?');
    filterValues.push(filters.status);
  }
  if (filters.search) {
    const escapedSearch = filters.search.replace(/[!%_]/g, '!$&');
    const searchValue = `%${escapedSearch}%`;
    conditions.push(`(
      t.transaction_id LIKE ? ESCAPE '!' OR t.reference_id LIKE ? ESCAPE '!'
      OR t.description LIKE ? ESCAPE '!'
    )`);
    filterValues.push(searchValue, searchValue, searchValue);
  }
  if (filters.from) {
    conditions.push('t.created_at>=?');
    filterValues.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    conditions.push('t.created_at<DATE_ADD(?, INTERVAL 1 DAY)');
    filterValues.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const unionQuery = merchantTransactionQuery();
  const merchantValues = [merchantCode, merchantCode, merchantCode, merchantCode];
  const [countResult, transactionResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM (${unionQuery}) t ${where}`,
      [...merchantValues, ...filterValues]
    ),
    db.query(
      `SELECT t.* FROM (${unionQuery}) t ${where}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
      [...merchantValues, ...filterValues, filters.limit, filters.offset]
    )
  ]);
  return {
    rows: transactionResult[0],
    total: Number(countResult[0][0].total)
  };
};

exports.getTransactions = async (filters) => {
  const { where, values } = transactionConditions(filters);
  const [countResult, transactionResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM merchant_wallet_ledger l
       JOIN merchants m ON m.id=l.merchant_id
       JOIN merchant_details d ON d.merchant_id=m.id
       ${where}`,
      values
    ),
    db.query(
      `SELECT l.id, l.entry_type, l.amount, l.commission_amount, l.balance_after,
        l.reference, l.description, l.created_at,
        d.merchant_code, m.name AS merchant_name, d.company_name
       FROM merchant_wallet_ledger l
       JOIN merchants m ON m.id=l.merchant_id
       JOIN merchant_details d ON d.merchant_id=m.id
       ${where}
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return {
    rows: transactionResult[0],
    total: Number(countResult[0][0].total)
  };
};
