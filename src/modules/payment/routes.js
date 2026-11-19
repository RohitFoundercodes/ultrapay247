const router = require('express').Router();
const ctrl = require('./controller');
const auth = require('../../middlewares/auth');

router.use(auth);
router.post('/', ctrl.create);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.patch('/:id/status', ctrl.updateStatus);

module.exports = router;
