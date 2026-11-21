const router = require('express').Router();
const controller = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');
const requirePayout = require('../../middlewares/require-payout');

router.use(merchantAuth, requirePayout);
router.post('/', controller.create);
router.get('/', controller.listMerchant);
router.get('/:id', controller.getMerchantById);

module.exports = router;
