const router = require('express').Router();
const controller = require('./merchant-controller');
const merchantAuth = require('../../middlewares/merchant-auth');
const requirePayout = require('../../middlewares/require-payout');

router.use(merchantAuth, requirePayout);
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:requestId', controller.getById);

module.exports = router;
