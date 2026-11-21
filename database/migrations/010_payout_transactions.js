module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE payout_transactions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      reference VARCHAR(100) NOT NULL,
      order_id VARCHAR(100) NULL,
      gateway_account_id BIGINT NULL,
      provider_name VARCHAR(100) NULL,
      beneficiary_name VARCHAR(150) NOT NULL,
      beneficiary_account_encrypted TEXT NOT NULL,
      beneficiary_account_last4 CHAR(4) NOT NULL,
      beneficiary_ifsc VARCHAR(11) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_amount DECIMAL(12,2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      payment_id VARCHAR(100) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      settlement_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      utr VARCHAR(100) NULL,
      customer_email VARCHAR(150) NULL,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_payout_merchant_reference UNIQUE (merchant_id, reference),
      CONSTRAINT fk_payout_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_payout_gateway FOREIGN KEY (gateway_account_id) REFERENCES payment_gateway_accounts(id),
      INDEX idx_payout_created_at (created_at),
      INDEX idx_payout_status (status),
      INDEX idx_payout_settlement_status (settlement_status)
    )`);
  }
};
