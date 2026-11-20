const router = require('express').Router();
const ctrl = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');

router.post('/register',ctrl.register);
router.post('/login',ctrl.login);
router.get('/me', merchantAuth, ctrl.me);

module.exports = router;
