const repository = require('./repository');
const { encrypt, decrypt } = require('../../utils/encryption');
const { toKolkataIso } = require('../../utils/time');

const allowedStatuses = new Set(['pending', 'approved', 'rejected']);
const maximumPageSize = 100;

function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requiredString(input, key, label, maxLength) {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    invalid(`${label} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function normalizeCreate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A withdrawal request object is required');
  }
  const allowedFields = new Set(['fullName', 'bankName', 'accountNumber', 'ifsc', 'amount']);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} is not supported`);
  }

  const fullName = requiredString(input, 'fullName', 'Full name', 150);
  const bankName = requiredString(input, 'bankName', 'Bank name', 120);
  const accountNumber = requiredString(input, 'accountNumber', 'Account number', 20);
  if (!/^[0-9]{6,20}$/.test(accountNumber)) invalid('Account number is invalid');
  const ifsc = requiredString(input, 'ifsc', 'IFSC code', 11).toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) invalid('IFSC code is invalid');
  if ((typeof input.amount !== 'number' && typeof input.amount !== 'string') ||
      (typeof input.amount === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(input.amount.trim()))) {
    invalid('Amount must be between 500 and 25000 with at most two decimal places');
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 500 || amount > 25000 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    invalid('Amount must be between 500 and 25000 with at most two decimal places');
  }

  return {
    fullName,
    bankName,
    accountNumberEncrypted: encrypt(accountNumber),
    accountNumberLast4: accountNumber.slice(-4),
    ifsc,
    amount: Math.round(amount * 100) / 100
  };
}

function present(row, includeFullAccount = false) {
  return {
    id: `WDR${String(row.id).padStart(6, '0')}`,
    merchantId: row.merchant_code || undefined,
    fullName: row.full_name,
    bankName: row.bank_name,
    accountNumber: includeFullAccount
      ? decrypt(row.account_number_encrypted)
      : `****${row.account_number_last4}`,
    ifsc: row.ifsc,
    amount: Number(row.amount),
    status: row.status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at ? toKolkataIso(row.reviewed_at) : null,
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at)
  };
}

function parseId(value) {
  if (typeof value !== 'string') invalid('Withdrawal request ID is invalid');
  const match = /^(?:WDR)?([0-9]+)$/i.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
    invalid('Withdrawal request ID is invalid');
  }
  return Number(match[1]);
}

function queryString(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${key} must be a single string value`);
  return value.trim();
}

function adminFilters(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Withdrawal filters must be query parameters');
  }
  const status = queryString(query, 'status');
  if (status && !allowedStatuses.has(status)) invalid('Invalid withdrawal request status');
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
  return { status, page, limit, offset };
}

exports.create = async (merchantId, input) => {
  const request = normalizeCreate(input);
  return present(await repository.create(merchantId, request));
};

exports.listMerchant = async (merchantId) => {
  const [rows, stats] = await Promise.all([
    repository.listMerchant(merchantId),
    repository.statsMerchant(merchantId)
  ]);
  return {
    stats: {
      totalPayout: Number(stats.total_payout || 0),
      todayPayout: Number(stats.today_payout || 0),
      pendingPayout: Number(stats.pending_payout || 0),
      successfulPayout: Number(stats.successful_payout || 0)
    },
    requests: rows.map(row => present(row))
  };
};

exports.getMerchantById = async (merchantId, idValue) => {
  const row = await repository.getMerchantById(merchantId, parseId(idValue));
  if (!row) invalid('Withdrawal request not found', 404);
  return present(row);
};

exports.listAdmin = async (query) => {
  const filters = adminFilters(query);
  const result = await repository.listAdmin(filters);
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    requests: result.rows.map(row => present(row, true)),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1 && result.total > 0
    },
    filters: { status: filters.status || null }
  };
};

exports.review = async (idValue, input, adminId) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A withdrawal review object is required');
  }
  for (const field of Object.keys(input)) {
    if (field !== 'status' && field !== 'reviewNote') {
      invalid(`Field ${field} cannot be updated`);
    }
  }
  if (input.status !== 'approved' && input.status !== 'rejected') {
    invalid('Status must be approved or rejected');
  }

  let reviewNote = null;
  if (input.reviewNote !== undefined && input.reviewNote !== null) {
    if (typeof input.reviewNote !== 'string' || input.reviewNote.trim().length > 255) {
      invalid('Review note must be a string of at most 255 characters');
    }
    reviewNote = input.reviewNote.trim() || null;
  }

  const row = await repository.review(parseId(idValue), input.status, reviewNote, adminId);
  if (!row) invalid('Withdrawal request not found', 404);
  return present(row, true);
};
