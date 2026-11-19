module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE merchant_details (
      merchant_id BIGINT NOT NULL PRIMARY KEY,
      mobile VARCHAR(20) NULL,
      company_name VARCHAR(150) NULL,
      bank_name VARCHAR(120) NULL,
      ifsc VARCHAR(11) NULL,
      account_number_encrypted TEXT NULL,
      aadhaar_encrypted TEXT NULL,
      pan_encrypted TEXT NULL,
      gstin VARCHAR(15) NULL,
      merchant_code VARCHAR(40) NULL UNIQUE,
      merchant_token_hash CHAR(64) NULL,
      payin_enabled TINYINT(1) NOT NULL DEFAULT 1,
      payout_enabled TINYINT(1) NOT NULL DEFAULT 1,
      payin_commission DECIMAL(5,2) NOT NULL DEFAULT 0,
      payout_commission DECIMAL(5,2) NOT NULL DEFAULT 0,
      direct_fund_commission_enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_merchant_details_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    )`);

    await db.query(`INSERT INTO merchant_details (
      merchant_id, mobile, company_name, bank_name, ifsc,
      account_number_encrypted, aadhaar_encrypted, pan_encrypted, gstin,
      merchant_code, merchant_token_hash, payin_enabled, payout_enabled,
      payin_commission, payout_commission, direct_fund_commission_enabled
    )
    SELECT id, mobile, company_name, bank_name, ifsc,
      account_number_encrypted, aadhaar_encrypted, pan_encrypted, gstin,
      merchant_code, merchant_token_hash, payin_enabled, payout_enabled,
      payin_commission, payout_commission, direct_fund_commission_enabled
    FROM merchants`);

    await db.query(`ALTER TABLE merchants
      ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      DROP INDEX uq_merchants_merchant_code,
      DROP COLUMN mobile,
      DROP COLUMN company_name,
      DROP COLUMN bank_name,
      DROP COLUMN ifsc,
      DROP COLUMN account_number_encrypted,
      DROP COLUMN aadhaar_encrypted,
      DROP COLUMN pan_encrypted,
      DROP COLUMN gstin,
      DROP COLUMN merchant_code,
      DROP COLUMN merchant_token_hash,
      DROP COLUMN payin_enabled,
      DROP COLUMN payout_enabled,
      DROP COLUMN payin_commission,
      DROP COLUMN payout_commission,
      DROP COLUMN direct_fund_commission_enabled`);
  }
};
