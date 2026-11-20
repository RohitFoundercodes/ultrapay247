const router = require('express').Router();
const controller = require('./controller');

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:merchantId/ledger', controller.getLedger);
router.post('/:merchantId/ledger', controller.createLedgerEntry);
router.post('/:merchantId/token/reset', controller.resetToken);
router.patch('/:merchantId/status', controller.updateStatus);
router.patch('/:merchantId/details', controller.updateDetails);
router.patch('/:merchantId', controller.update);
router.get('/:merchantId', controller.getByCode);

module.exports = router;
