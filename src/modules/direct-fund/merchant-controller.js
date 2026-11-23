const service = require('./service');

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    res.json(await service.listMerchant(req.user.id, req.query));
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await service.getMerchantById(req.user.id, req.params.requestId));
  } catch (error) {
    next(error);
  }
};
