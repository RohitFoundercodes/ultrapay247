const { createController } = require('./controller');

module.exports = (recipientType) => {
  const router = require('express').Router();
  const controller = createController(recipientType);
  router.get('/', controller.list);
  router.patch('/read-all', controller.markAllRead);
  router.patch('/:id/read', controller.markRead);
  return router;
};
