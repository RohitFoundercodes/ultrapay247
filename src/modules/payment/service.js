const repo = require('./repository');

const allowedStatuses = new Set(['pending', 'succeeded', 'failed', 'refunded']);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

exports.create = async (merchantId, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('A payin request object is required');
  }

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    fail('A valid positive amount with at most two decimal places is required');
  }
  if (typeof data.reference !== 'string' || !data.reference.trim() ||
      data.reference.trim().length > 100) {
    fail('Payment reference is required and must be at most 100 characters');
  }

  if (data.currency !== undefined && typeof data.currency !== 'string') {
    fail('Currency must be a three-letter code');
  }
  const currency = (data.currency || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('Currency must be a three-letter code');

  const optionalString = (value, label, maxLength) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maxLength) {
      fail(`${label} must be at most ${maxLength} characters`);
    }
    return value.trim() || null;
  };
  let gatewayAccountId = null;
  if (data.gatewayAccountId !== undefined && data.gatewayAccountId !== null) {
    const value = String(data.gatewayAccountId);
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      fail('Gateway account ID is invalid');
    }
    gatewayAccountId = Number(value);
  }
  const customerEmail = optionalString(data.customerEmail, 'Customer email', 150);
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    fail('Customer email is invalid');
  }

  try {
    return await repo.create({
      merchantId,
      reference: data.reference.trim(),
      orderId: optionalString(data.orderId, 'Order ID', 100) || data.reference.trim(),
      gatewayAccountId,
      providerName: optionalString(data.providerName, 'Provider name', 100),
      paymentId: optionalString(data.paymentId, 'Payment ID', 100),
      amount: Math.round(amount * 100) / 100,
      currency,
      customerEmail,
      description: optionalString(data.description, 'Description', 255)
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') fail('Payment reference already exists', 409);
    throw error;
  }
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
