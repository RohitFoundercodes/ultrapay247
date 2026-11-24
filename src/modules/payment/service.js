const repo = require('./repository');
const gatewayService = require('../gateway/service');
const createTrustpay24Payin = require('../gateway/trustpay24');

const allowedStatuses = new Set(['pending', 'succeeded', 'failed', 'refunded']);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function normalizeTrustpay24Request(data, account, reference, description, currency) {
  if (currency !== 'INR') fail('TrustPay24 payins must use INR');

  if (typeof data.method !== 'string' || !data.method.trim() || data.method.trim().length > 40) {
    fail('Payment method is required for TrustPay24');
  }
  const method = data.method.trim().toUpperCase();
  if (!account.paymentMethods.some(value => String(value).toUpperCase() === method)) {
    fail('Payment method is not enabled for this gateway account');
  }

  if (!data.payer || typeof data.payer !== 'object' || Array.isArray(data.payer)) {
    fail('Payer details are required for TrustPay24');
  }
  const name = data.payer.name;
  const phone = data.payer.phone;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) {
    fail('Payer name is required and must be at most 150 characters');
  }
  if (typeof phone !== 'string' || !/^\+?[0-9]{8,15}$/.test(phone.trim())) {
    fail('Payer phone must contain 8-15 digits, optionally prefixed with +');
  }

  if (typeof data.returnUrl !== 'string' || !data.returnUrl.trim() ||
      data.returnUrl.trim().length > 2048) {
    fail('A valid HTTPS return URL is required for TrustPay24');
  }
  let returnUrl;
  try {
    returnUrl = new URL(data.returnUrl.trim());
  } catch (error) {
    fail('A valid HTTPS return URL is required for TrustPay24');
  }
  if (returnUrl.protocol !== 'https:' || returnUrl.username || returnUrl.password) {
    fail('A valid HTTPS return URL is required for TrustPay24');
  }

  const expiresInSec = data.expiresInSec === undefined ? 900 : Number(data.expiresInSec);
  if (!Number.isSafeInteger(expiresInSec) || expiresInSec < 1 || expiresInSec > 86400) {
    fail('expiresInSec must be an integer between 1 and 86400');
  }
  const narration = data.narration === undefined ? (description || reference) : data.narration;
  if (typeof narration !== 'string' || !narration.trim() || narration.trim().length > 255) {
    fail('Narration is required and must be at most 255 characters');
  }

  return {
    method,
    payer: { name: name.trim(), phone: phone.trim() },
    returnUrl: returnUrl.toString(),
    expiresInSec,
    narration: narration.trim()
  };
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

  const gatewayAccount = gatewayAccountId
    ? await gatewayService.getPayinIntegrationAccount(gatewayAccountId)
    : null;
  if (data.currency !== undefined && typeof data.currency !== 'string') {
    fail('Currency must be a three-letter code');
  }
  const defaultCurrency = gatewayAccount && gatewayAccount.code === 'TRUSTPAY24' ? 'INR' : 'USD';
  const currency = (data.currency || defaultCurrency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('Currency must be a three-letter code');
  await repo.validateLimits(merchantId, amount, currency);

  const customerEmail = optionalString(data.customerEmail, 'Customer email', 150);
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    fail('Customer email is invalid');
  }

  const reference = data.reference.trim();
  const orderId = optionalString(data.orderId, 'Order ID', 100) || reference;
  const providerName = optionalString(data.providerName, 'Provider name', 100);
  const paymentId = optionalString(data.paymentId, 'Payment ID', 100);
  const description = optionalString(data.description, 'Description', 255);
  let providerResponse;
  let providerPaymentId = paymentId;

  if (gatewayAccount && gatewayAccount.code === 'TRUSTPAY24') {
    const request = normalizeTrustpay24Request(
      data, gatewayAccount, reference, description, currency
    );
    providerResponse = await createTrustpay24Payin({
      reference,
      amount: Math.round(amount * 100) / 100,
      method: request.method,
      payer: request.payer,
      returnUrl: request.returnUrl,
      expiresInSec: request.expiresInSec,
      narration: request.narration
    });
    if (!providerPaymentId) {
      const remoteId = providerResponse.paymentId || providerResponse.id;
      if (typeof remoteId === 'string' || typeof remoteId === 'number') {
        providerPaymentId = String(remoteId);
      }
    }
  }

  try {
    const payment = await repo.create({
      merchantId,
      reference,
      orderId,
      gatewayAccountId,
      providerName,
      paymentId: providerPaymentId,
      amount: Math.round(amount * 100) / 100,
      currency,
      customerEmail,
      description
    });
    return providerResponse ? { ...payment, gatewayResponse: providerResponse } : payment;
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
