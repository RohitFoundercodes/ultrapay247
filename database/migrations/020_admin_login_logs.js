module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE admin_login_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      admin_id BIGINT NULL,
      email VARCHAR(150) NOT NULL,
      device_id VARCHAR(128) NULL,
      device_name VARCHAR(120) NULL,
      ip_address VARCHAR(45) NULL,
      login_status ENUM('success', 'failure') NOT NULL,
      logged_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_login_log_admin
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
      INDEX idx_admin_login_log_time (admin_id, logged_in_at),
      INDEX idx_admin_login_log_status_time (login_status, logged_in_at),
      INDEX idx_admin_login_log_email_time (email, logged_in_at)
    )`);
  }
};
