const router = require('express').Router();
const controller = require('./controller');

router.get('/stats', controller.stats);
router.get('/export.csv', controller.exportCsv);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:settlementId', controller.getById);
router.patch('/:settlementId/status', controller.update);

module.exports = router;
