module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE merchant_details
      ADD COLUMN payin_daily_limit DECIMAL(12,2) NULL,
      ADD COLUMN payin_min_amount DECIMAL(12,2) NULL,
      ADD COLUMN payin_max_amount DECIMAL(12,2) NULL,
      ADD COLUMN payout_daily_limit DECIMAL(12,2) NULL,
      ADD COLUMN payout_min_amount DECIMAL(12,2) NULL,
      ADD COLUMN payout_max_amount DECIMAL(12,2) NULL`);
  }
};
