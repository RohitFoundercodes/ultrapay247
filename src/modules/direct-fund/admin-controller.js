const service = require('./service');

exports.list = async (req, res, next) => {
  try {
    res.json(await service.listAdmin(req.query));
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await service.getAdminById(req.params.requestId));
  } catch (error) {
    next(error);
  }
};

exports.review = async (req, res, next) => {
  try {
    res.json(await service.review(req.params.requestId, req.body));
  } catch (error) {
    next(error);
  }
};
