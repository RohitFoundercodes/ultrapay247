const repository = require('./repository');
const { hash, compare } = require('../../utils/hash');
const { generate } = require('../../utils/jwt');
const passwordChange = require('../../utils/password-change');

exports.login = async ({ email, password }) => {
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }

  const admin = await repository.findByEmail(email.trim().toLowerCase());
  if (!admin || admin.status !== 'active' || !(await compare(password, admin.password_hash))) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  return {
    token: generate({ id: admin.id, role: 'admin' }),
    admin: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' }
  };
};

exports.changePassword = async (adminId, input) => {
  const { currentPassword, newPassword } = passwordChange.normalize(input);
  const currentHash = await repository.getPasswordHash(adminId);
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

  const updated = await repository.updatePassword(
    adminId,
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
