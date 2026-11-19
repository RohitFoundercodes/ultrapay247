const repository = require('./repository');
const { compare } = require('../../utils/hash');
const { generate } = require('../../utils/jwt');

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
