const db = require('../../config/db');

function escaped(value) {
  return value.replace(/[!%_]/g, '!$&');
}

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  if (filters.merchantRecordId !== undefined) {
    conditions.push('x.merchant_id=?');
    values.push(filters.merchantRecordId);
  }
  if (filters.merchantId) {
    conditions.push('md.merchant_code=?');
    values.push(filters.merchantId);
  }
  if (filters.search) {
    const search = `%${escaped(filters.search)}%`;
    conditions.push(`(
      CONCAT('DSP', LPAD(x.id, 6, '0')) LIKE ? ESCAPE '!'
      OR x.transaction_id LIKE ? ESCAPE '!' OR x.order_id LIKE ? ESCAPE '!'
      OR md.merchant_code LIKE ? ESCAPE '!' OR m.name LIKE ? ESCAPE '!'
    )`);
    values.push(search, search, search, search, search);
  }
  if (filters.reason) {
    conditions.push('x.reason=?');
    values.push(filters.reason);
  }
  if (filters.status) {
    conditions.push('x.status=?');
    values.push(filters.status);
  }
  if (filters.from) {
    conditions.push('x.created_at>=?');
    values.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    conditions.push('x.created_at<DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(filters.to);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

const disputeSelect = `
  SELECT x.id, x.merchant_id, x.payment_record_id, md.merchant_code,
    md.company_name, m.name AS merchant_name, m.email AS merchant_email,
    md.mobile AS merchant_mobile, x.transaction_id, x.order_id, x.amount,
    x.currency, x.reason, x.description, x.status, x.review_note,
    x.reviewed_by, a.name AS reviewer_name, x.reviewed_at, x.created_at,
    x.updated_at, p.status AS transaction_status, p.provider_name
  FROM disputes x
  JOIN merchants m ON m.id=x.merchant_id
  JOIN merchant_details md ON md.merchant_id=x.merchant_id
  JOIN payments p ON p.id=x.payment_record_id
  LEFT JOIN admins a ON a.id=x.reviewed_by
`;

exports.create = async (merchantId, dispute) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.query(
      `SELECT id, reference, order_id, currency
       FROM payments
       WHERE merchant_id=? AND reference=?
       FOR UPDATE`,
      [merchantId, dispute.transactionId]
    );
    if (!payments.length) {
      await connection.rollback();
      return { notFound: true };
    }

    const payment = payments[0];
    const transactionOrderId = payment.order_id || payment.reference;
    if (transactionOrderId !== dispute.orderId) {
      await connection.rollback();
      return { notFound: true };
    }

    const [result] = await connection.query(
      `INSERT INTO disputes (
        merchant_id, payment_record_id, transaction_id, order_id, amount,
        currency, reason, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merchantId, payment.id, payment.reference, transactionOrderId,
        dispute.amount, payment.currency || 'INR', dispute.reason, dispute.description
      ]
    );
    await connection.commit();
    return { id: result.insertId };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back dispute creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.list = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [countResult, disputesResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM disputes x
       JOIN merchants m ON m.id=x.merchant_id
       JOIN merchant_details md ON md.merchant_id=x.merchant_id
       ${where}`,
      values
    ),
    db.query(
      `${disputeSelect}
       ${where}
       ORDER BY x.created_at DESC, x.id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return { rows: disputesResult[0], total: Number(countResult[0][0].total) };
};

exports.getStats = async (filters) => {
  const statsFilters = { ...filters, search: undefined, reason: undefined, status: undefined };
  const { where, values } = buildWhere(statsFilters);
  const [rows] = await db.query(
    `SELECT x.status, COUNT(*) AS total
     FROM disputes x
     JOIN merchants m ON m.id=x.merchant_id
     JOIN merchant_details md ON md.merchant_id=x.merchant_id
     ${where}
     GROUP BY x.status`,
    values
  );
  return rows;
};

exports.getById = async (id, merchantId) => {
  const merchantFilter = merchantId === undefined ? '' : ' AND x.merchant_id=?';
  const values = merchantId === undefined ? [id] : [id, merchantId];
  const [rows] = await db.query(
    `${disputeSelect}
     WHERE x.id=?${merchantFilter}`,
    values
  );
  return rows[0];
};

exports.updateStatus = async (id, status, reviewNote, adminId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [disputes] = await connection.query(
      'SELECT status FROM disputes WHERE id=? FOR UPDATE',
      [id]
    );
    if (!disputes.length) {
      await connection.rollback();
      return { notFound: true };
    }

    const currentStatus = disputes[0].status;
    if (currentStatus === status) {
      await connection.commit();
      return { notFound: false };
    }
    const allowed = currentStatus === 'open'
      ? ['under_review', 'won', 'lost']
      : currentStatus === 'under_review'
        ? ['won', 'lost']
        : [];
    if (!allowed.includes(status)) {
      const error = new Error('A completed dispute cannot be changed');
      error.status = 409;
      throw error;
    }

    await connection.query(
      `UPDATE disputes
       SET status=?, review_note=COALESCE(?, review_note), reviewed_by=?,
         reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [status, reviewNote, adminId, id]
    );
    await connection.commit();
    return { notFound: false };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back dispute status update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};
