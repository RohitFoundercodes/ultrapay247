module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE disputes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      payment_record_id BIGINT NOT NULL,
      transaction_id VARCHAR(100) NOT NULL,
      order_id VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      reason VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      status ENUM('open', 'under_review', 'won', 'lost') NOT NULL DEFAULT 'open',
      review_note VARCHAR(1000) NULL,
      reviewed_by BIGINT NULL,
      reviewed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_disputes_merchant_payment UNIQUE (merchant_id, payment_record_id),
      CONSTRAINT fk_disputes_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_disputes_payment FOREIGN KEY (payment_record_id) REFERENCES payments(id),
      CONSTRAINT fk_disputes_reviewer FOREIGN KEY (reviewed_by) REFERENCES admins(id),
      INDEX idx_disputes_merchant_created (merchant_id, created_at),
      INDEX idx_disputes_status_created (status, created_at),
      INDEX idx_disputes_reason (reason),
      INDEX idx_disputes_transaction (transaction_id)
    )`);
  }
};
