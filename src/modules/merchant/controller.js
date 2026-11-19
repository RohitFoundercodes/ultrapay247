const service = require('./service');

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.body));
  } catch (error) {
    next(error);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    res.json({ merchants: await service.getAll() });
  } catch (error) {
    next(error);
  }
};

exports.getByCode = async (req, res, next) => {
  try {
    res.json(await service.getByCode(req.params.merchantId));
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    res.json(await service.updateByCode(req.params.merchantId, req.body));
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(await service.updateByCode(req.params.merchantId, { status: req.body.status }));
  } catch (error) {
    next(error);
  }
};

exports.resetToken = async (req, res, next) => {
  try {
    res.json(await service.resetToken(req.params.merchantId));
  } catch (error) {
    next(error);
  }
};

exports.getLedger = async (req, res, next) => {
  try {
    res.json({ entries: await service.getLedger(req.params.merchantId) });
  } catch (error) {
    next(error);
  }
};

exports.createLedgerEntry = async (req, res, next) => {
  try {
    res.status(201).json(await service.createLedgerEntry(req.params.merchantId, req.body));
  } catch (error) {
    next(error);
  }
};
