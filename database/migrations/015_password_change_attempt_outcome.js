module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE merchant_password_change_logs
      CHANGE COLUMN changed_at attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await db.query(`ALTER TABLE merchant_password_change_logs
      ADD COLUMN succeeded TINYINT(1) NOT NULL DEFAULT 1 AFTER merchant_id`);
    await db.query(`ALTER TABLE merchant_password_change_logs
      DROP INDEX idx_merchant_password_change_log_time`);
    await db.query(`ALTER TABLE merchant_password_change_logs
      ADD INDEX idx_merchant_password_change_log_time (merchant_id, attempted_at)`);
  }
};
