const service = require('./service');

exports.login = async (req, res, next) => {
  try {
    res.json(await service.login(req.body || {}));
  } catch (error) {
    next(error);
  }
};
