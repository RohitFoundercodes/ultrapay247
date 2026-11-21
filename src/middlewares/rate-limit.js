const { rateLimit } = require('express-rate-limit');

function createLimiter(limit, windowMs) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests. Please try again later.'
      });
    }
  });
}

exports.apiRateLimit = createLimiter(120, 15 * 60 * 1000);
exports.loginRateLimit = createLimiter(10, 15 * 60 * 1000);
exports.registrationRateLimit = createLimiter(5, 60 * 60 * 1000);
