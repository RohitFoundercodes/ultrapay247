const repository = require('./repository');
const { toKolkataIso } = require('../../utils/time');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function positiveInteger(value, label, defaultValue, maximum) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    invalid(`${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    invalid(`${label} must be between 1 and ${maximum}`);
  }
  return number;
}

function filtersFrom(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Notification filters must be query parameters');
  }
  let unreadOnly = false;
  if (query.unreadOnly !== undefined) {
    if (query.unreadOnly !== 'true' && query.unreadOnly !== 'false') {
      invalid('unreadOnly must be true or false');
    }
    unreadOnly = query.unreadOnly === 'true';
  }
  const page = positiveInteger(query.page, 'Page', 1, Number.MAX_SAFE_INTEGER);
  const limit = positiveInteger(query.limit, 'Limit', 20, 100);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');
  return { unreadOnly, page, limit, offset };
}

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) ||
      !Number.isSafeInteger(Number(value))) {
    invalid('Notification ID is invalid');
  }
  return Number(value);
}

function present(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    message: row.message,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    isRead: Boolean(row.read_at),
    readAt: row.read_at ? toKolkataIso(row.read_at) : null,
    createdAt: toKolkataIso(row.created_at)
  };
}

exports.list = async (recipientType, recipientId, query) => {
  const filters = filtersFrom(query);
  const result = await repository.list(recipientType, recipientId, filters);
  const totalPages = Math.ceil(result.total / filters.limit);
  return {
    notifications: result.rows.map(present),
    unreadCount: result.unreadCount,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1 && result.total > 0
    },
    filters: { unreadOnly: filters.unreadOnly }
  };
};

exports.markRead = async (recipientType, recipientId, idValue) => {
  const id = parseId(idValue);
  if (!(await repository.markRead(recipientType, recipientId, id))) {
    const error = new Error('Notification not found');
    error.status = 404;
    throw error;
  }
  return { id, isRead: true };
};

exports.markAllRead = async (recipientType, recipientId) => ({
  updated: await repository.markAllRead(recipientType, recipientId)
});
