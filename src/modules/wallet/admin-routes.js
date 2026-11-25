const router = require('express').Router();
const controller = require('./admin-controller');

router.get('/summary', controller.getSummary);
router.get('/merchants', controller.getMerchants);
router.get('/transactions', controller.getTransactions);
router.get('/statement.csv', controller.getStatement);
router.post('/merchants/:merchantId/entries', controller.createEntry);

module.exports = router;
