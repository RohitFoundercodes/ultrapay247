const router = require('express').Router();
const controller = require('./controller');

router.get('/stats', controller.stats);
router.get('/transactions', controller.list);
router.get('/transactions/:id', controller.getById);
router.patch('/transactions/:id/status', controller.updateStatus);
router.get('/export.csv', controller.exportCsv);

module.exports = router;
