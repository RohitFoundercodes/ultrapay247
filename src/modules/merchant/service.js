const crypto = require('crypto');
const repository = require('./repository');
const { hash } = require('../../utils/hash');
const { encrypt, decrypt } = require('../../utils/encryption');
const { toKolkataIso } = require('../../utils/time');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function requiredString(data, key, label, maxLength) {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    invalid(`${label} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function percentage(value, label) {
  const amount = value === undefined ? 0 : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
    invalid(`${label} must be a number between 0 and 100`);
  }
  return Number(amount.toFixed(2));
}

function money(value, label, defaultValue = 0) {
  const amount = value === undefined ? defaultValue : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    invalid(`${label} must be a non-negative amount with at most two decimal places`);
  }
  return Math.round(amount * 100) / 100;
}

function optionalBoolean(value, label, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') invalid(`${label} must be true or false`);
  return value;
}

function present(row) {
  return {
    id: row.id,
    merchantId: row.merchant_code,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    companyName: row.company_name,
    status: row.status,
    payinEnabled: Boolean(row.payin_enabled),
    payoutEnabled: Boolean(row.payout_enabled),
    payinCommission: Number(row.payin_commission),
    payoutCommission: Number(row.payout_commission),
    directFundCommissionEnabled: Boolean(row.direct_fund_commission_enabled),
    merchantTokenMasked: row.merchant_token_last4
      ? `up_live_********${row.merchant_token_last4}`
      : null,
    walletBalance: Number(row.wallet_balance || 0),
    totalCommission: Number(row.total_commission || 0),
    createdAt: toKolkataIso(row.created_at),
    updatedAt: toKolkataIso(row.updated_at),
    detailsCreatedAt: toKolkataIso(row.details_created_at),
    detailsUpdatedAt: toKolkataIso(row.details_updated_at)
  };
}

function normalizeUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A merchant update object is required');
  }

  const allowedFields = new Set([
    'name', 'mobile', 'email', 'companyName', 'bankName', 'ifsc',
    'accountNumber', 'aadhaarCard', 'panCard', 'gstin', 'status',
    'payinEnabled', 'payoutEnabled', 'payinCommission', 'payoutCommission',
    'directFundCommissionEnabled'
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) invalid(`Field ${field} cannot be updated`);
  }
  if (!Object.keys(input).length) invalid('At least one field must be provided');

  const merchantUpdates = {};
  const detailUpdates = {};
  if (input.name !== undefined) merchantUpdates.name = requiredString(input, 'name', 'Name', 100);
  if (input.email !== undefined) {
    const email = requiredString(input, 'email', 'Email', 150).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Email address is invalid');
    merchantUpdates.email = email;
  }
  if (input.status !== undefined) {
    if (!['active', 'inactive', 'suspended'].includes(input.status)) {
      invalid('Status must be active, inactive, or suspended');
    }
    merchantUpdates.status = input.status;
  }
  if (input.mobile !== undefined) {
    const mobile = requiredString(input, 'mobile', 'Mobile', 20).replace(/[\s()-]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(mobile)) invalid('Mobile number is invalid');
    detailUpdates.mobile = mobile;
  }
  if (input.companyName !== undefined) {
    detailUpdates.companyName = requiredString(input, 'companyName', 'Company name', 150);
  }
  if (input.bankName !== undefined) {
    detailUpdates.bankName = requiredString(input, 'bankName', 'Bank name', 120);
  }
  if (input.ifsc !== undefined) {
    const ifsc = requiredString(input, 'ifsc', 'IFSC', 11).toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) invalid('IFSC code is invalid');
    detailUpdates.ifsc = ifsc;
  }
  if (input.accountNumber !== undefined) {
    const accountNumber = requiredString(input, 'accountNumber', 'Account number', 20);
    if (!/^[0-9]{6,20}$/.test(accountNumber)) invalid('Account number is invalid');
    detailUpdates.accountNumberEncrypted = encrypt(accountNumber);
  }
  if (input.aadhaarCard !== undefined) {
    const aadhaar = requiredString(input, 'aadhaarCard', 'Aadhaar number', 20).replace(/\s|-/g, '');
    if (!/^[0-9]{12}$/.test(aadhaar)) invalid('Aadhaar number must contain 12 digits');
    detailUpdates.aadhaarEncrypted = encrypt(aadhaar);
  }
  if (input.panCard !== undefined) {
    const pan = requiredString(input, 'panCard', 'PAN number', 10).toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) invalid('PAN number is invalid');
    detailUpdates.panEncrypted = encrypt(pan);
  }
  if (input.gstin !== undefined) {
    if (input.gstin !== null && typeof input.gstin !== 'string') invalid('GSTIN must be a string');
    const gstin = typeof input.gstin === 'string' ? input.gstin.trim().toUpperCase() : '';
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) invalid('GSTIN is invalid');
    detailUpdates.gstin = gstin || null;
  }
  if (input.payinEnabled !== undefined) {
    detailUpdates.payinEnabled = optionalBoolean(input.payinEnabled, 'Payin enabled');
  }
  if (input.payoutEnabled !== undefined) {
    detailUpdates.payoutEnabled = optionalBoolean(input.payoutEnabled, 'Payout enabled');
  }
  if (input.payinCommission !== undefined) {
    detailUpdates.payinCommission = percentage(input.payinCommission, 'Payin commission');
  }
  if (input.payoutCommission !== undefined) {
    detailUpdates.payoutCommission = percentage(input.payoutCommission, 'Payout commission');
  }
  if (input.directFundCommissionEnabled !== undefined) {
    detailUpdates.directFundCommissionEnabled = optionalBoolean(
      input.directFundCommissionEnabled,
      'Direct fund commission enabled'
    );
  }

  return { merchantUpdates, detailUpdates };
}

exports.create = async (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A merchant details object is required');
  }

  const name = requiredString(input, 'name', 'Name', 100);
  const mobile = requiredString(input, 'mobile', 'Mobile', 20).replace(/[\s()-]/g, '');
  const email = requiredString(input, 'email', 'Email', 150).toLowerCase();
  const companyName = requiredString(input, 'companyName', 'Company name', 150);
  const bankName = requiredString(input, 'bankName', 'Bank name', 120);
  const ifsc = requiredString(input, 'ifsc', 'IFSC', 11).toUpperCase();
  const accountNumber = requiredString(input, 'accountNumber', 'Account number', 20);
  const aadhaarCard = requiredString(input, 'aadhaarCard', 'Aadhaar number', 20).replace(/\s|-/g, '');
  const panCard = requiredString(input, 'panCard', 'PAN number', 10).toUpperCase();
  if (input.gstin !== undefined && input.gstin !== null && typeof input.gstin !== 'string') {
    invalid('GSTIN must be a string');
  }
  const gstin = typeof input.gstin === 'string' && input.gstin.trim()
    ? input.gstin.trim().toUpperCase()
    : null;
  const status = input.status === undefined ? 'active' : input.status;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Email address is invalid');
  if (!/^\+?[0-9]{7,15}$/.test(mobile)) invalid('Mobile number is invalid');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) invalid('IFSC code is invalid');
  if (!/^[0-9]{6,20}$/.test(accountNumber)) invalid('Account number is invalid');
  if (!/^[0-9]{12}$/.test(aadhaarCard)) invalid('Aadhaar number must contain 12 digits');
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panCard)) invalid('PAN number is invalid');
  if (gstin && (gstin.length > 15 || !/^[0-9A-Z]{15}$/.test(gstin))) invalid('GSTIN is invalid');
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    invalid('Status must be active, inactive, or suspended');
  }

  const payinEnabled = optionalBoolean(input.payinEnabled, 'Payin enabled', true);
  const payoutEnabled = optionalBoolean(input.payoutEnabled, 'Payout enabled', true);
  const directFundCommissionEnabled = optionalBoolean(
    input.directFundCommissionEnabled,
    'Direct fund commission enabled',
    false
  );
  const payinCommission = percentage(input.payinCommission, 'Payin commission');
  const payoutCommission = percentage(input.payoutCommission, 'Payout commission');

  const merchantCode = `MRC_${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  const merchantToken = `up_live_${crypto.randomBytes(32).toString('hex')}`;
  const merchantTokenLast4 = merchantToken.slice(-4);
  const temporaryPassword = crypto.randomBytes(24).toString('base64url');
  const passwordHash = await hash(temporaryPassword);
  const merchantTokenHash = crypto.createHash('sha256').update(merchantToken).digest('hex');

  let merchant;
  try {
    merchant = await repository.create({
      name,
      email,
      passwordHash,
      status,
      mobile,
      companyName,
      bankName,
      ifsc,
      accountNumberEncrypted: encrypt(accountNumber),
      aadhaarEncrypted: encrypt(aadhaarCard),
      panEncrypted: encrypt(panCard),
      gstin,
      merchantCode,
      merchantTokenHash,
      merchantTokenLast4,
      payinEnabled,
      payoutEnabled,
      payinCommission,
      payoutCommission,
      directFundCommissionEnabled
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const conflict = new Error('A merchant with this email already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }

  return {
    merchant: {
      ...present({
        id: merchant.id,
        merchant_code: merchantCode,
        name,
        mobile,
        email,
        company_name: companyName,
        status,
        payin_enabled: payinEnabled,
        payout_enabled: payoutEnabled,
        payin_commission: payinCommission,
        payout_commission: payoutCommission,
        direct_fund_commission_enabled: directFundCommissionEnabled,
        merchant_token_last4: merchantTokenLast4,
        wallet_balance: 0,
        total_commission: 0,
        created_at: merchant.created_at,
        updated_at: merchant.updated_at,
        details_created_at: merchant.details_created_at,
        details_updated_at: merchant.details_updated_at
      }),
      bankName,
      ifsc,
      accountNumber,
      aadhaarCard,
      panCard,
      gstin
    },
    credentials: { merchantToken, temporaryPassword }
  };
};

exports.getAll = async () => {
  const rows = await repository.getAll();
  return rows.map(present);
};

exports.getByCode = async (merchantCode) => {
  const row = await repository.getByCode(merchantCode);
  if (!row) {
    const error = new Error('Merchant not found');
    error.status = 404;
    throw error;
  }

  return {
    ...present(row),
    bankName: row.bank_name,
    ifsc: row.ifsc,
    accountNumber: decrypt(row.account_number_encrypted),
    aadhaarCard: decrypt(row.aadhaar_encrypted),
    panCard: decrypt(row.pan_encrypted),
    gstin: row.gstin
  };
};

exports.updateByCode = async (merchantCode, input) => {
  const { merchantUpdates, detailUpdates } = normalizeUpdate(input);
  try {
    const updated = await repository.updateByCode(merchantCode, merchantUpdates, detailUpdates);
    if (!updated) {
      const error = new Error('Merchant not found');
      error.status = 404;
      throw error;
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const conflict = new Error('A merchant with this email already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
  return exports.getByCode(merchantCode);
};

exports.resetToken = async (merchantCode) => {
  const merchantToken = `up_live_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(merchantToken).digest('hex');
  const updated = await repository.resetToken(merchantCode, tokenHash, merchantToken.slice(-4));
  if (!updated) {
    const error = new Error('Merchant not found');
    error.status = 404;
    throw error;
  }
  const merchant = await exports.getByCode(merchantCode);
  return { merchantId: merchantCode, merchantToken, updatedAt: merchant.updatedAt };
};

function presentLedgerEntry(row) {
  return {
    id: row.id,
    type: row.entry_type,
    amount: Number(row.amount),
    commissionAmount: Number(row.commission_amount),
    balanceAfter: Number(row.balance_after),
    reference: row.reference,
    description: row.description,
    createdAt: toKolkataIso(row.created_at)
  };
}

exports.getLedger = async (merchantCode) => {
  const merchant = await repository.getByCode(merchantCode);
  if (!merchant) {
    const error = new Error('Merchant not found');
    error.status = 404;
    throw error;
  }
  return (await repository.getLedger(merchantCode)).map(presentLedgerEntry);
};

exports.createLedgerEntry = async (merchantCode, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A wallet ledger entry object is required');
  }
  const type = input.type;
  if (!['credit', 'debit', 'commission'].includes(type)) {
    invalid('Type must be credit, debit, or commission');
  }
  const reference = requiredString(input, 'reference', 'Reference', 100);
  if (input.description !== undefined && input.description !== null &&
      typeof input.description !== 'string') {
    invalid('Description must be a string');
  }
  const description = typeof input.description === 'string' ? input.description.trim() || null : null;
  if (description && description.length > 255) invalid('Description must be at most 255 characters');

  const amount = money(input.amount, 'Amount');
  const commissionAmount = money(input.commissionAmount, 'Commission amount');
  if (type === 'commission' ? commissionAmount <= 0 || amount !== 0 : amount <= 0) {
    invalid(type === 'commission'
      ? 'Commission entries require amount 0 and a positive commissionAmount'
      : 'Credit and debit entries require a positive amount');
  }

  try {
    const row = await repository.createLedgerEntry(merchantCode, {
      type, amount, commissionAmount, reference, description
    });
    if (!row) {
      const error = new Error('Merchant not found');
      error.status = 404;
      throw error;
    }
    return presentLedgerEntry(row);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const conflict = new Error('A ledger entry already exists with this reference');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
};
