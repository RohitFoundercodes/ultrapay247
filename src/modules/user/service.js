const repo = require('./repository');
const merchantService = require('../merchant/service');
const { hash, compare } = require('../../utils/hash');
const { generate } = require('../../utils/jwt');
const passwordChange = require('../../utils/password-change');

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

  const updated = await repo.updatePassword(
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
