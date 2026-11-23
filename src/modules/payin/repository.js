const db = require('../../config/db');

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
    const search = escaped(filters.search);
    conditions.push(`(
      p.reference LIKE ? ESCAPE '!' OR p.order_id LIKE ? ESCAPE '!'
      OR p.payment_id LIKE ? ESCAPE '!' OR d.merchant_code LIKE ? ESCAPE '!'
      OR d.company_name LIKE ? ESCAPE '!' OR p.provider_name LIKE ? ESCAPE '!'
    )`);
    const searchValue = `%${search}%`;
    values.push(searchValue, searchValue, searchValue, searchValue, searchValue, searchValue);
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
    conditions.push('p.created_at<?');
    const date = new Date(`${filters.to}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    values.push(date.toISOString().slice(0, 10) + ' 00:00:00');
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

const selectColumns = `
  p.id, p.created_at, p.reference, p.order_id, p.gateway_account_id,
  d.merchant_code AS merchant_id, d.company_name, p.provider_name,
  p.amount, p.commission_amount, p.net_amount, p.payment_id,
  p.status, p.settlement_status, p.utr, p.updated_at
`;

exports.list = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [countRows, rows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM payments p
       LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
       ${where}`,
      values
    ),
    db.query(
      `SELECT ${selectColumns}
       FROM payments p
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
     FROM payments p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     WHERE p.id=?`,
    [id]
  );
  return rows[0];
};

exports.stats = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [rows] = await db.query(
    `SELECT
      COALESCE(SUM(p.amount), 0) AS total_payin,
      COALESCE(SUM(CASE WHEN p.status='succeeded' THEN p.amount ELSE 0 END), 0) AS successful_payin,
      COALESCE(SUM(CASE WHEN p.status='pending' THEN p.amount ELSE 0 END), 0) AS pending_payin,
      COALESCE(SUM(CASE WHEN p.status='failed' THEN p.amount ELSE 0 END), 0) AS failed_payin,
      COALESCE(SUM(p.commission_amount), 0) AS total_commission,
      COALESCE(SUM(CASE WHEN DATE(p.created_at)=CURDATE() THEN p.amount ELSE 0 END), 0) AS today_payin
     FROM payments p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     ${where}`,
    values
  );
  return rows[0];
};

exports.exportRows = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [rows] = await db.query(
    `SELECT ${selectColumns}
     FROM payments p
     LEFT JOIN merchant_details d ON d.merchant_id=p.merchant_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT 10000`,
    values
  );
  return rows;
};
