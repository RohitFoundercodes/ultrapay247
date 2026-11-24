const router = require('express').Router();
const controller = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');

router.use(merchantAuth);
router.get('/', controller.getDashboard);

module.exports = router;
