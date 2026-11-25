const repository = require('./repository');
const { toKolkataIso } = require('../../utils/time');

const statuses = new Set(['pending', 'processing', 'settled', 'failed']);
const modes = new Set(['IMPS', 'NEFT', 'RTGS', 'UPI']);
const maxPageSize = 100;
const maxExportRows = 10000;

function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function objectInput(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid(`${label} must be an object`);
  }
}

function queryString(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${key} must be a single string value`);
  return value.trim();
}

function parseDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${label} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(`${label} must be a valid calendar date`);
  }
  return value;
}

function filtersFrom(query, exportMode = false) {
  objectInput(query, 'Settlement filters');
  const search = queryString(query, 'search');
  const statusValue = queryString(query, 'status');
  const modeValue = queryString(query, 'mode');
  const from = parseDate(queryString(query, 'from'), 'From date');
  const to = parseDate(queryString(query, 'to'), 'To date');
  const status = statusValue && statusValue.toLowerCase() !== 'all'
    ? statusValue.toLowerCase()
    : undefined;
  const mode = modeValue && modeValue.toLowerCase() !== 'all'
    ? modeValue.toUpperCase()
    : undefined;
  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (status && !statuses.has(status)) invalid('Status must be pending, processing, settled, or failed');
  if (mode && !modes.has(mode)) invalid('Mode must be IMPS, NEFT, RTGS, or UPI');
  if (from && to && from > to) invalid('From date cannot be after to date');

  const pageValue = queryString(query, 'page');
  const limitValue = queryString(query, 'limit');
  const page = exportMode ? 1 : (pageValue === undefined ? 1 : Number(pageValue));
  const limit = exportMode ? maxExportRows : (limitValue === undefined ? 20 : Number(limitValue));
  if (!Number.isSafeInteger(page) || page < 1) invalid('Page must be a positive integer');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > (exportMode ? maxExportRows : maxPageSize)) {
    invalid(`Limit must be between 1 and ${exportMode ? maxExportRows : maxPageSize}`);
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');
  return { search, status, mode, from, to, page, limit, offset };
}

function amount(value, label, allowZero = true) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))) {
    invalid(`${label} must be a valid amount with at most two decimal places`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed > 9999999999.99 ||
      (allowZero ? parsed < 0 : parsed <= 0) ||
      Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.000001) {
    invalid(`${label} must be ${allowZero ? 'non-negative' : 'positive'} and have at most two decimal places`);
  }
  return Math.round(parsed * 100) / 100;
}

function optionalString(input, key, label, maxLength) {
  const value = input[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    invalid(`${label} must be a string of at most ${maxLength} characters`);
  }
  return value.trim() || null;
}

function normalizeMode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !modes.has(value.trim().toUpperCase())) {
    invalid('Mode must be IMPS, NEFT, RTGS, or UPI');
  }
  return value.trim().toUpperCase();
}

function parseId(value) {
  if (typeof value !== 'string') invalid('Settlement ID is invalid');
  const match = /^(?:ST)?([0-9]+)$/i.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
    invalid('Settlement ID is invalid');
  }
  return Number(match[1]);
}

function present(row) {
  return {
    id: `ST${String(row.id).padStart(6, '0')}`,
    merchantId: row.merchant_code,
    merchantName: row.merchant_name,
    companyName: row.company_name,
    settlementDate: row.settlement_date
      ? String(row.settlement_date).slice(0, 10)
      : null,
    payinAmount: Number(row.payin_amount),
    charge: Number(row.charge_amount),
    settledAmount: Number(row.settled_amount),
    mode: row.mode,
    utr: row.utr,
    status: row.status,
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at)
  };
}

function presentStats(row) {
  return {
    totalSettledAmount: Number(row.total_settled_amount || 0),
    pendingSettlement: Number(row.pending_settlement || 0),
    processing: Number(row.processing || 0),
    failedSettlement: Number(row.failed_settlement || 0)
  };
}

function presentList(result, stats, filters) {
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    stats: presentStats(stats),
    settlements: result.rows.map(present),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1 && result.total > 0
    },
    filters: {
      search: filters.search || null,
      mode: filters.mode || null,
      status: filters.status || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
}

exports.list = async (query) => {
  const filters = filtersFrom(query);
  const [result, stats] = await Promise.all([
    repository.list(filters),
    repository.stats(filters)
  ]);
  return presentList(result, stats, filters);
};

exports.stats = async (query) => {
  const filters = filtersFrom(query);
  return presentStats(await repository.stats(filters));
};

exports.getById = async (idValue) => {
  const row = await repository.getById(parseId(idValue));
  if (!row) invalid('Settlement not found', 404);
  return present(row);
};

exports.create = async (input, adminId) => {
  objectInput(input, 'Settlement');
  const allowedFields = new Set([
    'merchantId', 'settlementDate', 'payinAmount', 'charge', 'mode', 'utr', 'status'
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} is not supported`);
  }
  if (typeof input.merchantId !== 'string' || !input.merchantId.trim() ||
      input.merchantId.trim().length > 50) {
    invalid('Merchant ID is required and must be at most 50 characters');
  }
  const payinAmount = amount(input.payinAmount, 'Payin amount', false);
  const chargeAmount = amount(input.charge === undefined ? 0 : input.charge, 'Charge');
  if (chargeAmount > payinAmount) invalid('Charge cannot exceed payin amount');
  const status = input.status === undefined ? 'pending' : input.status;
  if (!statuses.has(status)) invalid('Invalid settlement status');
  const utr = optionalString(input, 'utr', 'UTR', 100);
  if (status === 'settled' && !utr) invalid('A UTR is required for settled records');
  const settlementDate = parseDate(input.settlementDate, 'Settlement date');
  const mode = normalizeMode(input.mode);
  if (status === 'settled' && !settlementDate) {
    invalid('Settlement date is required for settled records');
  }
  const row = await repository.create({
    merchantId: input.merchantId.trim(),
    settlementDate,
    payinAmount,
    chargeAmount,
    settledAmount: Math.round((payinAmount - chargeAmount) * 100) / 100,
    mode,
    utr,
    status
  }, adminId);
  return present(row);
};

exports.update = async (idValue, input, adminId) => {
  const id = parseId(idValue);
  objectInput(input, 'Settlement update');
  const allowedFields = new Set(['status', 'settlementDate', 'mode', 'utr']);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} cannot be updated`);
  }
  const updates = {};
  if (input.status !== undefined) {
    if (!statuses.has(input.status)) invalid('Invalid settlement status');
    updates.status = input.status;
  }
  if (input.settlementDate !== undefined) {
    updates.settlementDate = parseDate(input.settlementDate, 'Settlement date');
  }
  if (input.mode !== undefined) updates.mode = normalizeMode(input.mode);
  if (input.utr !== undefined) updates.utr = optionalString(input, 'utr', 'UTR', 100);
  if (!Object.keys(updates).length) invalid('At least one settlement field must be provided');
  const row = await repository.update(id, updates, adminId);
  if (!row) invalid('Settlement not found', 404);
  return present(row);
};

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

exports.exportCsv = async (query) => {
  const filters = filtersFrom(query, true);
  const result = await repository.list(filters);
  if (result.total > maxExportRows) {
    invalid(`Settlement export is limited to ${maxExportRows} rows; narrow the filters`, 413);
  }
  const headers = [
    'Settlement ID', 'Merchant ID', 'Merchant Name', 'Company Name',
    'Settlement Date', 'Payin Amount (INR)', 'Charge (INR)',
    'Settled Amount (INR)', 'Mode', 'UTR', 'Status'
  ];
  return [
    headers.map(csvCell).join(','),
    ...result.rows.map(row => {
      const item = present(row);
      return [
        item.id, item.merchantId, item.merchantName, item.companyName,
        item.settlementDate, item.payinAmount, item.charge, item.settledAmount,
        item.mode, item.utr, item.status
      ].map(csvCell).join(',');
    })
  ].join('\r\n');
};
