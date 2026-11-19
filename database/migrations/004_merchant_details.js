module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE merchants
      ADD COLUMN mobile VARCHAR(20) NULL,
      ADD COLUMN company_name VARCHAR(150) NULL,
      ADD COLUMN bank_name VARCHAR(120) NULL,
      ADD COLUMN ifsc VARCHAR(11) NULL,
      ADD COLUMN account_number_encrypted TEXT NULL,
      ADD COLUMN aadhaar_encrypted TEXT NULL,
      ADD COLUMN pan_encrypted TEXT NULL,
      ADD COLUMN gstin VARCHAR(15) NULL,
      ADD COLUMN merchant_code VARCHAR(40) NULL,
      ADD UNIQUE KEY uq_merchants_merchant_code (merchant_code),
      ADD COLUMN merchant_token_hash CHAR(64) NULL,
      ADD COLUMN payin_enabled TINYINT(1) NOT NULL DEFAULT 1,
      ADD COLUMN payout_enabled TINYINT(1) NOT NULL DEFAULT 1,
      ADD COLUMN payin_commission DECIMAL(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN payout_commission DECIMAL(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN direct_fund_commission_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  }
};
