const router = require('express').Router();
const controller = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');

router.use(merchantAuth);
router.get('/reasons', controller.reasons);
router.post('/', controller.createMerchant);
router.get('/', controller.listMerchant);
router.get('/:disputeId', controller.getMerchant);

module.exports = router;
