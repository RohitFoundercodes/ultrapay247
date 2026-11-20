const repository = require('./repository');
const createWorkbook = require('./xlsx');
const { toKolkataIso } = require('../../utils/time');

const ticketStatuses = new Set(['open', 'in_progress', 'resolved', 'closed']);
const ticketPriorities = new Set(['low', 'medium', 'high']);
const maximumPageSize = 100;
const maximumExportRows = 10000;
const maximumAttachmentBytes = 25 * 1024 * 1024;

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${label} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(`${label} is not a valid date`);
  }
  return value;
}

function listFilters(query, includePagination) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('Ticket filters must be query parameters');
  }
  const search = optionalQueryString(query, 'search');
  if (search && search.length > 100) invalid('Search must be at most 100 characters');

  const category = optionalQueryString(query, 'category');
  if (category && category.length > 80) invalid('Category must be at most 80 characters');

  const priority = optionalQueryString(query, 'priority');
  if (priority && !ticketPriorities.has(priority)) {
    invalid('Priority must be low, medium, or high');
  }

  const status = optionalQueryString(query, 'status');
  if (status && !ticketStatuses.has(status)) {
    invalid('Status must be open, in_progress, resolved, or closed');
  }

  const from = validDate(optionalQueryString(query, 'from'), 'From date');
  const to = validDate(optionalQueryString(query, 'to'), 'To date');
  if (from && to && from > to) invalid('From date must not be after to date');

  const filters = { search: search || undefined, category, priority, status, from, to };
  if (!includePagination) {
    filters.maxRows = maximumExportRows;
    return filters;
  }

  const page = positiveInteger(optionalQueryString(query, 'page'), 'Page', 1, Number.MAX_SAFE_INTEGER);
  const limit = positiveInteger(optionalQueryString(query, 'limit'), 'Limit', 20, maximumPageSize);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) invalid('Page is too large');
  return { ...filters, page, limit, offset };
}

function parseTicketId(value) {
  if (typeof value !== 'string' || !/^TKT[0-9]{6,}$/.test(value)) {
    invalid('Ticket ID must use the TKT000001 format');
  }
  const id = Number(value.slice(3));
  if (!Number.isSafeInteger(id) || id < 1) invalid('Ticket ID is invalid');
  return id;
}

function presentTicketId(id) {
  return `TKT${String(id).padStart(6, '0')}`;
}

function presentAttachment(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    url: row.file_url,
    uploadedBy: row.uploaded_by_type,
    createdAt: toKolkataIso(row.created_at)
  };
}

function presentSummary(row) {
  return {
    ticketId: presentTicketId(row.id),
    merchantId: row.merchant_code,
    merchantName: row.merchant_name,
    merchantEmail: row.merchant_email,
    merchantMobile: row.merchant_mobile,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at)
  };
}

function validateAttachments(attachments) {
  if (attachments === undefined) return [];
  if (!Array.isArray(attachments) || attachments.length > 10) {
    invalid('Attachments must be an array containing at most 10 items');
  }
  return attachments.map((attachment) => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
      invalid('Each attachment must be an object');
    }
    const allowedKeys = new Set(['fileName', 'mimeType', 'sizeBytes', 'url']);
    for (const key of Object.keys(attachment)) {
      if (!allowedKeys.has(key)) invalid(`Attachment field ${key} is not supported`);
    }
    const fileName = requiredString(attachment, 'fileName', 'Attachment file name', 255);
    if (/[\\/]/.test(fileName)) invalid('Attachment file name must not contain a path');
    const mimeType = requiredString(attachment, 'mimeType', 'Attachment MIME type', 127);
    if (!/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(mimeType)) {
      invalid('Attachment MIME type is invalid');
    }
    const sizeBytes = attachment.sizeBytes;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maximumAttachmentBytes) {
      invalid('Attachment sizeBytes must be between 1 and 26214400');
    }
    const url = requiredString(attachment, 'url', 'Attachment URL', 2048);
    if (url.startsWith('/')) {
      if (url.startsWith('//') || url.split('/').includes('..')) {
        invalid('Attachment URL must be a safe relative path or HTTPS URL');
      }
    } else {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (error) {
        invalid('Attachment URL must be a safe relative path or HTTPS URL');
      }
      if (parsedUrl.protocol !== 'https:') {
        invalid('Attachment URL must use HTTPS');
      }
    }
    return { fileName, mimeType, sizeBytes, url };
  });
}

function validateMessage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A ticket message object is required');
  }
  return {
    message: requiredString(input, 'message', 'Message', 10000),
    attachments: validateAttachments(input.attachments)
  };
}

function presentDetails(result) {
  const { ticket, messages, attachments } = result;
  return {
    ticket: {
      ...presentSummary(ticket),
      description: ticket.description,
      resolvedAt: toKolkataIso(ticket.resolved_at),
      closedAt: toKolkataIso(ticket.closed_at)
    },
    merchant: {
      id: ticket.merchant_code,
      name: ticket.merchant_name,
      email: ticket.merchant_email,
      mobile: ticket.merchant_mobile
    },
    attachments: attachments.map(presentAttachment),
    conversation: messages.map((message) => ({
      id: message.id,
      senderType: message.sender_type,
      senderId: message.sender_id,
      senderName: message.sender_name,
      message: message.message,
      createdAt: toKolkataIso(message.created_at),
      attachments: attachments
        .filter((attachment) => String(attachment.message_id) === String(message.id))
        .map(presentAttachment)
    }))
  };
}

async function getDetails(ticketId, merchantId) {
  const result = await repository.getById(ticketId, merchantId);
  if (!result) invalid('Ticket not found', 404);
  return presentDetails(result);
}

exports.listMerchantTickets = async (merchantId, query) => {
  const filters = listFilters(query, true);
  const { rows, total } = await repository.list(filters, merchantId);
  const totalPages = Math.ceil(total / filters.limit);
  return {
    tickets: rows.map(presentSummary),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1 && total > 0
    }
  };
};

exports.create = async (merchantId, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A ticket details object is required');
  }
  const subject = requiredString(input, 'subject', 'Subject', 200);
  const category = requiredString(input, 'category', 'Category', 80);
  const priority = input.priority === undefined ? 'medium' : input.priority;
  if (!ticketPriorities.has(priority)) invalid('Priority must be low, medium, or high');
  const description = requiredString(input, 'description', 'Description', 10000);
  const message = input.message === undefined
    ? description
    : requiredString(input, 'message', 'Message', 10000);
  const attachments = validateAttachments(input.attachments);
  const ticketId = await repository.create(
    merchantId,
    { subject, category, priority, description },
    message,
    attachments
  );
  return getDetails(ticketId, merchantId);
};

exports.getMerchantTicket = async (merchantId, ticketId) =>
  getDetails(parseTicketId(ticketId), merchantId);

exports.getAdminTicket = async (ticketId) =>
  getDetails(parseTicketId(ticketId));

exports.reply = async (ticketIdValue, actor, input) => {
  const ticketId = parseTicketId(ticketIdValue);
  const { message, attachments } = validateMessage(input);
  const result = await repository.addMessage(ticketId, actor, message, attachments);
  if (result.notFound) invalid('Ticket not found', 404);
  if (result.closed) invalid('Closed tickets cannot receive new replies', 409);
  return getDetails(ticketId, actor.type === 'merchant' ? actor.id : undefined);
};

exports.updateStatus = async (ticketIdValue, status) => {
  const ticketId = parseTicketId(ticketIdValue);
  if (!ticketStatuses.has(status)) {
    invalid('Status must be open, in_progress, resolved, or closed');
  }
  if (!(await repository.updateStatus(ticketId, status))) invalid('Ticket not found', 404);
  return getDetails(ticketId);
};

exports.getAdminTickets = async (query) => {
  const filters = listFilters(query, true);
  const { rows, total } = await repository.list(filters);
  const totalPages = Math.ceil(total / filters.limit);
  return {
    tickets: rows.map(presentSummary),
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
      category: filters.category || null,
      priority: filters.priority || null,
      status: filters.status || null,
      from: filters.from || null,
      to: filters.to || null
    }
  };
};

exports.getStats = async (query) => {
  const filters = listFilters(query, false);
  const rows = await repository.getStats({ from: filters.from, to: filters.to });
  const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const row of rows) counts[row.status] = Number(row.total);
  return {
    from: filters.from || null,
    to: filters.to || null,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts: {
      open: counts.open,
      inProgress: counts.in_progress,
      resolved: counts.resolved,
      closed: counts.closed
    }
  };
};

function exportRows(rows) {
  return rows.map((row) => ({
    ticketId: presentTicketId(row.id),
    merchantId: row.merchant_code,
    merchantName: row.merchant_name,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: toKolkataIso(row.created_at)
  }));
}

function csvEscape(value) {
  let text = String(value === null || value === undefined ? '' : value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

exports.exportTickets = async (query, format) => {
  if (format !== 'csv' && format !== 'xlsx') invalid('Format must be csv or xlsx');
  const filters = listFilters(query, false);
  const rows = await repository.getExportRows(filters);
  if (rows.length > maximumExportRows) {
    invalid(`Export is limited to ${maximumExportRows} tickets; narrow the filters`, 413);
  }
  const tickets = exportRows(rows);
  if (format === 'csv') {
    const headers = [
      'Ticket ID', 'Merchant ID', 'Merchant Name', 'Subject',
      'Category', 'Priority', 'Status', 'Created At'
    ];
    const fields = [
      'ticketId', 'merchantId', 'merchantName', 'subject',
      'category', 'priority', 'status', 'createdAt'
    ];
    const csv = [
      headers.map(csvEscape).join(','),
      ...tickets.map(ticket => fields.map(field => csvEscape(ticket[field])).join(','))
    ].join('\r\n');
    return {
      fileName: 'support-tickets.csv',
      contentType: 'text/csv; charset=utf-8',
      body: Buffer.from(`\uFEFF${csv}`, 'utf8')
    };
  }

  return {
    fileName: 'support-tickets.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: createWorkbook(tickets)
  };
};
