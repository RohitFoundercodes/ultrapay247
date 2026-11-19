const service = require('./service');

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    res.json(await service.getAll(req.user.id));
  } catch (error) {
    next(error);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    res.json(await service.getOne(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(await service.updateStatus(req.user.id, req.params.id, req.body.status));
  } catch (error) {
    next(error);
  }
};
