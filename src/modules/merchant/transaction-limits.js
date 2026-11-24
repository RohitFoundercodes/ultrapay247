const db = require('../../config/db');

const limitColumns = {
  payin: {
    daily: 'payin_daily_limit',
    minimum: 'payin_min_amount',
    maximum: 'payin_max_amount',
    table: 'payments',
    countedStatuses: "'pending', 'succeeded', 'refunded'"
  },
  payout: {
    daily: 'payout_daily_limit',
    minimum: 'payout_min_amount',
    maximum: 'payout_max_amount',
    table: 'payout_transactions',
    countedStatuses: "'pending', 'succeeded'"
  }
};

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

exports.validate = async ({
  queryable = db, merchantId, direction, amount, currency, lock = false
}) => {
  const columns = limitColumns[direction];
  if (!columns) throw new Error(`Unsupported transaction limit direction: ${direction}`);

  const [merchants] = await queryable.query(
    `SELECT ${columns.daily}, ${columns.minimum}, ${columns.maximum},
      payin_enabled, payout_enabled, payin_commission, payout_commission
     FROM merchant_details
     WHERE merchant_id=?${lock ? ' FOR UPDATE' : ''}`,
    [merchantId]
  );
  if (!merchants.length) {
    const error = new Error('Merchant not found');
    error.status = 404;
    throw error;
  }

  const merchant = merchants[0];
  if (direction === 'payin' && !merchant.payin_enabled) {
    const error = new Error('Payin is disabled for this merchant');
    error.status = 403;
    throw error;
  }
  if (direction === 'payout' && !merchant.payout_enabled) {
    const error = new Error('Payout is disabled for this merchant');
    error.status = 403;
    throw error;
  }

  const amountCents = cents(amount);
  if (merchant[columns.minimum] !== null &&
      amountCents < cents(merchant[columns.minimum])) {
    invalid(`${direction} amount is below the merchant minimum`);
  }
  if (merchant[columns.maximum] !== null &&
      amountCents > cents(merchant[columns.maximum])) {
    invalid(`${direction} amount exceeds the merchant maximum`);
  }

  if (merchant[columns.daily] !== null) {
    const [totals] = await queryable.query(
      `SELECT COALESCE(SUM(amount), 0) AS daily_total
       FROM ${columns.table}
       WHERE merchant_id=? AND currency=?
         AND created_at>=CURDATE()
         AND created_at<DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         AND status IN (${columns.countedStatuses})`,
      [merchantId, currency]
    );
    if (cents(totals[0].daily_total) + amountCents > cents(merchant[columns.daily])) {
      invalid(`${direction} daily limit exceeded for ${currency}`);
    }
  }

  return merchant;
};
