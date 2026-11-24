module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      recipient_type ENUM('admin', 'merchant') NOT NULL,
      recipient_id BIGINT NOT NULL,
      category VARCHAR(50) NOT NULL,
      title VARCHAR(150) NOT NULL,
      message VARCHAR(500) NOT NULL,
      resource_type VARCHAR(50) NULL,
      resource_id VARCHAR(64) NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_recipient (recipient_type, recipient_id, created_at),
      INDEX idx_notifications_unread (recipient_type, recipient_id, read_at, created_at)
    )`);
  }
};
