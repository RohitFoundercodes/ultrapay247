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
