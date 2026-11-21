const router = require('express').Router();
const ctrl = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');
const { loginRateLimit, registrationRateLimit } = require('../../middlewares/rate-limit');

router.post('/register', registrationRateLimit, ctrl.register);
router.post('/login', loginRateLimit, ctrl.login);
router.get('/me', merchantAuth, ctrl.me);

module.exports = router;
