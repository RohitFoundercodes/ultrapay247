const service = require('./service');

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.listMerchant = async (req, res, next) => {
  try {
    res.json(await service.listMerchant(req.user.id));
  } catch (error) {
    next(error);
  }
};

exports.getMerchantById = async (req, res, next) => {
  try {
    res.json(await service.getMerchantById(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    res.json(await service.list(req.query));
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.id));
  } catch (error) {
    next(error);
  }
};

exports.stats = async (req, res, next) => {
  try {
    res.json(await service.stats(req.query));
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(await service.updateStatus(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const csv = await service.exportCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payout-transactions.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
};
