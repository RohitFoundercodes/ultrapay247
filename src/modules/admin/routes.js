const router = require('express').Router();
const controller = require('./controller');
const merchantRoutes = require('../merchant/routes');
const ticketRoutes = require('../ticket/admin-routes');
const auth = require('../../middlewares/auth');
const requireAdmin = require('../../middlewares/require-admin');

router.post('/login', controller.login);
router.use(auth, requireAdmin);
router.use('/merchants', merchantRoutes);
router.use('/tickets', ticketRoutes);

module.exports = router;
