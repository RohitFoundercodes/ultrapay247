const db = require('../../config/db');

exports.findByEmail = async (email) => {
  const [rows] = await db.query(
    'SELECT id, name, email, password_hash, status FROM admins WHERE email=?',
    [email]
  );
  return rows[0];
};

exports.createLoginLog = async (log) => {
  await db.query(
    `INSERT INTO admin_login_logs (
      admin_id, email, device_id, device_name, ip_address, login_status
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      log.adminId,
      log.email,
      log.deviceId,
      log.deviceName,
      log.ipAddress,
      log.status
    ]
  );
};

exports.getLoginLogs = async (filters) => {
  const conditions = [];
  const values = [];
  if (filters.status) {
    conditions.push('l.login_status=?');
    values.push(filters.status);
  }
  if (filters.search) {
    const escapedSearch = filters.search.replace(/[!%_]/g, '!$&');
    const searchValue = `%${escapedSearch}%`;
    conditions.push(`(
      l.email LIKE ? ESCAPE '!' OR l.device_id LIKE ? ESCAPE '!'
      OR l.device_name LIKE ? ESCAPE '!' OR l.ip_address LIKE ? ESCAPE '!'
      OR a.name LIKE ? ESCAPE '!'
    )`);
    values.push(searchValue, searchValue, searchValue, searchValue, searchValue);
  }
  if (filters.from) {
    conditions.push('l.logged_in_at>=?');
    values.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    conditions.push('l.logged_in_at<DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countResult, logResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM admin_login_logs l
       LEFT JOIN admins a ON a.id=l.admin_id
       ${where}`,
      values
    ),
    db.query(
      `SELECT l.id, l.admin_id, l.email, a.name AS admin_name,
        l.device_id, l.device_name, l.ip_address, l.login_status, l.logged_in_at
       FROM admin_login_logs l
       LEFT JOIN admins a ON a.id=l.admin_id
       ${where}
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`,
      [...values, filters.limit, filters.offset]
    )
  ]);
  return {
    rows: logResult[0],
    total: Number(countResult[0][0].total)
  };
};

exports.getPasswordHash = async (adminId) => {
  const [rows] = await db.query(
    'SELECT password_hash FROM admins WHERE id=?',
    [adminId]
  );
  return rows[0] && rows[0].password_hash;
};

exports.updatePassword = async (adminId, currentHash, newHash) => {
  const [result] = await db.query(
    'UPDATE admins SET password_hash=? WHERE id=? AND password_hash=?',
    [newHash, adminId, currentHash]
  );
  return result.affectedRows > 0;
};
