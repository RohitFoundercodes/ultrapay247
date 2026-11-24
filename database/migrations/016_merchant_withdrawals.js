module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE merchant_withdrawal_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      bank_name VARCHAR(120) NOT NULL,
      account_number_encrypted TEXT NOT NULL,
      account_number_last4 CHAR(4) NOT NULL,
      ifsc VARCHAR(11) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      review_note VARCHAR(255) NULL,
      reviewed_by BIGINT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_withdrawal_request_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_withdrawal_request_admin
        FOREIGN KEY (reviewed_by) REFERENCES admins(id),
      INDEX idx_withdrawal_request_merchant_created (merchant_id, created_at),
      INDEX idx_withdrawal_request_status_created (status, created_at)
    )`);
  }
};
