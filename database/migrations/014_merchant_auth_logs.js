module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE merchant_login_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      device_id VARCHAR(128) NULL,
      device_name VARCHAR(120) NULL,
      logged_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_merchant_login_log_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      INDEX idx_merchant_login_log_time (merchant_id, logged_in_at)
    )`);

    await db.query(`CREATE TABLE merchant_password_change_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_merchant_password_change_log_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      INDEX idx_merchant_password_change_log_time (merchant_id, changed_at)
    )`);
  }
};
