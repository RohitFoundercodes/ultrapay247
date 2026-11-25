const repository = require('./repository');
const merchantService = require('../merchant/service');
const { toKolkataIso } = require('../../utils/time');

const maximumPageSize = 100;
const maximumStatementRows = 10000;
const entryTypes = new Set(['credit', 'debit', 'commission']);

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

function parseDate(value, label) {
  if (value === undefined) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(`${label} must be a valid date in YYYY-MM-DD format`);
  }
  return value;
}

function filtersFrom(query, limitOverride) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Wallet filters must be query parameters');
  }

  const search = queryString(query, 'search');
  const merchantId = queryString(query, 'merchantId');
  const type = queryString(query, 'type');
  const from = parseDate(queryString(query, 'from'), 'From date');
  const to = parseDate(queryString(query, 'to'), 'To date');
  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  if (merchantId && merchantId.length > 50) invalid('Merchant ID must be at most 50 characters');
  if (type && !entryTypes.has(type)) invalid('Type must be credit, debit, or commission');
  if (from && to && from > to) invalid('From date cannot be after To date');

  const pageValue = queryString(query, 'page');
  const limitValue = queryString(query, 'limit');
  const page = limitOverride ? 1 : (pageValue === undefined ? 1 : Number(pageValue));
  const limit = limitOverride || (limitValue === undefined ? 20 : Number(limitValue));
  if (!Number.isSafeInteger(page) || page < 1) invalid('Page must be a positive integer');
  const limitMaximum = limitOverride || maximumPageSize;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > limitMaximum) {
    invalid(`Limit must be between 1 and ${limitMaximum}`);
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');

  return { search, merchantId, type, from, to, page, limit, offset };
}

function presentTransaction(row) {
  return {
    id: row.id,
    merchantId: row.merchant_code,
    merchantName: row.merchant_name,
    companyName: row.company_name,
    type: row.entry_type,
    amount: Number(row.amount),
    commissionAmount: Number(row.commission_amount),
    balanceAfter: Number(row.balance_after),
    reference: row.reference,
    description: row.description,
    createdAt: toKolkataIso(row.created_at)
  };
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
  const columns = [
    ['Transaction ID', 'id'],
    ['Merchant ID', 'merchant_code'],
    ['Merchant Name', 'merchant_name'],
    ['Company Name', 'company_name'],
    ['Type', 'entry_type'],
    ['Amount (INR)', 'amount'],
    ['Commission (INR)', 'commission_amount'],
    ['Balance After (INR)', 'balance_after'],
    ['Reference', 'reference'],
    ['Description', 'description'],
    ['Created At', 'created_at']
  ];
  return [
    columns.map(([label]) => csvCell(label)).join(','),
    ...rows.map(row => columns.map(([, key]) => csvCell(row[key])).join(','))
  ].join('\r\n');
}

exports.getSummary = async () => {
  const row = await repository.getSummary();
  return {
    totalWalletBalance: Number(row.wallet_balance),
    totalCredit: Number(row.total_credit),
    totalDebit: Number(row.total_debit),
    totalCommission: Number(row.total_commission)
  };
};

exports.getMerchants = async (query) => merchantService.getAll(query);

exports.getTransactions = async (query) => {
  const filters = filtersFrom(query);
  const { rows, total } = await repository.getTransactions(filters);
  const totalPages = Math.ceil(total / filters.limit);
  return {
    transactions: rows.map(presentTransaction),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1 && total > 0
    },
    filters: {
      search: filters.search || null,
      merchantId: filters.merchantId || null,
      type: filters.type || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
};

exports.getStatement = async (query) => {
  const filters = filtersFrom(query, maximumStatementRows);
  const { rows, total } = await repository.getTransactions(filters);
  if (total > maximumStatementRows) {
    invalid(`Statement export is limited to ${maximumStatementRows} rows; narrow the filters`, 413);
  }
  return buildCsv(rows);
};
