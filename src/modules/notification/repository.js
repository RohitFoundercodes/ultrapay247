const db = require('../../config/db');

exports.createForMerchant = async (executor, merchantId, notification) => {
  await executor.query(
    `INSERT INTO notifications (
      recipient_type, recipient_id, category, title, message, resource_type, resource_id
    ) VALUES ('merchant', ?, ?, ?, ?, ?, ?)`,
    [
      merchantId,
      notification.category,
      notification.title,
      notification.message,
      notification.resourceType || null,
      notification.resourceId === undefined ? null : String(notification.resourceId)
    ]
  );
};

exports.createForAdmins = async (executor, notification) => {
  await executor.query(
    `INSERT INTO notifications (
      recipient_type, recipient_id, category, title, message, resource_type, resource_id
    )
    SELECT 'admin', id, ?, ?, ?, ?, ?
    FROM admins`,
    [
      notification.category,
      notification.title,
      notification.message,
      notification.resourceType || null,
      notification.resourceId === undefined ? null : String(notification.resourceId)
    ]
  );
};

exports.list = async (recipientType, recipientId, filters) => {
  const conditions = ['recipient_type=?', 'recipient_id=?'];
  const values = [recipientType, recipientId];
  if (filters.unreadOnly) conditions.push('read_at IS NULL');
  const where = conditions.join(' AND ');

  const [countRows, rows, unreadRows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM notifications WHERE ${where}`,
      values
    ),
    db.query(
      `SELECT id, category, title, message, resource_type, resource_id, read_at, created_at
       FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    ),
    db.query(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE recipient_type=? AND recipient_id=? AND read_at IS NULL`,
      [recipientType, recipientId]
    )
  ]);
  return {
    rows: rows[0],
    total: Number(countRows[0][0].total),
    unreadCount: Number(unreadRows[0][0].total)
  };
};

exports.markRead = async (recipientType, recipientId, notificationId) => {
  const [result] = await db.query(
    `UPDATE notifications
     SET read_at=COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id=? AND recipient_type=? AND recipient_id=?`,
    [notificationId, recipientType, recipientId]
  );
  if (result.affectedRows) return true;
  const [rows] = await db.query(
    `SELECT id FROM notifications
     WHERE id=? AND recipient_type=? AND recipient_id=?`,
    [notificationId, recipientType, recipientId]
  );
  return rows.length > 0;
};

exports.markAllRead = async (recipientType, recipientId) => {
  const [result] = await db.query(
    `UPDATE notifications
     SET read_at=CURRENT_TIMESTAMP
     WHERE recipient_type=? AND recipient_id=? AND read_at IS NULL`,
    [recipientType, recipientId]
  );
  return result.affectedRows;
};
