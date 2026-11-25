const service = require('./service');
const merchantService = require('../merchant/service');

exports.getSummary = async (req, res, next) => {
  try {
    res.json(await service.getSummary());
  } catch (error) {
    next(error);
  }
};

exports.getMerchants = async (req, res, next) => {
  try {
    res.json(await service.getMerchants(req.query));
  } catch (error) {
    next(error);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    res.json(await service.getTransactions(req.query));
  } catch (error) {
    next(error);
  }
};

exports.getStatement = async (req, res, next) => {
  try {
    const statement = await service.getStatement(req.query);
    res.type('text/csv');
    res.set('Content-Disposition', 'attachment; filename="merchant-wallet-statement.csv"');
    res.send(statement);
  } catch (error) {
    next(error);
  }
};

exports.createEntry = async (req, res, next) => {
  try {
    res.status(201).json({
      entry: await merchantService.createLedgerEntry(req.params.merchantId, req.body)
    });
  } catch (error) {
    next(error);
  }
};
