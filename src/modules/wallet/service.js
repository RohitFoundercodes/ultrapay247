const repository = require('./repository');
const merchantService = require('../merchant/service');
const { toKolkataIso } = require('../../utils/time');

const maximumPageSize = 100;
const maximumStatementRows = 10000;
const entryTypes = new Set(['credit', 'debit', 'commission']);
const merchantSources = new Set(['payin', 'payout', 'directfund', 'wallet']);
const ledgerTypes = new Set(['credit', 'debit', 'commission', 'pending']);

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

function merchantLedgerFilters(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Merchant ledger filters must be query parameters');
  }
  const search = queryString(query, 'search');
  const sourceValue = queryString(query, 'source');
  const typeValue = queryString(query, 'type');
  const statusValue = queryString(query, 'status');
  const statusAliases = {
    succeeded: 'success',
    approved: 'success',
    rejected: 'failed',
    in_process: 'pending'
  };
  const normalizedStatus = statusValue && statusValue.toLowerCase();
  const status = normalizedStatus
    ? (statusAliases[normalizedStatus] || normalizedStatus)
    : undefined;
  const from = parseDate(queryString(query, 'from'), 'From date');
  const to = parseDate(queryString(query, 'to'), 'To date');
  if (search && search.length > 100) invalid('Search must be at most 100 characters');
  const sourceKey = sourceValue && sourceValue.replace(/[\s_-]/g, '').toLowerCase();
  const source = sourceKey && sourceKey !== 'all'
    ? sourceKey === 'directfund' ? 'directFund' : sourceKey
    : undefined;
  const type = typeValue && typeValue.toLowerCase() !== 'all'
    ? typeValue.toLowerCase()
    : undefined;
  if (source && !merchantSources.has(source.toLowerCase())) {
    invalid('Source must be payin, payout, directFund, or wallet');
  }
  if (type && !ledgerTypes.has(type)) {
    invalid('Type must be credit, debit, commission, or pending');
  }
  if (status && !['success', 'pending', 'failed', 'refunded'].includes(status)) {
    invalid('Status must be success, pending, failed, or refunded');
  }
  if (from && to && from > to) invalid('From date cannot be after To date');

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

  return { search, source, type, status, from, to, page, limit, offset };
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

exports.getMerchants = async (query) => {
  const [merchants, summary] = await Promise.all([
    merchantService.getAll(query),
    exports.getSummary()
  ]);
  return { ...merchants, summary };
};

function presentMerchantSummary(row, filters) {
  const openingBalance = Number(row.opening_balance || 0);
  const totalCredit = Number(row.total_credit || 0);
  const totalDebit = Number(row.total_debit || 0);
  const totalPayinCommission = Number(row.payin_commission || 0);
  const totalPayoutCommission = Number(row.payout_commission || 0);
  const totalDirectFundCommission = Number(row.direct_fund_commission || 0);
  const otherCommission = Number(row.other_commission || 0);
  return {
    merchant: {
      id: row.id,
      merchantId: row.merchant_code,
      name: row.name,
      companyName: row.company_name,
      email: row.email,
      mobile: row.mobile,
      status: row.status
    },
    wallet: {
      openingBalance,
      totalCredit,
      totalDebit,
      availableBalance: openingBalance + totalCredit - totalDebit
    },
    commissions: {
      totalPayinCommission,
      totalPayoutCommission,
      totalDirectFundCommission,
      otherCommission,
      totalCommissionEarned: totalPayinCommission + totalPayoutCommission +
        totalDirectFundCommission + otherCommission
    },
    filters: {
      from: filters.from || null,
      to: filters.to || null
    }
  };
}

exports.getMerchantSummary = async (merchantCode, query) => {
  if (typeof merchantCode !== 'string' || !merchantCode.trim() || merchantCode.length > 50) {
    invalid('Merchant ID is invalid');
  }
  const filters = merchantLedgerFilters(query);
  const row = await repository.getMerchantSummary(merchantCode.trim(), filters);
  if (!row) invalid('Merchant not found', 404);
  return presentMerchantSummary(row, filters);
};

exports.getMerchantLedgerTransactions = async (merchantCode, query) => {
  if (typeof merchantCode !== 'string' || !merchantCode.trim() || merchantCode.length > 50) {
    invalid('Merchant ID is invalid');
  }
  const filters = merchantLedgerFilters(query);
  const [summaryRow, transactionResult] = await Promise.all([
    repository.getMerchantSummary(merchantCode.trim(), filters),
    repository.getMerchantTransactions(merchantCode.trim(), filters)
  ]);
  if (!summaryRow) invalid('Merchant not found', 404);
  const { rows, total } = transactionResult;
  const totalPages = Math.ceil(total / filters.limit);
  return {
    summary: presentMerchantSummary(summaryRow, filters),
    transactions: rows.map(row => ({
      id: row.id,
      transactionId: row.transaction_id,
      dateTime: toKolkataIso(row.created_at),
      type: row.type,
      source: row.source,
      amount: Number(row.amount),
      commission: Number(row.commission_amount),
      openingBalance: row.opening_balance === null ? null : Number(row.opening_balance),
      closingBalance: row.closing_balance === null ? null : Number(row.closing_balance),
      referenceId: row.reference_id,
      description: row.description,
      status: row.status
    })),
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
      source: filters.source || null,
      type: filters.type || null,
      status: filters.status || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
};

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
