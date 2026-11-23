const router = require('express').Router();
const controller = require('./admin-controller');

router.get('/', controller.list);
router.get('/:requestId', controller.getById);
router.patch('/:requestId/status', controller.review);

module.exports = router;
