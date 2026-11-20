const router = require('express').Router();
const controller = require('./controller');

router.get('/stats', controller.stats);
router.get('/', controller.listAdmin);
router.get('/:ticketId', controller.getAdminTicket);
router.post('/:ticketId/messages', controller.replyAdmin);
router.patch('/:ticketId/status', controller.updateStatus);

module.exports = router;
