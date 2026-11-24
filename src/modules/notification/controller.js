const service = require('./service');

function createController(recipientType) {
  return {
    list: async (req, res, next) => {
      try {
        res.json(await service.list(recipientType, req.user.id, req.query));
      } catch (error) {
        next(error);
      }
    },
    markRead: async (req, res, next) => {
      try {
        res.json(await service.markRead(recipientType, req.user.id, req.params.id));
      } catch (error) {
        next(error);
      }
    },
    markAllRead: async (req, res, next) => {
      try {
        res.json(await service.markAllRead(recipientType, req.user.id));
      } catch (error) {
        next(error);
      }
    }
  };
}

module.exports = { createController };
