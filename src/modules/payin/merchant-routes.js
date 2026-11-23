const router = require('express').Router();
const controller = require('../payment/controller');
const payinController = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');
const requirePayin = require('../../middlewares/require-payin');

router.use(merchantAuth);
router.post('/request', requirePayin, controller.create);
router.get('/request', payinController.listMerchant);
router.get('/request/:id', controller.getOne);

module.exports = router;
