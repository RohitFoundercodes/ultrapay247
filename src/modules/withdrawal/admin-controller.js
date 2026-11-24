const service = require('./service');

exports.list = async (req, res, next) => {
  try {
    res.json(await service.listAdmin(req.query));
  } catch (error) {
    next(error);
  }
};

exports.review = async (req, res, next) => {
  try {
    res.json(await service.review(req.params.requestId, req.body, req.user.id));
  } catch (error) {
    next(error);
  }
};
