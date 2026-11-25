const service = require('./service');

exports.login = async (req, res, next) => {
  try {
    res.json(await service.login(req.body || {}, { ipAddress: req.ip || null }));
  } catch (error) {
    next(error);
  }
};

exports.getLoginLogs = async (req, res, next) => {
  try {
    res.json(await service.getLoginLogs(req.query));
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    res.json(await service.changePassword(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};
