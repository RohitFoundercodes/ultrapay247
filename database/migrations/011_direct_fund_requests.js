module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE merchant_details
      ADD COLUMN direct_fund_commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0
      AFTER direct_fund_commission_enabled`);

    await db.query(`CREATE TABLE direct_fund_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      description VARCHAR(255) NOT NULL,
      utr VARCHAR(100) NULL,
      receipt_url VARCHAR(2048) NULL,
      status ENUM('pending', 'in_process', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      review_note VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_direct_fund_request_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      INDEX idx_direct_fund_merchant_created (merchant_id, created_at),
      INDEX idx_direct_fund_status_created (status, created_at)
    )`);
  }
};
