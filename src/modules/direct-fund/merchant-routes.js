const router = require('express').Router();
const controller = require('./merchant-controller');
const merchantAuth = require('../../middlewares/merchant-auth');

router.use(merchantAuth);
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:requestId', controller.getById);

module.exports = router;
