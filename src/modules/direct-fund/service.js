const repository = require('./repository');
const { toKolkataIso } = require('../../utils/time');

const requestStatuses = new Set(['pending', 'in_process', 'approved', 'rejected']);
const reviewStatuses = new Set(['in_process', 'approved', 'rejected']);
const maximumPageSize = 100;

function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function queryString(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${key} must be a single string value`);
  return value.trim();
}

function validDate(value, label) {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(`${label} must be a valid calendar date`);
  }
  return value;
}

function filtersFrom(query, allowMerchantFilter) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Direct fund request filters must be query parameters');
  }
  if (!allowMerchantFilter && query.merchantId !== undefined) {
    invalid('Merchant ID cannot be filtered on a merchant request list');
  }

  const search = queryString(query, 'search');
  const merchantId = allowMerchantFilter ? queryString(query, 'merchantId') : undefined;
  const status = queryString(query, 'status');
  const from = validDate(queryString(query, 'from'), 'From date');
  const to = validDate(queryString(query, 'to'), 'To date');

  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (merchantId && merchantId.length > 40) invalid('Merchant ID must be at most 40 characters');
  if (status && !requestStatuses.has(status)) invalid('Invalid direct fund request status');
  if (from && to && from > to) invalid('From date cannot be after to date');

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

  return { search, merchantId, status, from, to, page, limit, offset };
}

function parseId(value) {
  if (typeof value !== 'string') invalid('Direct fund request ID is invalid');
  const match = /^(?:DFR)?([0-9]+)$/i.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
    invalid('Direct fund request ID is invalid');
  }
  return Number(match[1]);
}

function present(row) {
  const amount = Number(row.amount);
  return {
    id: `DFR${String(row.id).padStart(6, '0')}`,
    merchantId: row.merchant_code,
    merchantName: row.merchant_name || row.company_name,
    amount,
    creditedAmount: row.status === 'approved' ? amount : 0,
    commissionAmount: Number(row.commission_amount || 0),
    description: row.description,
    utr: row.utr,
    receiptUrl: row.receipt_url,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at)
  };
}

function presentSummary(row) {
  return {
    totalRequests: Number(row.total_requests || 0),
    pending: Number(row.pending || 0),
    inProcess: Number(row.in_process || 0),
    approved: Number(row.approved || 0),
    rejected: Number(row.rejected || 0)
  };
}

function presentList(result, summary, filters) {
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    summary: presentSummary(summary),
    requests: result.rows.map(present),
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
      status: filters.status || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
}

function normalizeCreate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A direct fund request object is required');
  }
  const allowedFields = new Set(['type', 'amount', 'reference', 'description', 'utr', 'receiptUrl']);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} is not supported`);
  }
  if (input.type !== undefined && input.type !== 'credit') {
    invalid('Direct fund request type must be credit');
  }

  if ((typeof input.amount !== 'number' && typeof input.amount !== 'string') ||
      (typeof input.amount === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(input.amount.trim()))) {
    invalid('Amount must be positive and have at most two decimal places');
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    invalid('Amount must be positive and have at most two decimal places');
  }
  if (typeof input.description !== 'string' || !input.description.trim() ||
      input.description.trim().length > 255) {
    invalid('Description is required and must be at most 255 characters');
  }

  let utr = null;
  const reference = input.reference;
  if (reference !== undefined && reference !== null && reference !== '') {
    if (typeof reference !== 'string' || reference.trim().length > 100) {
      invalid('Reference must be at most 100 characters');
    }
    utr = reference.trim() || null;
  }
  if (input.utr !== undefined && input.utr !== null && input.utr !== '') {
    if (typeof input.utr !== 'string' || input.utr.trim().length > 100) {
      invalid('UTR must be at most 100 characters');
    }
    const explicitUtr = input.utr.trim() || null;
    if (utr && explicitUtr && utr !== explicitUtr) {
      invalid('Reference and UTR must match when both are provided');
    }
    utr = explicitUtr || utr;
  }

  let receiptUrl = null;
  if (input.receiptUrl !== undefined && input.receiptUrl !== null && input.receiptUrl !== '') {
    if (typeof input.receiptUrl !== 'string' || input.receiptUrl.trim().length > 2048) {
      invalid('Receipt URL must be a valid HTTPS URL of at most 2048 characters');
    }
    try {
      const url = new URL(input.receiptUrl.trim());
      if (url.protocol !== 'https:' || url.username || url.password) {
        invalid('Receipt URL must be an HTTPS URL without embedded credentials');
      }
      receiptUrl = url.toString();
      if (receiptUrl.length > 2048) invalid('Receipt URL must be at most 2048 characters');
    } catch (error) {
      if (error.status) throw error;
      invalid('Receipt URL must be a valid HTTPS URL');
    }
  }

  return {
    amount: Math.round(amount * 100) / 100,
    description: input.description.trim(),
    utr,
    receiptUrl
  };
}

exports.create = async (merchantId, input) => (
  present(await repository.create(merchantId, normalizeCreate(input)))
);

exports.listMerchant = async (merchantId, query) => {
  const filters = filtersFrom(query, false);
  filters.merchantRecordId = merchantId;
  const [result, summary] = await Promise.all([
    repository.list(filters),
    repository.summary(filters)
  ]);
  return presentList(result, summary, filters);
};

exports.getMerchantById = async (merchantId, idValue) => {
  const row = await repository.getMerchantById(merchantId, parseId(idValue));
  if (!row) invalid('Direct fund request not found', 404);
  return present(row);
};

exports.listAdmin = async (query) => {
  const filters = filtersFrom(query, true);
  const [result, summary] = await Promise.all([
    repository.list(filters),
    repository.summary(filters)
  ]);
  return presentList(result, summary, filters);
};

exports.getAdminById = async (idValue) => {
  const row = await repository.getById(parseId(idValue));
  if (!row) invalid('Direct fund request not found', 404);
  return present(row);
};

exports.review = async (idValue, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A direct fund review object is required');
  }
  for (const field of Object.keys(input)) {
    if (field !== 'status' && field !== 'reviewNote') {
      invalid(`Field ${field} cannot be updated`);
    }
  }
  if (!reviewStatuses.has(input.status)) {
    invalid('Status must be in_process, approved, or rejected');
  }

  let reviewNote;
  if (input.reviewNote !== undefined) {
    if (input.reviewNote !== null && typeof input.reviewNote !== 'string') {
      invalid('Review note must be a string');
    }
    reviewNote = input.reviewNote === null ? null : input.reviewNote.trim() || null;
    if (reviewNote && reviewNote.length > 255) {
      invalid('Review note must be at most 255 characters');
    }
  }

  const row = await repository.review(parseId(idValue), input.status, reviewNote);
  if (!row) invalid('Direct fund request not found', 404);
  return present(row);
};
