const repository = require('./repository');
const { toKolkataIso } = require('../../utils/time');

const maxPageSize = 100;
const validStatuses = new Set(['pending', 'succeeded', 'failed', 'refunded']);
const validSettlementStatuses = new Set(['pending', 'settled', 'failed']);

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

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function filtersFrom(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Payin filters must be query parameters');
  }
  const search = queryString(query, 'search');
  const merchantId = queryString(query, 'merchantId');
  const provider = queryString(query, 'provider');
  const status = queryString(query, 'status');
  const settlement = queryString(query, 'settlement');
  const from = queryString(query, 'from');
  const to = queryString(query, 'to');

  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (merchantId && merchantId.length > 40) invalid('Merchant ID must be at most 40 characters');
  if (provider && provider.length > 100) invalid('Provider must be at most 100 characters');
  if (status && !validStatuses.has(status)) invalid('Invalid payment status');
  if (settlement && !validSettlementStatuses.has(settlement)) invalid('Invalid settlement status');
  if (from && (!validDate(from))) invalid('From date must use YYYY-MM-DD');
  if (to && (!validDate(to))) invalid('To date must use YYYY-MM-DD');
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
    amount: Number(row.amount),
    commission: Number(row.commission_amount),
    netAmount: row.net_amount === null ? Number(row.amount) - Number(row.commission_amount) : Number(row.net_amount),
    paymentId: row.payment_id,
    status: row.status,
    settlement: row.settlement_status,
    utr: row.utr,
    updatedAt: row.updated_at ? toKolkataIso(row.updated_at) : null
  };
}

function presentStats(row) {
  return {
    totalPayin: Number(row.total_payin || 0),
    todayPayin: Number(row.today_payin || 0),
    successfulPayin: Number(row.successful_payin || 0),
    totalCommission: Number(row.total_commission || 0)
  };
}

exports.list = async (query) => {
  const filters = filtersFrom(query);
  const [result, stats] = await Promise.all([
    repository.list(filters),
    repository.stats(filters)
  ]);
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
};

exports.getById = async (idValue) => {
  if (!/^[1-9][0-9]*$/.test(idValue) || !Number.isSafeInteger(Number(idValue))) {
    invalid('Payin transaction ID is invalid');
  }
  const row = await repository.getById(Number(idValue));
  if (!row) invalid('Payin transaction not found', 404);
  return present(row);
};

exports.stats = async (query) => {
  const filters = filtersFrom(query);
  const row = await repository.stats(filters);
  return presentStats(row);
};

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

exports.exportCsv = async (query) => {
  const filters = filtersFrom({ ...query, page: '1', limit: '10000' });
  const rows = await repository.exportRows(filters);
  const header = [
    'Created At', 'Transaction ID', 'Order ID', 'Merchant ID', 'Company Name',
    'Provider', 'Amount', 'Commission', 'Net Amount', 'Payment ID',
    'Status', 'Settlement', 'UTR'
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const transaction = present(row);
    lines.push([
      transaction.createdAt, transaction.transactionId, transaction.orderId,
      transaction.merchantId, transaction.companyName, transaction.provider,
      transaction.amount, transaction.commission, transaction.netAmount,
      transaction.paymentId, transaction.status, transaction.settlement, transaction.utr
    ].map(csvCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
};
