const service = require('./service');

exports.list = async (req, res, next) => {
  try {
    res.json(await service.list(req.query));
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.body));
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.gatewayId));
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    res.json(await service.update(req.params.gatewayId, req.body));
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(await service.updateStatus(
      req.params.gatewayId,
      req.body && req.body.status
    ));
  } catch (error) {
    next(error);
  }
};
