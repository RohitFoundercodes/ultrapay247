const repository = require('./repository');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
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

function filtersFrom(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Dashboard filters must be query parameters');
  }
  if (query.merchantId !== undefined) {
    invalid('Merchant ID cannot be filtered on a merchant dashboard');
  }
  const from = validDate(queryString(query, 'from'), 'From date');
  const to = validDate(queryString(query, 'to'), 'To date');
  if (from && to && from > to) invalid('From date cannot be after to date');
  return { from, to };
}

function present(row) {
  return {
    currentAmount: Number(row.walletBalance || 0),
    todayPendingSettlement: Number(row.todayPendingSettlement || 0),
    todayPayin: Number(row.todayPayin || 0),
    totalPayin: Number(row.totalPayin || 0),
    todayImpsPayout: Number(row.todayImpsPayout || 0),
    totalImpsPayout: Number(row.totalImpsPayout || 0),
    todayUpiPayout: Number(row.todayUpiPayout || 0),
    totalUpiPayout: Number(row.totalUpiPayout || 0),
    todaySelfPayout: Number(row.todaySelfPayout || 0),
    totalSelfPayout: Number(row.totalSelfPayout || 0),
    todayUncategorizedPayout: Number(row.todayUncategorizedPayout || 0),
    totalUncategorizedPayout: Number(row.totalUncategorizedPayout || 0)
  };
}

exports.getDashboard = async (merchantId, query) => {
  const filters = filtersFrom(query);
  const result = await repository.getDashboard(merchantId, filters);
  return {
    summary: present(result),
    filters: {
      from: filters.from || null,
      to: filters.to || null
    }
  };
};

exports.getAdminDashboard = async () => {
  const result = await repository.getAdminDashboard();
  const payinCommission = Number(result.payinCommission || 0);
  const payoutCommission = Number(result.payoutCommission || 0);
  return {
    currency: 'INR',
    merchantOverview: {
      totalMerchants: Number(result.totalMerchants || 0),
      activeMerchants: Number(result.activeMerchants || 0)
    },
    payinOverview: {
      totalPayin: Number(result.totalPayin || 0),
      todayPayin: Number(result.todayPayin || 0),
      yesterdayPayin: Number(result.yesterdayPayin || 0)
    },
    payoutOverview: {
      totalPayout: Number(result.totalPayout || 0),
      todayPayout: Number(result.todayPayout || 0),
      yesterdayPayout: Number(result.yesterdayPayout || 0),
      pendingPayout: Number(result.pendingPayout || 0)
    },
    walletSettlement: {
      totalWalletBalance: Number(result.totalWalletBalance || 0),
      pendingSettlement: Number(result.pendingSettlement || 0),
      todaySettlement: Number(result.todaySettlement || 0),
      totalSettlement: Number(result.totalSettlement || 0)
    },
    commission: {
      totalCommission: Math.round((payinCommission + payoutCommission) * 100) / 100,
      payinCommission,
      payoutCommission
    }
  };
};
