const repo = require('./repository');

const allowedStatuses = new Set(['pending', 'succeeded', 'failed', 'refunded']);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

exports.create = async (merchantId, data) => {
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) fail('A valid positive amount is required');
  if (!data.reference) fail('Payment reference is required');

  const currency = (data.currency || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('Currency must be a three-letter code');

  return repo.create({
    merchantId,
    reference: data.reference,
    amount,
    currency,
    customerEmail: data.customerEmail || null,
    description: data.description || null
  });
};

exports.getAll = (merchantId) => repo.getAll(merchantId);

exports.getOne = async (merchantId, id) => {
  const payment = await repo.getOne(merchantId, id);
  if (!payment) fail('Payment not found', 404);
  return payment;
};

exports.updateStatus = async (merchantId, id, status) => {
  if (!allowedStatuses.has(status)) fail('Invalid payment status');
  const payment = await repo.updateStatus(merchantId, id, status);
  if (!payment) fail('Payment not found', 404);
  return payment;
};
