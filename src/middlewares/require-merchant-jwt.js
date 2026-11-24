module.exports = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) {
    return res.status(401).json({ error: 'Merchant JWT authentication required' });
  }
  next();
};
