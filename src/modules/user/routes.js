const router = require('express').Router();
const ctrl = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');
const { loginRateLimit, registrationRateLimit } = require('../../middlewares/rate-limit');

router.post('/register', registrationRateLimit, ctrl.register);
router.post('/login', loginRateLimit, ctrl.login);
router.get('/me', merchantAuth, ctrl.me);
router.patch('/me', merchantAuth, ctrl.updateMe);
router.patch('/change-password', merchantAuth, ctrl.changePassword);

module.exports = router;
