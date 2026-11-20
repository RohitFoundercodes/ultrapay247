module.exports = {
  up: async (db) => {
    await db.query(`CREATE TABLE support_tickets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      subject VARCHAR(200) NOT NULL,
      category VARCHAR(80) NOT NULL,
      priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
      status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
      description TEXT NOT NULL,
      resolved_at TIMESTAMP NULL,
      closed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_support_tickets_status_created (status, created_at),
      INDEX idx_support_tickets_merchant_created (merchant_id, created_at),
      CONSTRAINT fk_support_tickets_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    )`);

    await db.query(`CREATE TABLE support_ticket_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ticket_id BIGINT NOT NULL,
      sender_type ENUM('merchant', 'admin') NOT NULL,
      sender_id BIGINT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket_messages_ticket_created (ticket_id, created_at),
      CONSTRAINT fk_ticket_messages_ticket
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    )`);

    await db.query(`CREATE TABLE support_ticket_attachments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ticket_id BIGINT NOT NULL,
      message_id BIGINT NULL,
      uploaded_by_type ENUM('merchant', 'admin') NOT NULL,
      uploaded_by_id BIGINT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(127) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL,
      file_url VARCHAR(2048) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket_attachments_ticket (ticket_id),
      CONSTRAINT fk_ticket_attachments_ticket
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
      CONSTRAINT fk_ticket_attachments_message
        FOREIGN KEY (message_id) REFERENCES support_ticket_messages(id) ON DELETE CASCADE
    )`);
  }
};
