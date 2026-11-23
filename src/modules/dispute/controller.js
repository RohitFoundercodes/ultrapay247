const service = require('./service');

exports.createMerchant = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.listMerchant = async (req, res, next) => {
  try {
    res.json(await service.listMerchant(req.user.id, req.query));
  } catch (error) {
    next(error);
  }
};

exports.getMerchant = async (req, res, next) => {
  try {
    res.json(await service.getMerchantById(req.user.id, req.params.disputeId));
  } catch (error) {
    next(error);
  }
};

exports.reasons = (req, res) => res.json(service.getReasons());

exports.listAdmin = async (req, res, next) => {
  try {
    res.json(await service.listAdmin(req.query));
  } catch (error) {
    next(error);
  }
};

exports.statsAdmin = async (req, res, next) => {
  try {
    res.json(await service.getAdminStats(req.query));
  } catch (error) {
    next(error);
  }
};

exports.getAdmin = async (req, res, next) => {
  try {
    res.json(await service.getAdminById(req.params.disputeId));
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(await service.updateStatus(req.params.disputeId, req.body, req.user.id));
  } catch (error) {
    next(error);
  }
};
