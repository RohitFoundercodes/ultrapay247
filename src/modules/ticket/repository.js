const db = require('../../config/db');
const notifications = require('../notification/repository');

const ticketSelect = `SELECT t.id, t.merchant_id, d.merchant_code, m.name AS merchant_name,
  m.email AS merchant_email, d.mobile AS merchant_mobile, t.subject, t.category,
  t.priority, t.status, t.description, t.created_at, t.updated_at,
  t.resolved_at, t.closed_at
  FROM support_tickets t
  JOIN merchants m ON m.id=t.merchant_id
  JOIN merchant_details d ON d.merchant_id=m.id`;

function attachmentValues(ticketId, messageId, actor, attachments) {
  return attachments.map((attachment) => [
    ticketId, messageId, actor.type, actor.id, attachment.fileName,
    attachment.mimeType, attachment.sizeBytes, attachment.url
  ]);
}

async function insertAttachments(connection, ticketId, messageId, actor, attachments) {
  if (!attachments.length) return;
  const values = attachmentValues(ticketId, messageId, actor, attachments);
  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  await connection.query(
    `INSERT INTO support_ticket_attachments (
      ticket_id, message_id, uploaded_by_type, uploaded_by_id,
      file_name, mime_type, size_bytes, file_url
    ) VALUES ${placeholders}`,
    values.flat()
  );
}

exports.create = async (merchantId, ticket, message, attachments) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO support_tickets (merchant_id, subject, category, priority, description)
       VALUES (?, ?, ?, ?, ?)`,
      [merchantId, ticket.subject, ticket.category, ticket.priority, ticket.description]
    );
    const ticketId = result.insertId;
    const [messageResult] = await connection.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message)
       VALUES (?, 'merchant', ?, ?)`,
      [ticketId, merchantId, message]
    );
    await insertAttachments(
      connection,
      ticketId,
      messageResult.insertId,
      { type: 'merchant', id: merchantId },
      attachments
    );
    await notifications.createForAdmins(connection, {
      category: 'ticket',
      title: 'New merchant support ticket',
      message: `Merchant created support ticket TKT${String(ticketId).padStart(6, '0')}: ${ticket.subject}.`,
      resourceType: 'ticket',
      resourceId: `TKT${String(ticketId).padStart(6, '0')}`
    });
    await connection.commit();
    return ticketId;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back support ticket creation:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

function addListFilters(filters, merchantId) {
  const conditions = [];
  const values = [];
  if (merchantId !== undefined) {
    conditions.push('t.merchant_id=?');
    values.push(merchantId);
  }
  if (filters.search) {
    const search = filters.search.replace(/[!%_]/g, '!$&');
    const like = `%${search}%`;
    conditions.push(`(
      CONCAT('TKT', LPAD(t.id, 6, '0')) LIKE ? ESCAPE '!'
      OR CAST(t.id AS CHAR) LIKE ? ESCAPE '!'
      OR d.merchant_code LIKE ? ESCAPE '!'
      OR m.name LIKE ? ESCAPE '!'
      OR t.subject LIKE ? ESCAPE '!'
    )`);
    values.push(like, like, like, like, like);
  }
  if (filters.category) {
    conditions.push('t.category=?');
    values.push(filters.category);
  }
  if (filters.priority) {
    conditions.push('t.priority=?');
    values.push(filters.priority);
  }
  if (filters.status) {
    conditions.push('t.status=?');
    values.push(filters.status);
  }
  if (filters.from) {
    conditions.push('t.created_at>=?');
    values.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    conditions.push('t.created_at<DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(filters.to);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

exports.list = async (filters, merchantId) => {
  const { where, values } = addListFilters(filters, merchantId);
  const [countResult, ticketsResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM support_tickets t
       JOIN merchants m ON m.id=t.merchant_id
       JOIN merchant_details d ON d.merchant_id=m.id
       ${where}`,
      values
    ),
    db.query(
      `${ticketSelect}
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return { rows: ticketsResult[0], total: Number(countResult[0][0].total) };
};

exports.getStats = async (filters) => {
  const { where, values } = addListFilters(filters);
  const [rows] = await db.query(
    `SELECT t.status, COUNT(*) AS total
     FROM support_tickets t
     JOIN merchants m ON m.id=t.merchant_id
     JOIN merchant_details d ON d.merchant_id=m.id
     ${where}
     GROUP BY t.status`,
    values
  );
  return rows;
};

exports.getById = async (ticketId, merchantId) => {
  const merchantFilter = merchantId === undefined ? '' : ' AND t.merchant_id=?';
  const values = merchantId === undefined ? [ticketId] : [ticketId, merchantId];
  const [rows] = await db.query(
    `${ticketSelect}
     WHERE t.id=?${merchantFilter}`,
    values
  );
  if (!rows.length) return null;

  const [messageResult, attachmentResult] = await Promise.all([
    db.query(
      `SELECT tm.id, tm.sender_type, tm.sender_id, tm.message, tm.created_at,
        CASE WHEN tm.sender_type='admin' THEN a.name ELSE m.name END AS sender_name
       FROM support_ticket_messages tm
       LEFT JOIN admins a ON tm.sender_type='admin' AND a.id=tm.sender_id
       LEFT JOIN merchants m ON tm.sender_type='merchant' AND m.id=tm.sender_id
       WHERE tm.ticket_id=?
       ORDER BY tm.created_at, tm.id`,
      [ticketId]
    ),
    db.query(
      `SELECT id, message_id, uploaded_by_type, uploaded_by_id,
        file_name, mime_type, size_bytes, file_url, created_at
       FROM support_ticket_attachments
       WHERE ticket_id=?
       ORDER BY id`,
      [ticketId]
    )
  ]);
  return {
    ticket: rows[0],
    messages: messageResult[0],
    attachments: attachmentResult[0]
  };
};

exports.addMessage = async (ticketId, actor, message, attachments) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [tickets] = await connection.query(
      `SELECT status, merchant_id, subject FROM support_tickets
       WHERE id=?${actor.type === 'merchant' ? ' AND merchant_id=?' : ''}
       FOR UPDATE`,
      actor.type === 'merchant' ? [ticketId, actor.id] : [ticketId]
    );
    if (!tickets.length) {
      await connection.rollback();
      return { notFound: true };
    }
    if (tickets[0].status === 'closed') {
      await connection.rollback();
      return { closed: true };
    }

    const [result] = await connection.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message)
       VALUES (?, ?, ?, ?)`,
      [ticketId, actor.type, actor.id, message]
    );
    await insertAttachments(connection, ticketId, result.insertId, actor, attachments);
    await connection.query(
      'UPDATE support_tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [ticketId]
    );
    const ticketCode = `TKT${String(ticketId).padStart(6, '0')}`;
    if (actor.type === 'admin') {
      await notifications.createForMerchant(connection, tickets[0].merchant_id, {
        category: 'ticket_reply',
        title: 'New support ticket reply',
        message: `An admin replied to support ticket ${ticketCode}: ${tickets[0].subject}.`,
        resourceType: 'ticket',
        resourceId: ticketCode
      });
    } else {
      await notifications.createForAdmins(connection, {
        category: 'ticket_reply',
        title: 'New merchant ticket reply',
        message: `Merchant replied to support ticket ${ticketCode}: ${tickets[0].subject}.`,
        resourceType: 'ticket',
        resourceId: ticketCode
      });
    }
    await connection.commit();
    return { notFound: false, closed: false };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back support ticket reply:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.updateStatus = async (ticketId, status) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [tickets] = await connection.query(
      'SELECT merchant_id, subject, status FROM support_tickets WHERE id=? FOR UPDATE',
      [ticketId]
    );
    if (!tickets.length) {
      await connection.rollback();
      return false;
    }
    const ticket = tickets[0];
    if (ticket.status !== status) {
      await connection.query(
        `UPDATE support_tickets
         SET status=?,
           resolved_at=CASE WHEN ?='resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,
           closed_at=CASE WHEN ?='closed' THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE id=?`,
        [status, status, status, ticketId]
      );
      const ticketCode = `TKT${String(ticketId).padStart(6, '0')}`;
      await notifications.createForMerchant(connection, ticket.merchant_id, {
        category: 'ticket',
        title: 'Support ticket status updated',
        message: `Support ticket ${ticketCode} was updated to ${status}.`,
        resourceType: 'ticket',
        resourceId: ticketCode
      });
    }
    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back support ticket status update:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};
