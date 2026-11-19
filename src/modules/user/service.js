const repo = require('./repository');
const {hash,compare} = require('../../utils/hash');
const {generate} = require('../../utils/jwt');

exports.register = async(data)=>{
  if (!data.name || !data.email || !data.password) {
    const error = new Error('Name, email and password are required');
    error.status = 400;
    throw error;
  }
  data.password = await hash(data.password);
  const user = await repo.create(data);
  return {token:generate({id:user.id})};
};

exports.login = async(data)=>{
  if (!data.email || !data.password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }
  const user = await repo.findByEmail(data.email);
  if(!user) {
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
  return {token:generate({id:user.id})};
};
