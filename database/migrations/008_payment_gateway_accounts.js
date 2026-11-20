module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE payment_gateway_accounts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      provider_name VARCHAR(100) NOT NULL,
      gateway_code VARCHAR(60) NOT NULL UNIQUE,
      direction ENUM('payin', 'payout', 'both') NOT NULL,
      payment_methods JSON NOT NULL,
      charge_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      credentials_encrypted TEXT NOT NULL,
      status ENUM('enabled', 'disabled') NOT NULL DEFAULT 'disabled',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_gateway_accounts_direction_status (direction, status),
      INDEX idx_gateway_accounts_status (status)
    )`);
  }
};
