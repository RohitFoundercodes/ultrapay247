const router = require('express').Router();
const controller = require('./controller');

router.get('/reasons', controller.reasons);
router.get('/stats', controller.statsAdmin);
router.get('/', controller.listAdmin);
router.get('/:disputeId', controller.getAdmin);
router.patch('/:disputeId/status', controller.updateStatus);

module.exports = router;
