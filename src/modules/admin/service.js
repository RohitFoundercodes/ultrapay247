const repository = require('./repository');
const { hash, compare } = require('../../utils/hash');
const { generate } = require('../../utils/jwt');
const passwordChange = require('../../utils/password-change');
const { toKolkataIso } = require('../../utils/time');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function normalizeDevice(input) {
  const deviceIdPresent = input.deviceId !== undefined && input.deviceId !== null;
  const deviceNamePresent = input.deviceName !== undefined && input.deviceName !== null;
  if (!deviceIdPresent && !deviceNamePresent) {
    return { deviceId: null, deviceName: null };
  }
  if (!deviceIdPresent || !deviceNamePresent) {
    invalid('Device ID and device name must be provided together');
  }
  if (typeof input.deviceId !== 'string' || !input.deviceId.trim() ||
      input.deviceId.trim().length > 128) {
    invalid('Device ID must be a non-empty string of at most 128 characters');
  }
  if (typeof input.deviceName !== 'string' || !input.deviceName.trim() ||
      input.deviceName.trim().length > 120) {
    invalid('Device name must be a non-empty string of at most 120 characters');
  }
  return {
    deviceId: input.deviceId.trim(),
    deviceName: input.deviceName.trim()
  };
}

exports.login = async (input, requestMetadata = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Login details must be an object');
  }
  const { email, password } = input;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 150) invalid('Email must be at most 150 characters');
  const device = normalizeDevice(input);
  const ipAddress = typeof requestMetadata.ipAddress === 'string' &&
    requestMetadata.ipAddress.length <= 45
    ? requestMetadata.ipAddress
    : null;
  const admin = await repository.findByEmail(normalizedEmail);
  const authenticated = Boolean(
    admin && admin.status === 'active' && await compare(password, admin.password_hash)
  );
  await repository.createLoginLog({
    adminId: admin ? admin.id : null,
    email: normalizedEmail,
    ...device,
    ipAddress,
    status: authenticated ? 'success' : 'failure'
  });
  if (!authenticated) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  return {
    token: generate({ id: admin.id, role: 'admin' }),
    admin: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' }
  };
};

exports.getLoginLogs = async (query) => {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Login log filters must be query parameters');
  }
  function queryString(key) {
    const value = query[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') invalid(`${key} must be a single string value`);
    return value.trim();
  }
  function dateValue(value, label) {
    if (value === undefined) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      invalid(`${label} must be a valid calendar date`);
    }
    return value;
  }

  const search = queryString('search');
  const statusValue = queryString('status');
  const status = statusValue && statusValue.toLowerCase() !== 'all'
    ? statusValue.toLowerCase()
    : undefined;
  const from = dateValue(queryString('from'), 'From date');
  const to = dateValue(queryString('to'), 'To date');
  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (status && !['success', 'failure'].includes(status)) {
    invalid('Status must be success or failure');
  }
  if (from && to && from > to) invalid('From date cannot be after to date');
  const pageValue = queryString('page');
  const limitValue = queryString('limit');
  const page = pageValue === undefined ? 1 : Number(pageValue);
  const limit = limitValue === undefined ? 20 : Number(limitValue);
  if (!Number.isSafeInteger(page) || page < 1) invalid('Page must be a positive integer');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    invalid('Limit must be between 1 and 100');
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');

  const result = await repository.getLoginLogs({
    search, status, from, to, page, limit, offset
  });
  const totalPages = Math.ceil(result.total / limit);
  return {
    logs: result.rows.map(row => ({
      id: row.id,
      adminId: row.admin_id,
      adminName: row.admin_name,
      email: row.email,
      deviceId: row.device_id,
      deviceName: row.device_name,
      ipAddress: row.ip_address,
      status: row.login_status,
      loggedInAt: toKolkataIso(row.logged_in_at)
    })),
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && result.total > 0
    },
    filters: {
      search: search || null,
      status: status || null,
      from: from || null,
      to: to || null
    }
  };
};

exports.changePassword = async (adminId, input) => {
  const { currentPassword, newPassword } = passwordChange.normalize(input);
  const currentHash = await repository.getPasswordHash(adminId);
  if (!currentHash || !(await compare(currentPassword, currentHash))) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }
  if (await compare(newPassword, currentHash)) {
    const error = new Error('New password must be different from the current password');
    error.status = 400;
    throw error;
  }

  const updated = await repository.updatePassword(
    adminId,
    currentHash,
    await hash(newPassword)
  );
  if (!updated) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }
  return { message: 'Password changed successfully' };
};
