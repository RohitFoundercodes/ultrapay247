const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'UltraPay' }));
app.use('/api/auth', require('./modules/user/routes'));
app.use('/api/payments', require('./modules/payment/routes'));

app.use((err,req,res,next)=>{
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

module.exports = app;
