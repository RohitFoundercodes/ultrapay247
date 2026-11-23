const repository = require('./repository');
const { toKolkataIso } = require('../../utils/time');

const disputeStatuses = new Set(['open', 'under_review', 'won', 'lost']);
const disputeReasons = [
  { code: 'amount_not_received', label: 'Amount not received' },
  { code: 'wrong_amount_credited', label: 'Wrong amount credited' },
  { code: 'duplicate_transaction', label: 'Duplicate transaction' },
  { code: 'transaction_failed', label: 'Transaction failed' },
  { code: 'other', label: 'Other' }
];
const reasonLabels = new Map(disputeReasons.map(reason => [reason.code, reason.label]));
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

function optionalQueryString(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${key} must be a single string value`);
  return value.trim();
}

function positiveInteger(value, label, defaultValue, maximum) {
  if (value === undefined) return defaultValue;
  if (!/^[0-9]+$/.test(value)) invalid(`${label} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    invalid(`${label} must be between 1 and ${maximum}`);
  }
  return number;
}

function validDate(value, label) {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD format`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(`${label} is not a valid date`);
  }
  return value;
}

function listFilters(query, allowMerchantFilter) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Dispute filters must be query parameters');
  }
  if (!allowMerchantFilter && query.merchantId !== undefined) {
    invalid('Merchant ID cannot be filtered on a merchant dispute list');
  }

  const search = optionalQueryString(query, 'search');
  const merchantId = allowMerchantFilter ? optionalQueryString(query, 'merchantId') : undefined;
  const reasonValue = optionalQueryString(query, 'reason');
  const reason = reasonValue ? normalizeReason(reasonValue) : undefined;
  const status = optionalQueryString(query, 'status');
  const from = validDate(optionalQueryString(query, 'from'), 'From date');
  const to = validDate(optionalQueryString(query, 'to'), 'To date');

  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (merchantId && merchantId.length > 40) invalid('Merchant ID must be at most 40 characters');
  if (reason && !reasonLabels.has(reason)) invalid('Invalid dispute reason');
  if (status && !disputeStatuses.has(status)) {
    invalid('Status must be open, under_review, won, or lost');
  }
  if (from && to && from > to) invalid('From date must not be after to date');

  const page = positiveInteger(optionalQueryString(query, 'page'), 'Page', 1, Number.MAX_SAFE_INTEGER);
  const limit = positiveInteger(optionalQueryString(query, 'limit'), 'Limit', 20, maximumPageSize);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');

  return { search, merchantId, reason, status, from, to, page, limit, offset };
}

function parseDisputeId(value) {
  if (typeof value !== 'string' || !/^DSP[0-9]{6,}$/.test(value)) {
    invalid('Dispute ID must use the DSP000001 format');
  }
  const id = Number(value.slice(3));
  if (!Number.isSafeInteger(id) || id < 1) invalid('Dispute ID is invalid');
  return id;
}

function presentDispute(row) {
  return {
    id: `DSP${String(row.id).padStart(6, '0')}`,
    transactionId: row.transaction_id,
    orderId: row.order_id,
    amount: Number(row.amount),
    currency: row.currency,
    reason: reasonLabels.get(row.reason) || row.reason,
    reasonCode: row.reason,
    description: row.description,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at),
    reviewedAt: toKolkataIso(row.reviewed_at)
  };
}

function presentSummary(rows, from, to) {
  const counts = { open: 0, under_review: 0, won: 0, lost: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = Number(row.total);
    }
  }
  return {
    from: from || null,
    to: to || null,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts: {
      open: counts.open,
      underReview: counts.under_review,
      won: counts.won,
      lost: counts.lost
    }
  };
}

function presentList(result, stats, filters) {
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    summary: presentSummary(stats, filters.from, filters.to),
    disputes: result.rows.map(presentDispute),
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
      merchantId: filters.merchantId || null,
      reason: filters.reason || null,
      status: filters.status || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
}

function normalizeReason(value) {
  if (typeof value !== 'string') invalid('Reason is required');
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (reasonLabels.has(normalized)) return normalized;
  const matchingReason = disputeReasons.find(reason => reason.label.toLowerCase() === value.trim().toLowerCase());
  if (matchingReason) return matchingReason.code;
  invalid('Reason must be one of the values returned by GET /api/disputes/reasons');
}

function normalizeCreate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A dispute details object is required');
  }
  const allowedFields = new Set(['transactionId', 'orderId', 'amount', 'reason', 'description']);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} is not supported`);
  }

  const transactionId = requiredString(input, 'transactionId', 'Transaction ID', 100);
  const orderId = requiredString(input, 'orderId', 'Order ID', 100);
  if ((typeof input.amount !== 'number' && typeof input.amount !== 'string') ||
      (typeof input.amount === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(input.amount.trim()))) {
    invalid('Amount must be positive and have at most two decimal places');
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    invalid('Amount must be positive and have at most two decimal places');
  }

  return {
    transactionId,
    orderId,
    amount: Math.round(amount * 100) / 100,
    reason: normalizeReason(input.reason),
    description: requiredString(input, 'description', 'Description', 10000)
  };
}

async function details(id, merchantId) {
  const row = await repository.getById(id, merchantId);
  if (!row) invalid('Dispute not found', 404);
  return {
    dispute: presentDispute(row),
    ...(merchantId === undefined
      ? {
          merchant: {
            id: row.merchant_code,
            name: row.merchant_name,
            email: row.merchant_email,
            mobile: row.merchant_mobile
          },
          transaction: {
            status: row.transaction_status,
            provider: row.provider_name
          },
          reviewer: row.reviewed_by ? {
            id: row.reviewed_by,
            name: row.reviewer_name
          } : null
        }
      : {})
  };
}

exports.getReasons = () => ({
  reasons: disputeReasons.map(reason => ({ ...reason }))
});

exports.create = async (merchantId, input) => {
  const dispute = normalizeCreate(input);
  try {
    const result = await repository.create(merchantId, dispute);
    if (result.notFound) invalid('Transaction or order ID not found for this merchant', 404);
    return details(result.id, merchantId);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      invalid('A dispute already exists for this transaction', 409);
    }
    throw error;
  }
};

exports.listMerchant = async (merchantId, query) => {
  const filters = listFilters(query, false);
  filters.merchantRecordId = merchantId;
  const [result, stats] = await Promise.all([
    repository.list(filters),
    repository.getStats({ merchantRecordId: merchantId, from: filters.from, to: filters.to })
  ]);
  return presentList(result, stats, filters);
};

exports.getMerchantById = async (merchantId, idValue) =>
  details(parseDisputeId(idValue), merchantId);

exports.listAdmin = async (query) => {
  const filters = listFilters(query, true);
  const [result, stats] = await Promise.all([
    repository.list(filters),
    repository.getStats({ from: filters.from, to: filters.to })
  ]);
  return presentList(result, stats, filters);
};

exports.getAdminById = async (idValue) => details(parseDisputeId(idValue));

exports.getAdminStats = async (query) => {
  const filters = listFilters(query, false);
  const rows = await repository.getStats({ from: filters.from, to: filters.to });
  return presentSummary(rows, filters.from, filters.to);
};

exports.updateStatus = async (idValue, input, adminId) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A dispute status update object is required');
  }
  for (const field of Object.keys(input)) {
    if (field !== 'status' && field !== 'reviewNote') {
      invalid(`Field ${field} cannot be updated`);
    }
  }
  if (!['under_review', 'won', 'lost'].includes(input.status)) {
    invalid('Status must be under_review, won, or lost');
  }

  let reviewNote = null;
  if (input.reviewNote !== undefined && input.reviewNote !== null) {
    reviewNote = requiredString(input, 'reviewNote', 'Review note', 1000);
  }
  const id = parseDisputeId(idValue);
  const result = await repository.updateStatus(id, input.status, reviewNote, adminId);
  if (result.notFound) invalid('Dispute not found', 404);
  return details(id);
};
