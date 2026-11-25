const db = require('../../config/db');

function decimalToCents(value) {
  const text = String(value);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

function centsToDecimal(cents) {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

exports.create = async (data) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [merchant] = await connection.query(
      'INSERT INTO merchants (name, email, password, status) VALUES (?, ?, ?, ?)',
      [data.name, data.email, data.passwordHash, data.status]
    );
    await connection.query(
      `INSERT INTO merchant_details (
        merchant_id, mobile, company_name, bank_name, ifsc,
        account_number_encrypted, aadhaar_encrypted, pan_encrypted, gstin,
        merchant_code, merchant_token_hash, merchant_token_last4,
        payin_enabled, payout_enabled, payin_commission, payout_commission,
        direct_fund_commission_enabled, direct_fund_commission_percent,
        payin_daily_limit, payin_min_amount, payin_max_amount,
        payout_daily_limit, payout_min_amount, payout_max_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merchant.insertId, data.mobile, data.companyName, data.bankName, data.ifsc,
        data.accountNumberEncrypted, data.aadhaarEncrypted, data.panEncrypted,
        data.gstin, data.merchantCode, data.merchantTokenHash, data.merchantTokenLast4,
        data.payinEnabled, data.payoutEnabled, data.payinCommission, data.payoutCommission,
        data.directFundCommissionEnabled, data.directFundCommissionPercent,
        data.payinDailyLimit, data.payinMinAmount, data.payinMaxAmount,
        data.payoutDailyLimit, data.payoutMinAmount, data.payoutMaxAmount
      ]
    );
    const [[dates]] = await connection.query(
      `SELECT m.created_at, m.updated_at, d.created_at AS details_created_at,
        d.updated_at AS details_updated_at
       FROM merchants m
       JOIN merchant_details d ON d.merchant_id=m.id
       WHERE m.id=?`,
      [merchant.insertId]
    );
    await connection.commit();
    return { id: merchant.insertId, ...dates };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back merchant creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.getAll = async ({ search, status, payinEnabled, payoutEnabled, limit, offset }) => {
  const conditions = [];
  const values = [];
  if (search) {
    const escapedSearch = search.replace(/[!%_]/g, '!$&');
    conditions.push(`(
      m.name LIKE ? ESCAPE '!' OR m.email LIKE ? ESCAPE '!'
      OR d.mobile LIKE ? ESCAPE '!' OR d.company_name LIKE ? ESCAPE '!'
      OR d.merchant_code LIKE ? ESCAPE '!'
    )`);
    const searchValue = `%${escapedSearch}%`;
    values.push(searchValue, searchValue, searchValue, searchValue, searchValue);
  }
  if (status !== undefined) {
    conditions.push('m.status=?');
    values.push(status);
  }
  if (payinEnabled !== undefined) {
    conditions.push('d.payin_enabled=?');
    values.push(payinEnabled);
  }
  if (payoutEnabled !== undefined) {
    conditions.push('d.payout_enabled=?');
    values.push(payoutEnabled);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countResult, merchantResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM merchants m
       LEFT JOIN merchant_details d ON d.merchant_id=m.id
       ${where}`,
      values
    ),
    db.query(
      `SELECT m.id, d.merchant_code, m.name, m.email, d.mobile, d.company_name,
        m.status, d.payin_enabled, d.payout_enabled, d.payin_commission,
        d.payout_commission, d.payin_daily_limit, d.payin_min_amount,
        d.payin_max_amount, d.payout_daily_limit, d.payout_min_amount,
        d.payout_max_amount, d.direct_fund_commission_enabled,
        d.direct_fund_commission_percent,
        m.created_at, m.updated_at, d.created_at AS details_created_at,
        d.updated_at AS details_updated_at, d.merchant_token_last4,
        COALESCE(w.wallet_balance, 0) AS wallet_balance,
        COALESCE(w.total_commission, 0) AS total_commission,
        COALESCE(w.total_credit, 0) AS total_credit,
        COALESCE(w.total_debit, 0) AS total_debit,
        COALESCE(w.opening_balance, 0) AS opening_balance
       FROM merchants m
       LEFT JOIN merchant_details d ON d.merchant_id=m.id
       LEFT JOIN (
         SELECT merchant_id,
           SUM(CASE WHEN entry_type='credit' THEN amount
             WHEN entry_type='debit' THEN -amount ELSE 0 END) AS wallet_balance,
           SUM(commission_amount) AS total_commission,
           SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END) AS total_credit,
           SUM(CASE WHEN entry_type='debit' THEN amount ELSE 0 END) AS total_debit,
           (SELECT first_entry.balance_after - CASE
             WHEN first_entry.entry_type='credit' THEN first_entry.amount
             WHEN first_entry.entry_type='debit' THEN -first_entry.amount
             ELSE 0 END
            FROM merchant_wallet_ledger first_entry
            WHERE first_entry.merchant_id=ledger.merchant_id
            ORDER BY first_entry.id ASC LIMIT 1) AS opening_balance
         FROM merchant_wallet_ledger ledger
         GROUP BY ledger.merchant_id
       ) w ON w.merchant_id=m.id
       ${where}
       ORDER BY m.id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    )
  ]);
  return { rows: merchantResult[0], total: Number(countResult[0][0].total) };
};

exports.getByCode = async (merchantCode) => {
  const [rows] = await db.query(
    `SELECT m.id, d.merchant_code, m.name, m.email, d.mobile, d.company_name,
      m.status, d.bank_name, d.ifsc, d.account_number_encrypted,
      d.aadhaar_encrypted, d.pan_encrypted, d.gstin, d.payin_enabled,
      d.payout_enabled, d.payin_commission, d.payout_commission,
      d.payin_daily_limit, d.payin_min_amount, d.payin_max_amount,
      d.payout_daily_limit, d.payout_min_amount, d.payout_max_amount,
      d.direct_fund_commission_enabled, d.direct_fund_commission_percent,
      m.created_at, m.updated_at,
      d.created_at AS details_created_at, d.updated_at AS details_updated_at,
      d.merchant_token_last4,
      (SELECT COALESCE(SUM(CASE WHEN l.entry_type='credit' THEN l.amount
        WHEN l.entry_type='debit' THEN -l.amount ELSE 0 END), 0)
       FROM merchant_wallet_ledger l WHERE l.merchant_id=m.id) AS wallet_balance,
      (SELECT COALESCE(SUM(l.commission_amount), 0)
       FROM merchant_wallet_ledger l WHERE l.merchant_id=m.id) AS total_commission
     FROM merchants m
     JOIN merchant_details d ON d.merchant_id=m.id
     WHERE d.merchant_code=?`,
    [merchantCode]
  );
  return rows[0];
};

exports.getProfileById = async (merchantId) => {
  const [rows] = await db.query(
    `SELECT m.id, d.merchant_code, m.name, m.email, d.mobile, d.company_name,
      m.status, d.bank_name, d.ifsc, d.account_number_encrypted,
      d.aadhaar_encrypted, d.pan_encrypted, d.gstin, d.payin_enabled,
      d.payout_enabled, d.payin_commission, d.payout_commission,
      d.payin_daily_limit, d.payin_min_amount, d.payin_max_amount,
      d.payout_daily_limit, d.payout_min_amount, d.payout_max_amount,
      d.direct_fund_commission_enabled, d.direct_fund_commission_percent,
      m.created_at, m.updated_at,
      d.created_at AS details_created_at, d.updated_at AS details_updated_at,
      d.merchant_token_last4,
      (SELECT COALESCE(SUM(CASE WHEN l.entry_type='credit' THEN l.amount
        WHEN l.entry_type='debit' THEN -l.amount ELSE 0 END), 0)
       FROM merchant_wallet_ledger l WHERE l.merchant_id=m.id) AS wallet_balance,
      (SELECT COALESCE(SUM(l.commission_amount), 0)
       FROM merchant_wallet_ledger l WHERE l.merchant_id=m.id) AS total_commission
     FROM merchants m
     LEFT JOIN merchant_details d ON d.merchant_id=m.id
     WHERE m.id=?`,
    [merchantId]
  );
  return rows[0];
};

exports.updateByCode = async (merchantCode, merchantUpdates, detailUpdates) => {
  const merchantColumns = { name: 'name', email: 'email', status: 'status' };
  const detailColumns = {
    mobile: 'mobile',
    companyName: 'company_name',
    bankName: 'bank_name',
    ifsc: 'ifsc',
    accountNumberEncrypted: 'account_number_encrypted',
    aadhaarEncrypted: 'aadhaar_encrypted',
    panEncrypted: 'pan_encrypted',
    gstin: 'gstin',
    payinEnabled: 'payin_enabled',
    payoutEnabled: 'payout_enabled',
    payinCommission: 'payin_commission',
    payoutCommission: 'payout_commission',
    payinDailyLimit: 'payin_daily_limit',
    payinMinAmount: 'payin_min_amount',
    payinMaxAmount: 'payin_max_amount',
    payoutDailyLimit: 'payout_daily_limit',
    payoutMinAmount: 'payout_min_amount',
    payoutMaxAmount: 'payout_max_amount',
    directFundCommissionEnabled: 'direct_fund_commission_enabled',
    directFundCommissionPercent: 'direct_fund_commission_percent'
  };
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT merchant_id FROM merchant_details WHERE merchant_code=? FOR UPDATE',
      [merchantCode]
    );
    if (!rows.length) {
      await connection.rollback();
      return false;
    }

    const id = rows[0].merchant_id;
    const merchantFields = Object.keys(merchantUpdates);
    if (merchantFields.length) {
      await connection.query(
        `UPDATE merchants SET ${merchantFields.map(field => `${merchantColumns[field]}=?`).join(', ')},
          updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [...merchantFields.map(field => merchantUpdates[field]), id]
      );
    }

    const detailFields = Object.keys(detailUpdates);
    if (detailFields.length) {
      await connection.query(
        `UPDATE merchant_details SET ${detailFields.map(field => `${detailColumns[field]}=?`).join(', ')},
          updated_at=CURRENT_TIMESTAMP WHERE merchant_id=?`,
        [...detailFields.map(field => detailUpdates[field]), id]
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back merchant update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.updateProfileById = async (merchantId, merchantUpdates, detailUpdates) => {
  const merchantColumns = { name: 'name', email: 'email' };
  const detailColumns = { mobile: 'mobile', companyName: 'company_name' };
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id FROM merchants WHERE id=? FOR UPDATE',
      [merchantId]
    );
    if (!rows.length) {
      await connection.rollback();
      return false;
    }

    const merchantFields = Object.keys(merchantUpdates);
    if (merchantFields.length) {
      await connection.query(
        `UPDATE merchants SET ${merchantFields.map(field => `${merchantColumns[field]}=?`).join(', ')},
          updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [...merchantFields.map(field => merchantUpdates[field]), merchantId]
      );
    }

    const detailFields = Object.keys(detailUpdates);
    if (detailFields.length) {
      const columns = detailFields.map(field => detailColumns[field]);
      await connection.query(
        `INSERT INTO merchant_details (merchant_id, ${columns.join(', ')})
         VALUES (?, ${columns.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${columns.map(column => `${column}=VALUES(${column})`).join(', ')}`,
        [merchantId, ...detailFields.map(field => detailUpdates[field])]
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back merchant profile update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.resetToken = async (merchantCode, tokenHash, tokenLast4) => {
  const [result] = await db.query(
    `UPDATE merchant_details d
     JOIN merchants m ON m.id=d.merchant_id
     SET d.merchant_token_hash=?, d.merchant_token_last4=?,
       d.updated_at=CURRENT_TIMESTAMP, m.updated_at=CURRENT_TIMESTAMP
     WHERE d.merchant_code=?`,
    [tokenHash, tokenLast4, merchantCode]
  );
  return result.affectedRows > 0;
};

exports.findByCodeAndTokenHash = async (merchantCode, tokenHash) => {
  const [rows] = await db.query(
    `SELECT m.id, m.status, d.payin_enabled, d.payout_enabled
     FROM merchants m
     JOIN merchant_details d ON d.merchant_id=m.id
     WHERE d.merchant_code=? AND d.merchant_token_hash=?`,
    [merchantCode, tokenHash]
  );
  return rows[0];
};

exports.getLedger = async (merchantCode) => {
  const [rows] = await db.query(
    `SELECT l.id, l.entry_type, l.amount, l.commission_amount,
      l.balance_after, l.reference, l.description, l.created_at
     FROM merchant_wallet_ledger l
     JOIN merchant_details d ON d.merchant_id=l.merchant_id
     WHERE d.merchant_code=?
     ORDER BY l.id DESC
     LIMIT 100`,
    [merchantCode]
  );
  return rows;
};

exports.createLedgerEntry = async (merchantCode, entry) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [merchants] = await connection.query(
      `SELECT m.id
       FROM merchants m
       JOIN merchant_details d ON d.merchant_id=m.id
       WHERE d.merchant_code=?
       FOR UPDATE`,
      [merchantCode]
    );
    if (!merchants.length) {
      await connection.rollback();
      return null;
    }

    const merchantId = merchants[0].id;
    const [[totals]] = await connection.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount
        WHEN entry_type='debit' THEN -amount ELSE 0 END), 0) AS balance
       FROM merchant_wallet_ledger
       WHERE merchant_id=?`,
      [merchantId]
    );
    const balanceCents = decimalToCents(totals.balance);
    const amountCents = BigInt(Math.round(entry.amount * 100));
    if (entry.type === 'debit' && amountCents > balanceCents) {
      const error = new Error('Insufficient merchant wallet balance');
      error.status = 409;
      throw error;
    }

    const balanceAfterCents = balanceCents +
      (entry.type === 'credit' ? amountCents : entry.type === 'debit' ? -amountCents : 0);
    if (balanceAfterCents > 999999999999n) {
      const error = new Error('Merchant wallet balance limit exceeded');
      error.status = 409;
      throw error;
    }
    const balanceAfter = centsToDecimal(balanceAfterCents);
    const [result] = await connection.query(
      `INSERT INTO merchant_wallet_ledger (
        merchant_id, entry_type, amount, commission_amount, balance_after,
        reference, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        merchantId, entry.type, entry.amount, entry.commissionAmount,
        balanceAfter, entry.reference, entry.description
      ]
    );
    const [[created]] = await connection.query(
      `SELECT id, entry_type, amount, commission_amount, balance_after,
        reference, description, created_at
       FROM merchant_wallet_ledger WHERE id=?`,
      [result.insertId]
    );
    await connection.commit();
    return created;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back wallet ledger entry:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.findForAuthentication = async (id) => {
  const [rows] = await db.query(
    `SELECT m.id, m.name, m.email, m.status, d.merchant_code, d.mobile, d.company_name,
      d.payin_enabled, d.payout_enabled
     FROM merchants m
     LEFT JOIN merchant_details d ON d.merchant_id=m.id
     WHERE m.id=?`,
    [id]
  );
  return rows[0];
};
