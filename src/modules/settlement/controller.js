const service = require('./service');

exports.list = async (req, res, next) => {
  try {
    res.json(await service.list(req.query));
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

exports.dailyList = async (req, res, next) => {
  try {
    res.json(await service.dailyList(req.query));
  } catch (error) {
    next(error);
  }
};

exports.dailyStats = async (req, res, next) => {
  try {
    res.json(await service.dailyStats(req.query));
  } catch (error) {
    next(error);
  }
};

exports.exportDailyCsv = async (req, res, next) => {
  try {
    const csv = await service.exportDailyCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="daily-settlements.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.settlementId));
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.body, req.user.id));
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    res.json(await service.update(req.params.settlementId, req.body, req.user.id));
  } catch (error) {
    next(error);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const csv = await service.exportCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="merchant-settlements.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
};
