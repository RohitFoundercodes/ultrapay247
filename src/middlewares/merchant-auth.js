const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const merchantRepository = require('../modules/merchant/repository');

function unauthorized(res) {
  return res.status(401).json({ error: 'Merchant authentication required' });
}

function attachMerchant(req, merchant) {
  if (!merchant || merchant.status !== 'active') return false;
  req.user = {
    id: merchant.id,
    role: 'merchant',
    payinEnabled: Boolean(merchant.payin_enabled),
    payoutEnabled: Boolean(merchant.payout_enabled)
  };
  return true;
}

module.exports = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) return unauthorized(res);

    let claims;
    try {
      claims = jwt.verify(match[1], process.env.JWT_SECRET);
    } catch (error) {
      return unauthorized(res);
    }

    if (claims.role && claims.role !== 'merchant') {
      return res.status(403).json({ error: 'Merchant access required' });
    }

    try {
      const merchant = await merchantRepository.findForAuthentication(claims.id);
      if (!attachMerchant(req, merchant)) return unauthorized(res);
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const merchantCode = req.headers['x-merchant-id'];
  const token = req.headers['x-merchant-token'];
  if (typeof merchantCode !== 'string' || typeof token !== 'string') return unauthorized(res);

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const merchant = await merchantRepository.findByCodeAndTokenHash(merchantCode, tokenHash);
    if (!attachMerchant(req, merchant)) return unauthorized(res);
    return next();
  } catch (error) {
    return next(error);
  }
};
