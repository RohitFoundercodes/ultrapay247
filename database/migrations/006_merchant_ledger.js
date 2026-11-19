module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE merchant_details
      ADD COLUMN merchant_token_last4 CHAR(4) NULL`);

    await db.query(`CREATE TABLE merchant_wallet_ledger (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      entry_type ENUM('credit', 'debit', 'commission') NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance_after DECIMAL(12,2) NOT NULL,
      reference VARCHAR(100) NOT NULL,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_wallet_merchant_reference UNIQUE (merchant_id, reference),
      CONSTRAINT fk_wallet_ledger_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    )`);
  }
};
