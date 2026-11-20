const service = require('./service');

exports.register = async(req,res,next)=>{
  try{res.json(await service.register(req.body));}
  catch(e){next(e);}
};

exports.login = async(req,res,next)=>{
  try{res.json(await service.login(req.body));}
  catch(e){next(e);}
};

exports.me = (req, res) => {
  res.json({
    merchant: {
      id: req.user.id,
      merchantId: req.user.merchantId,
      name: req.user.name,
      email: req.user.email,
      mobile: req.user.mobile,
      status: req.user.status,
      payinEnabled: req.user.payinEnabled,
      payoutEnabled: req.user.payoutEnabled
    }
  });
};
