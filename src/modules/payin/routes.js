const router = require('express').Router();
const controller = require('./controller');

router.get('/transactions', controller.list);
router.get('/transactions/:id', controller.getById);
router.get('/stats', controller.stats);
router.get('/export.csv', controller.exportCsv);

module.exports = router;
