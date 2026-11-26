const service = require('./service');

exports.getDashboard = async (req, res, next) => {
  try {
    res.json(await service.getDashboard(req.user.id, req.query));
  } catch (error) {
    next(error);
  }
};

exports.getAdminDashboard = async (req, res, next) => {
  try {
    res.json(await service.getAdminDashboard());
  } catch (error) {
    next(error);
  }
};
