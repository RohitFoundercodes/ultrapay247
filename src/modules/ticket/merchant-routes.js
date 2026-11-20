const router = require('express').Router();
const controller = require('./controller');
const merchantAuth = require('../../middlewares/merchant-auth');

router.use(merchantAuth);
router.get('/', controller.listMerchant);
router.post('/', controller.createMerchant);
router.get('/:ticketId', controller.getMerchantTicket);
router.post('/:ticketId/messages', controller.replyMerchant);

module.exports = router;
