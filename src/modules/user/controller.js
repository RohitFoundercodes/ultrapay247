const service = require('./service');

exports.register = async(req,res,next)=>{
  try{res.json(await service.register(req.body));}
  catch(e){next(e);}
};

exports.login = async(req,res,next)=>{
  try{res.json(await service.login(req.body));}
  catch(e){next(e);}
};

exports.me = async (req, res, next) => {
  try {
    res.json({ merchant: await service.getProfileById(req.user.id) });
  } catch (error) {
    next(error);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    res.json(await service.updateProfile(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    res.json(await service.changePassword(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};
