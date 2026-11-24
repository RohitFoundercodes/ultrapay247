const repo = require('./repository');
const merchantService = require('../merchant/service');
const { hash, compare } = require('../../utils/hash');
const { generate } = require('../../utils/jwt');
const passwordChange = require('../../utils/password-change');

function normalizeDevice(input) {
  const hasDeviceId = input.deviceId !== undefined && input.deviceId !== null;
  const hasDeviceName = input.deviceName !== undefined && input.deviceName !== null;
  if (!hasDeviceId && !hasDeviceName) return { deviceId: null, deviceName: null };
  if (!hasDeviceId || !hasDeviceName) {
    const error = new Error('Device ID and device name must be provided together');
    error.status = 400;
    throw error;
  }
  if (typeof input.deviceId !== 'string' || !input.deviceId.trim() ||
      input.deviceId.trim().length > 128) {
    const error = new Error('Device ID is required and must be at most 128 characters');
    error.status = 400;
    throw error;
  }
  if (typeof input.deviceName !== 'string' || !input.deviceName.trim() ||
      input.deviceName.trim().length > 120) {
    const error = new Error('Device name is required and must be at most 120 characters');
    error.status = 400;
    throw error;
  }
  return {
    deviceId: input.deviceId.trim(),
    deviceName: input.deviceName.trim()
  };
}

exports.register = async(data)=>{

  if (!data.name || !data.email || !data.password) {
    const error = new Error('Name, email and password are required');
    error.status = 400;
    throw error;
  }
  data.password = await hash(data.password);
  const user = await repo.create(data);
  return {token:generate({id:user.id, role:'merchant'})};
};

exports.login = async(data)=>{
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.email !== 'string' || typeof data.password !== 'string' ||
      !data.email.trim() || !data.password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }
  const device = normalizeDevice(data);
  const user = await repo.findByEmail(data.email.trim().toLowerCase());
  if(!user || user.status !== 'active' || !user.password) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }
  const ok = await compare(data.password,user.password);
  if(!ok) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }
  await repo.createLoginLog(user.id, device);
  return {
    token: generate({ id: user.id, role: 'merchant' }),
    tokenType: 'Bearer',
    expiresIn: '7d',
    merchant: {
      id: user.id,
      merchantId: user.merchant_code || null,
      name: user.name,
      email: user.email,
      mobile: user.mobile || null,
      companyName: user.company_name || null,
      status: user.status,
      payinEnabled: Boolean(user.payin_enabled),
      payoutEnabled: Boolean(user.payout_enabled)
    }
  };
};

exports.updateProfile = async (merchantId, input) =>
  merchantService.updateProfile(merchantId, input);

exports.getProfileById = async (merchantId) =>
  merchantService.getProfileById(merchantId);

exports.changePassword = async (merchantId, input) => {
  const { currentPassword, newPassword } = passwordChange.normalize(input);
  const currentHash = await repo.getPasswordHash(merchantId);
  if (!currentHash || !(await compare(currentPassword, currentHash))) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }
  if (await compare(newPassword, currentHash)) {
    const error = new Error('New password must be different from the current password');
    error.status = 400;
    throw error;
  }

  const updated = await repo.updatePasswordAndLog(
    merchantId,
    currentHash,
    await hash(newPassword)
  );
  if (!updated) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }
  return { message: 'Password changed successfully' };
};
