module.exports = (req, res, next) => {
  if (!req.user.payoutEnabled) {
    return res.status(403).json({ error: 'Payout is disabled for this merchant' });
  }
  next();
};
