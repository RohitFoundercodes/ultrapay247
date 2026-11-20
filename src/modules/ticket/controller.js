const service = require('./service');

exports.listAdmin = async (req, res, next) => {
  try {
    res.json(await service.getAdminTickets(req.query));
  } catch (error) {
    next(error);
  }
};

exports.stats = async (req, res, next) => {
  try {
    res.json(await service.getStats(req.query));
  } catch (error) {
    next(error);
  }
};

exports.exportAdmin = async (req, res, next) => {
  try {
    const file = await service.exportTickets(req.query, req.query.format);
    res.set('Content-Type', file.contentType);
    res.set('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.body);
  } catch (error) {
    next(error);
  }
};

exports.getAdminTicket = async (req, res, next) => {
  try {
    res.json(await service.getAdminTicket(req.params.ticketId));
  } catch (error) {
    next(error);
  }
};

exports.replyAdmin = async (req, res, next) => {
  try {
    res.json(await service.reply(req.params.ticketId, {
      type: 'admin',
      id: req.user.id
    }, req.body));
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(await service.updateStatus(req.params.ticketId, req.body && req.body.status));
  } catch (error) {
    next(error);
  }
};

exports.listMerchant = async (req, res, next) => {
  try {
    res.json(await service.listMerchantTickets(req.user.id, req.query));
  } catch (error) {
    next(error);
  }
};

exports.createMerchant = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.getMerchantTicket = async (req, res, next) => {
  try {
    res.json(await service.getMerchantTicket(req.user.id, req.params.ticketId));
  } catch (error) {
    next(error);
  }
};

exports.replyMerchant = async (req, res, next) => {
  try {
    res.json(await service.reply(req.params.ticketId, {
      type: 'merchant',
      id: req.user.id
    }, req.body));
  } catch (error) {
    next(error);
  }
};
