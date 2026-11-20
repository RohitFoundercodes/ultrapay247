const router = require('express').Router();
const controller = require('./controller');

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:gatewayId', controller.getById);
router.patch('/:gatewayId/status', controller.updateStatus);
router.patch('/:gatewayId', controller.update);

module.exports = router;
