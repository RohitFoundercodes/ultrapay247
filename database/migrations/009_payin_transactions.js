module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE payments
      ADD COLUMN order_id VARCHAR(100) NULL AFTER reference,
      ADD COLUMN gateway_account_id BIGINT NULL AFTER order_id,
      ADD COLUMN provider_name VARCHAR(100) NULL AFTER gateway_account_id,
      ADD COLUMN commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER amount,
      ADD COLUMN net_amount DECIMAL(12,2) NULL AFTER commission_amount,
      ADD COLUMN payment_id VARCHAR(100) NULL AFTER net_amount,
      ADD COLUMN settlement_status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER status,
      ADD COLUMN utr VARCHAR(100) NULL AFTER settlement_status,
      ADD INDEX idx_payments_created_at (created_at),
      ADD INDEX idx_payments_status (status),
      ADD INDEX idx_payments_settlement_status (settlement_status)`);

    await db.query(`UPDATE payments
      SET net_amount=amount-commission_amount
      WHERE net_amount IS NULL`);
  }
};
