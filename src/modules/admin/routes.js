const router = require('express').Router();
const controller = require('./controller');
const merchantRoutes = require('../merchant/routes');
const ticketRoutes = require('../ticket/admin-routes');
const gatewayRoutes = require('../gateway/routes');
const payinRoutes = require('../payin/routes');
const payoutRoutes = require('../payout/admin-routes');
const directFundRoutes = require('../direct-fund/admin-routes');
const disputeRoutes = require('../dispute/admin-routes');
const auth = require('../../middlewares/auth');
const requireAdmin = require('../../middlewares/require-admin');
const { loginRateLimit } = require('../../middlewares/rate-limit');

router.post('/login', loginRateLimit, controller.login);
router.use(auth, requireAdmin);
router.patch('/change-password', controller.changePassword);
router.use('/merchants', merchantRoutes);
router.use('/tickets', ticketRoutes);
router.use('/gateways', gatewayRoutes);
router.use('/payin', payinRoutes);
router.use('/payout', payoutRoutes);
router.use('/direct-fund-requests', directFundRoutes);
router.use('/disputes', disputeRoutes);

module.exports = router;
