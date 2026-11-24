const db = require('../../config/db');

function rangeCondition(column, from, to) {
  const conditions = [];
  const values = [];
  if (from) {
    conditions.push(`${column}>=?`);
    values.push(`${from} 00:00:00`);
  }
  if (to) {
    const nextDay = new Date(`${to}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    conditions.push(`${column}<?`);
    values.push(`${nextDay.toISOString().slice(0, 10)} 00:00:00`);
  }
  return {
    sql: conditions.length ? conditions.join(' AND ') : '1=1',
    values
  };
}

exports.getDashboard = async (merchantId, filters) => {
  const payinRange = rangeCondition('created_at', filters.from, filters.to);
  const payoutRange = rangeCondition('created_at', filters.from, filters.to);
  const [walletRows, payinRows, payoutRows] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(CASE
        WHEN entry_type='credit' THEN amount
        WHEN entry_type='debit' THEN -amount
        ELSE 0
      END), 0) AS wallet_balance
       FROM merchant_wallet_ledger
       WHERE merchant_id=?`,
      [merchantId]
    ),
    db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN ${payinRange.sql} THEN amount ELSE 0 END), 0) AS total_payin,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() THEN amount ELSE 0 END), 0) AS today_payin,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE()
          AND status='succeeded' AND settlement_status='pending'
          THEN amount ELSE 0 END), 0) AS today_pending_settlement
       FROM payments
       WHERE merchant_id=? AND currency='INR'`,
      [...payinRange.values, merchantId]
    ),
    db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN payout_type='IMPS' AND ${payoutRange.sql}
          THEN amount ELSE 0 END), 0) AS total_imps_payout,
        COALESCE(SUM(CASE WHEN payout_type='UPI' AND ${payoutRange.sql}
          THEN amount ELSE 0 END), 0) AS total_upi_payout,
        COALESCE(SUM(CASE WHEN payout_type='SELF' AND ${payoutRange.sql}
          THEN amount ELSE 0 END), 0) AS total_self_payout,
        COALESCE(SUM(CASE WHEN payout_type IS NULL AND ${payoutRange.sql}
          THEN amount ELSE 0 END), 0) AS total_uncategorized_payout,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() AND payout_type='IMPS'
          THEN amount ELSE 0 END), 0) AS today_imps_payout,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() AND payout_type='UPI'
          THEN amount ELSE 0 END), 0) AS today_upi_payout,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() AND payout_type='SELF'
          THEN amount ELSE 0 END), 0) AS today_self_payout,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() AND payout_type IS NULL
          THEN amount ELSE 0 END), 0) AS today_uncategorized_payout,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE()
          AND status='succeeded' AND settlement_status='pending'
          THEN amount ELSE 0 END), 0) AS today_pending_settlement
       FROM payout_transactions
       WHERE merchant_id=? AND currency='INR'`,
      [
        ...payoutRange.values,
        ...payoutRange.values,
        ...payoutRange.values,
        ...payoutRange.values,
        merchantId
      ]
    )
  ]);
  const payin = payinRows[0][0];
  const payout = payoutRows[0][0];
  return {
    walletBalance: walletRows[0][0].wallet_balance,
    totalPayin: payin.total_payin,
    todayPayin: payin.today_payin,
    todayPendingSettlement:
      Number(payin.today_pending_settlement) + Number(payout.today_pending_settlement),
    totalImpsPayout: payout.total_imps_payout,
    todayImpsPayout: payout.today_imps_payout,
    totalUpiPayout: payout.total_upi_payout,
    todayUpiPayout: payout.today_upi_payout,
    totalSelfPayout: payout.total_self_payout,
    todaySelfPayout: payout.today_self_payout,
    totalUncategorizedPayout: payout.total_uncategorized_payout,
    todayUncategorizedPayout: payout.today_uncategorized_payout
  };
};
