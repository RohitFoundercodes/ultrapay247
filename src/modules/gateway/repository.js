const db = require('../../config/db');

const columns = {
  providerName: 'provider_name',
  code: 'gateway_code',
  direction: 'direction',
  paymentMethods: 'payment_methods',
  chargePercent: 'charge_percent',
  credentialsEncrypted: 'credentials_encrypted',
  status: 'status'
};

function listConditions(filters) {
  const conditions = [];
  const values = [];
  if (filters.direction) {
    if (filters.direction === 'payin' || filters.direction === 'payout') {
      conditions.push('direction IN (?, ?)');
      values.push(filters.direction, 'both');
    } else {
      conditions.push('direction=?');
      values.push(filters.direction);
    }
  }
  if (filters.status) {
    conditions.push('status=?');
    values.push(filters.status);
  }
  if (filters.search) {
    const search = filters.search.replace(/[!%_]/g, '!$&');
    conditions.push("(provider_name LIKE ? ESCAPE '!' OR gateway_code LIKE ? ESCAPE '!')");
    values.push(`%${search}%`, `%${search}%`);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

exports.list = async (filters) => {
  const { where, values } = listConditions(filters);
  const [countResult, accountsResult, summaryResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM payment_gateway_accounts
       ${where}`,
      values
    ),
    db.query(
      `SELECT id, provider_name, gateway_code, direction, payment_methods,
        charge_percent, status, credentials_encrypted, created_at, updated_at
       FROM payment_gateway_accounts
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    ),
    db.query(
      `SELECT COUNT(*) AS total_accounts,
        SUM(CASE WHEN status='enabled' THEN 1 ELSE 0 END) AS active_accounts,
        SUM(CASE WHEN direction IN ('payin', 'both') THEN 1 ELSE 0 END) AS total_payin,
        SUM(CASE WHEN direction IN ('payin', 'both') AND status='enabled' THEN 1 ELSE 0 END) AS active_payin,
        SUM(CASE WHEN direction IN ('payout', 'both') THEN 1 ELSE 0 END) AS total_payout,
        SUM(CASE WHEN direction IN ('payout', 'both') AND status='enabled' THEN 1 ELSE 0 END) AS active_payout
       FROM payment_gateway_accounts`
    )
  ]);
  return {
    rows: accountsResult[0],
    total: Number(countResult[0][0].total),
    summary: summaryResult[0][0]
  };
};

exports.getById = async (id) => {
  const [rows] = await db.query(
    `SELECT id, provider_name, gateway_code, direction, payment_methods,
      charge_percent, credentials_encrypted, status, created_at, updated_at
     FROM payment_gateway_accounts
     WHERE id=?`,
    [id]
  );
  return rows[0];
};

exports.create = async (account) => {
  const [result] = await db.query(
    `INSERT INTO payment_gateway_accounts (
      provider_name, gateway_code, direction, payment_methods,
      charge_percent, credentials_encrypted, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      account.providerName,
      account.code,
      account.direction,
      JSON.stringify(account.paymentMethods),
      account.chargePercent,
      account.credentialsEncrypted,
      account.status
    ]
  );
  return result.insertId;
};

exports.update = async (id, updates) => {
  const fields = Object.keys(updates);
  const assignments = fields.map(field => `${columns[field]}=?`);
  const values = fields.map((field) => (
    field === 'paymentMethods' ? JSON.stringify(updates[field]) : updates[field]
  ));
  const [result] = await db.query(
    `UPDATE payment_gateway_accounts
     SET ${assignments.join(', ')}, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [...values, id]
  );
  if (result.affectedRows) return true;
  const existing = await exports.getById(id);
  return Boolean(existing);
};

exports.updateStatus = async (id, status) => {
  const [result] = await db.query(
    `UPDATE payment_gateway_accounts
     SET status=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [status, id]
  );
  if (result.affectedRows) return true;
  const existing = await exports.getById(id);
  return Boolean(existing);
};
