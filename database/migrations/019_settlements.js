module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE merchant_settlements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      settlement_date DATE NULL,
      payin_amount DECIMAL(12,2) NOT NULL,
      charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      settled_amount DECIMAL(12,2) NOT NULL,
      mode VARCHAR(20) NULL,
      utr VARCHAR(100) NULL,
      status ENUM('pending', 'processing', 'settled', 'failed') NOT NULL DEFAULT 'pending',
      created_by BIGINT NULL,
      updated_by BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_merchant_settlements_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      INDEX idx_merchant_settlements_status_date (status, settlement_date),
      INDEX idx_merchant_settlements_merchant_date (merchant_id, settlement_date),
      INDEX idx_merchant_settlements_utr (utr)
    )`);
  }
};
