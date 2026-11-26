const repository = require('./repository');
const { encrypt, decrypt } = require('../../utils/encryption');
const { toKolkataIso } = require('../../utils/time');

const directions = new Set(['payin', 'payout', 'both']);
const statuses = new Set(['enabled', 'disabled']);
const maximumPageSize = 100;

function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requiredString(input, key, label, maximumLength) {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
    invalid(`${label} is required and must be at most ${maximumLength} characters`);
  }
  return value.trim();
}

function normalizeCode(value) {
  const code = requiredString({ code: value }, 'code', 'Gateway code', 60).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(code)) {
    invalid('Gateway code must contain 2-60 letters, numbers, underscores, or hyphens');
  }
  return code;
}

function normalizeDirection(value) {
  if (!directions.has(value)) invalid('Direction must be payin, payout, or both');
  return value;
}

function normalizeMethods(value) {
  if (!Array.isArray(value) || value.length > 20) {
    invalid('Payment methods must be an array containing at most 20 values');
  }
  const methods = value.map((method) => {
    if (typeof method !== 'string' || !method.trim() || method.trim().length > 40) {
      invalid('Each payment method must be a non-empty string of at most 40 characters');
    }
    return method.trim();
  });
  if (new Set(methods.map(method => method.toLowerCase())).size !== methods.length) {
    invalid('Payment methods must not contain duplicates');
  }
  return methods;
}

function normalizeChargePercent(value) {
  const charge = Number(value);
  if (!Number.isFinite(charge) || charge < 0 || charge > 100 ||
      Math.abs(charge * 100 - Math.round(charge * 100)) > 0.000001) {
    invalid('Charge percent must be a number between 0 and 100 with at most two decimal places');
  }
  return Math.round(charge * 100) / 100;
}

function normalizeCredentials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('Credentials must be a key/value object');
  }
  const entries = Object.entries(value);
  if (entries.length > 50) invalid('Credentials cannot contain more than 50 fields');
  const credentials = {};
  for (const [key, credentialValue] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) {
      invalid('Credential keys must start with a letter and contain only letters, numbers, dot, underscore, or hyphen');
    }
    if (typeof credentialValue !== 'string' || !credentialValue.trim() ||
        Buffer.byteLength(credentialValue, 'utf8') > 4096) {
      invalid(`Credential ${key} must be a non-empty string of at most 4096 bytes`);
    }
    credentials[key] = credentialValue;
  }
  const serialized = JSON.stringify(credentials);
  if (Buffer.byteLength(serialized, 'utf8') > 16000) {
    invalid('Credentials cannot exceed 16000 bytes');
  }
  return credentials;
}

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) ||
      !Number.isSafeInteger(Number(value))) {
    invalid('Gateway account ID is invalid');
  }
  return Number(value);
}

function parsePaymentMethods(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') invalid('Stored gateway payment methods are invalid');
  try {
    const methods = JSON.parse(value);
    if (!Array.isArray(methods)) invalid('Stored gateway payment methods are invalid');
    return methods;
  } catch (error) {
    if (error.status) throw error;
    invalid('Stored gateway payment methods are invalid', 500);
  }
}

function decodeCredentials(value) {
  try {
    const credentials = JSON.parse(decrypt(value));
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
      invalid('Stored gateway credentials are invalid', 500);
    }
    return credentials;
  } catch (error) {
    if (error.status) throw error;
    throw error;
  }
}

function presentListAccount(row) {
  const credentials = decodeCredentials(row.credentials_encrypted);
  return {
    id: row.id,
    providerName: row.provider_name,
    code: row.gateway_code,
    direction: row.direction,
    paymentMethods: parsePaymentMethods(row.payment_methods),
    chargePercent: Number(row.charge_percent),
    status: row.status,
    credentialsConfigured: Object.keys(credentials).length > 0,
    credentialKeys: Object.keys(credentials),
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at)
  };
}

function presentDetails(row) {
  return {
    ...presentListAccount(row),
    credentials: decodeCredentials(row.credentials_encrypted)
  };
}

function queryString(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${key} must be a single string value`);
  return value.trim();
}

function listFilters(query) {
  const search = queryString(query, 'search');
  if (search && search.length > 100) invalid('Search must be at most 100 characters');

  const direction = queryString(query, 'direction');
  if (direction && !directions.has(direction)) {
    invalid('Direction must be payin, payout, or both');
  }

  const status = queryString(query, 'status');
  if (status && !statuses.has(status)) invalid('Status must be enabled or disabled');

  const pageValue = queryString(query, 'page');
  const limitValue = queryString(query, 'limit');
  const page = pageValue === undefined ? 1 : Number(pageValue);
  const limit = limitValue === undefined ? 20 : Number(limitValue);
  if (!Number.isSafeInteger(page) || page < 1) invalid('Page must be a positive integer');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumPageSize) {
    invalid(`Limit must be between 1 and ${maximumPageSize}`);
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');

  return { search, direction, status, page, limit, offset };
}

function presentFlowList(result, filters) {
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    total: result.total,
    active: result.active,
    gateways: result.rows.map(presentListAccount),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1 && result.total > 0
    }
  };
}

function presentSummary(row) {
  return {
    totalAccounts: Number(row.total_accounts || 0),
    activeAccounts: Number(row.active_accounts || 0),
    totalPayin: Number(row.total_payin || 0),
    activePayin: Number(row.active_payin || 0),
    totalPayout: Number(row.total_payout || 0),
    activePayout: Number(row.active_payout || 0)
  };
}

function withCredentialsEncryption(account) {
  return { ...account, credentialsEncrypted: encrypt(JSON.stringify(account.credentials)) };
}

exports.list = async (query) => {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Gateway list filters must be query parameters');
  }
  const filters = listFilters(query);
  const result = await repository.list(filters);
  return {
    summary: presentSummary(result.summary),
    payin: presentFlowList(result.payin, filters),
    payout: presentFlowList(result.payout, filters),
    filters: {
      search: filters.search || null,
      direction: filters.direction || null,
      status: filters.status || null
    }
  };
};

exports.getById = async (idValue) => {
  const row = await repository.getById(parseId(idValue));
  if (!row) invalid('Gateway account not found', 404);
  return presentDetails(row);
};

exports.getPayinIntegrationAccount = async (idValue) => {
  const row = await repository.getById(parseId(String(idValue)));
  if (!row || row.status !== 'enabled' || !['payin', 'both'].includes(row.direction)) {
    invalid('Payin gateway account not found or disabled', 400);
  }
  return {
    code: row.gateway_code,
    paymentMethods: parsePaymentMethods(row.payment_methods)
  };
};

exports.getPayoutIntegrationAccount = async (idValue) => {
  const row = await repository.getById(parseId(String(idValue)));
  if (!row || row.status !== 'enabled' || !['payout', 'both'].includes(row.direction)) {
    invalid('Payout gateway account not found or disabled', 400);
  }
  return { code: row.gateway_code };
};

exports.create = async (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A gateway account object is required');
  }
  const allowedFields = new Set([
    'providerName', 'code', 'direction', 'paymentMethods',
    'chargePercent', 'credentials', 'status'
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} is not supported`);
  }

  const providerName = requiredString(input, 'providerName', 'Provider name', 100);
  const code = normalizeCode(input.code);
  const direction = normalizeDirection(input.direction);
  const paymentMethods = normalizeMethods(input.paymentMethods);
  const chargePercent = input.chargePercent === undefined
    ? 0
    : normalizeChargePercent(input.chargePercent);
  if (code === 'TRUSTPAY24' && input.credentials !== undefined) {
    invalid('TrustPay24 credentials must be configured in the backend environment');
  }
  const credentials = code === 'TRUSTPAY24' ? {} : normalizeCredentials(input.credentials);
  const status = input.status === undefined ? 'disabled' : input.status;
  if (!statuses.has(status)) invalid('Status must be enabled or disabled');

  try {
    const id = await repository.create(withCredentialsEncryption({
      providerName, code, direction, paymentMethods, chargePercent, credentials, status
    }));
    return exports.getById(String(id));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') invalid('Gateway code already exists', 409);
    throw error;
  }
};

exports.update = async (idValue, input) => {
  const id = parseId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A gateway account update object is required');
  }
  const allowedFields = new Set([
    'providerName', 'code', 'direction', 'paymentMethods',
    'chargePercent', 'credentials'
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} cannot be updated`);
  }
  if (!Object.keys(input).length) invalid('At least one field must be provided');

  const existingAccount = input.code !== undefined || input.credentials !== undefined
    ? await repository.getById(id)
    : null;
  if ((input.code !== undefined || input.credentials !== undefined) && !existingAccount) {
    invalid('Gateway account not found', 404);
  }

  const code = input.code === undefined
    ? (existingAccount ? existingAccount.gateway_code : undefined)
    : normalizeCode(input.code);
  if (code === 'TRUSTPAY24' && input.credentials !== undefined) {
    invalid('TrustPay24 credentials must be configured in the backend environment');
  }

  const updates = {};
  if (input.providerName !== undefined) {
    updates.providerName = requiredString(input, 'providerName', 'Provider name', 100);
  }
  if (input.code !== undefined) updates.code = code;
  if (input.direction !== undefined) updates.direction = normalizeDirection(input.direction);
  if (input.paymentMethods !== undefined) updates.paymentMethods = normalizeMethods(input.paymentMethods);
  if (input.chargePercent !== undefined) updates.chargePercent = normalizeChargePercent(input.chargePercent);
  if (input.credentials !== undefined) {
    updates.credentialsEncrypted = encrypt(JSON.stringify(normalizeCredentials(input.credentials)));
  } else if (code === 'TRUSTPAY24' ||
      (input.code !== undefined && existingAccount.gateway_code !== code)) {
    updates.credentialsEncrypted = encrypt(JSON.stringify({}));
  }

  try {
    if (!(await repository.update(id, updates))) invalid('Gateway account not found', 404);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') invalid('Gateway code already exists', 409);
    throw error;
  }
  return exports.getById(idValue);
};

exports.updateStatus = async (idValue, status) => {
  const id = parseId(idValue);
  if (!statuses.has(status)) invalid('Status must be enabled or disabled');
  if (!(await repository.updateStatus(id, status))) invalid('Gateway account not found', 404);
  return exports.getById(idValue);
};
