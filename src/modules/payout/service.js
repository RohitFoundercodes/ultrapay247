const repository = require('./repository');
const { encrypt } = require('../../utils/encryption');
const { toKolkataIso } = require('../../utils/time');

const maxPageSize = 100;
const paymentStatuses = new Set(['pending', 'succeeded', 'failed']);
const settlementStatuses = new Set(['pending', 'settled', 'failed']);

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

function requiredString(input, key, label, maxLength) {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    invalid(`${label} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function optionalString(input, key, maxLength) {
  if (input[key] === undefined || input[key] === null || input[key] === '') return null;
  if (typeof input[key] !== 'string' || input[key].trim().length > maxLength) {
    invalid(`${key} must be at most ${maxLength} characters`);
  }
  return input[key].trim() || null;
}

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) ||
      !Number.isSafeInteger(Number(value))) {
    invalid('Payout transaction ID is invalid');
  }
  return Number(value);
}

function parseDate(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${label} date must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(`${label} date must be a valid calendar date`);
  }
  return value;
}

function queryString(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${key} must be a single string value`);
  return value.trim();
}

function filtersFrom(query) {
  objectInput(query, 'Payout filters');
  const search = queryString(query, 'search');
  const merchantId = queryString(query, 'merchantId');
  const provider = queryString(query, 'provider');
  const status = queryString(query, 'status');
  const settlement = queryString(query, 'settlement');
  const from = parseDate(queryString(query, 'from'), 'From');
  const to = parseDate(queryString(query, 'to'), 'To');

  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (merchantId && merchantId.length > 40) invalid('Merchant ID must be at most 40 characters');
  if (provider && provider.length > 100) invalid('Provider must be at most 100 characters');
  if (status && !paymentStatuses.has(status)) invalid('Invalid payout status');
  if (settlement && !settlementStatuses.has(settlement)) invalid('Invalid settlement status');
  if (from && to && from > to) invalid('From date cannot be after to date');

  const pageValue = queryString(query, 'page');
  const limitValue = queryString(query, 'limit');
  const page = pageValue === undefined ? 1 : Number(pageValue);
  const limit = limitValue === undefined ? 20 : Number(limitValue);
  if (!Number.isSafeInteger(page) || page < 1) invalid('Page must be a positive integer');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxPageSize) {
    invalid(`Limit must be between 1 and ${maxPageSize}`);
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');

  return { search, merchantId, provider, status, settlement, from, to, page, limit, offset };
}

function present(row) {
  return {
    id: row.id,
    createdAt: toKolkataIso(row.created_at),
    transactionId: row.reference,
    orderId: row.order_id,
    merchantId: row.merchant_id,
    companyName: row.company_name,
    provider: row.provider_name,
    payoutType: row.payout_type,
    beneficiaryName: row.beneficiary_name,
    beneficiaryAccount: `****${row.beneficiary_account_last4}`,
    beneficiaryIfsc: row.beneficiary_ifsc,
    amount: Number(row.amount),
    commission: Number(row.commission_amount),
    netAmount: Number(row.net_amount),
    currency: row.currency,
    paymentId: row.payment_id,
    status: row.status,
    settlement: row.settlement_status,
    utr: row.utr,
    customerEmail: row.customer_email,
    description: row.description,
    updatedAt: row.updated_at ? toKolkataIso(row.updated_at) : null
  };
}

function presentStats(row) {
  return {
    totalPayout: Number(row.total_payout || 0),
    todayPayout: Number(row.today_payout || 0),
    successfulPayout: Number(row.successful_payout || 0),
    pendingPayout: Number(row.pending_payout || 0),
    failedPayout: Number(row.failed_payout || 0),
    totalCommission: Number(row.total_commission || 0)
  };
}

function presentList(result, stats, filters) {
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    stats: presentStats(stats),
    transactions: result.rows.map(present),
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
      provider: filters.provider || null,
      status: filters.status || null,
      settlement: filters.settlement || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
}

function normalizeCreate(input) {
  objectInput(input, 'Payout request');
  const allowedFields = new Set([
    'reference', 'orderId', 'gatewayAccountId', 'providerName', 'payoutType',
    'beneficiaryName', 'accountNumber', 'ifsc', 'amount', 'currency',
    'paymentId', 'customerEmail', 'description'
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} is not supported`);
  }

  const reference = requiredString(input, 'reference', 'Reference', 100);
  const orderId = optionalString(input, 'orderId', 100) || reference;
  const beneficiaryName = requiredString(input, 'beneficiaryName', 'Beneficiary name', 150);
  const accountNumber = requiredString(input, 'accountNumber', 'Account number', 34);
  if (!/^[A-Za-z0-9]{6,34}$/.test(accountNumber)) invalid('Account number is invalid');
  const ifsc = requiredString(input, 'ifsc', 'IFSC code', 11).toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) invalid('IFSC code is invalid');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    invalid('Amount must be positive and have at most two decimal places');
  }
  const currency = input.currency === undefined ? 'INR' : requiredString(input, 'currency', 'Currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) invalid('Currency must be a three-letter code');
  let gatewayAccountId = null;
  if (input.gatewayAccountId !== undefined && input.gatewayAccountId !== null) {
    const value = String(input.gatewayAccountId);
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      invalid('Gateway account ID is invalid');
    }
    gatewayAccountId = Number(value);
  }
  const providerName = optionalString(input, 'providerName', 100);
  let payoutType = null;
  if (input.payoutType !== undefined && input.payoutType !== null) {
    if (typeof input.payoutType !== 'string' ||
        !['IMPS', 'UPI', 'SELF'].includes(input.payoutType.trim().toUpperCase())) {
      invalid('Payout type must be IMPS, UPI, or SELF');
    }
    payoutType = input.payoutType.trim().toUpperCase();
  }
  const paymentId = optionalString(input, 'paymentId', 100);
  const customerEmail = optionalString(input, 'customerEmail', 150);
  const description = optionalString(input, 'description', 255);
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    invalid('Customer email is invalid');
  }

  return {
    reference, orderId, gatewayAccountId, providerName, payoutType, beneficiaryName,
    accountNumberEncrypted: encrypt(accountNumber),
    accountNumberLast4: accountNumber.slice(-4),
    ifsc, amount: Math.round(amount * 100) / 100, currency, paymentId,
    customerEmail, description
  };
}

exports.create = async (merchantId, input) => {
  const data = normalizeCreate(input);
  try {
    return present(await repository.create({ ...data, merchantId }));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') invalid('Payout reference already exists', 409);
    throw error;
  }
};

exports.listMerchant = async (merchantId, query) => {
  if (query && query.merchantId !== undefined) {
    invalid('Merchant ID cannot be filtered on a merchant payout list');
  }
  const filters = filtersFrom(query);
  filters.merchantRecordId = merchantId;
  const [result, stats] = await Promise.all([
    repository.list(filters),
    repository.stats(filters)
  ]);
  return presentList(result, stats, filters);
};

exports.getMerchantById = async (merchantId, idValue) => {
  const row = await repository.getMerchantById(merchantId, parseId(idValue));
  if (!row) invalid('Payout transaction not found', 404);
  return present(row);
};

exports.list = async (query) => {
  const filters = filtersFrom(query);
  const [result, stats] = await Promise.all([
    repository.list(filters),
    repository.stats(filters)
  ]);
  return presentList(result, stats, filters);
};

exports.getById = async (idValue) => {
  const row = await repository.getById(parseId(idValue));
  if (!row) invalid('Payout transaction not found', 404);
  return present(row);
};

exports.stats = async (query) => {
  const filters = filtersFrom(query);
  return presentStats(await repository.stats(filters));
};

exports.updateStatus = async (idValue, input) => {
  const id = parseId(idValue);
  objectInput(input, 'Payout status update');
  const allowedFields = new Set(['status', 'settlement', 'utr', 'paymentId']);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} cannot be updated`);
  }
  const updates = {};
  if (input.status !== undefined) {
    if (!paymentStatuses.has(input.status)) invalid('Invalid payout status');
    updates.status = input.status;
  }
  if (input.settlement !== undefined) {
    if (!settlementStatuses.has(input.settlement)) invalid('Invalid settlement status');
    updates.settlement = input.settlement;
  }
  if (input.utr !== undefined) updates.utr = optionalString(input, 'utr', 100);
  if (input.paymentId !== undefined) updates.paymentId = optionalString(input, 'paymentId', 100);
  if (!Object.keys(updates).length) invalid('At least one supported status field must be provided');

  if (!(await repository.updateStatus(id, updates))) invalid('Payout transaction not found', 404);
  return exports.getById(idValue);
};

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

exports.exportCsv = async (query) => {
  const filters = filtersFrom(query);
  const rows = await repository.exportRows(filters);
  const header = [
    'Created At', 'Transaction ID', 'Order ID', 'Merchant ID', 'Company Name',
    'Provider', 'Beneficiary', 'Beneficiary Account', 'IFSC', 'Amount',
    'Commission', 'Net Amount', 'Currency', 'Payment ID', 'Status',
    'Settlement', 'UTR'
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const transaction = present(row);
    lines.push([
      transaction.createdAt, transaction.transactionId, transaction.orderId,
      transaction.merchantId, transaction.companyName, transaction.provider,
      transaction.beneficiaryName, transaction.beneficiaryAccount,
      transaction.beneficiaryIfsc, transaction.amount, transaction.commission,
      transaction.netAmount, transaction.currency, transaction.paymentId,
      transaction.status, transaction.settlement, transaction.utr
    ].map(csvCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
};
