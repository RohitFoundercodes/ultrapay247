const router = require('express').Router();
const ctrl = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');
const requirePayin = require('../../middlewares/require-payin');

router.use(merchantAuth);
router.post('/', requirePayin, ctrl.create);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.patch('/:id/status', ctrl.updateStatus);

module.exports = router;
