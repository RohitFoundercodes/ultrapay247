const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { apiRateLimit } = require('./middlewares/rate-limit');

const app = express();
const trustedProxyAddresses = (process.env.TRUSTED_PROXY_IPS || '')
    .split(',')
    .map(address => address.trim())
    .filter(Boolean);
app.set('trust proxy', trustedProxyAddresses.length ? trustedProxyAddresses : 'loopback');

const allowedOrigins = [
    'http://localhost:5173',
    'https://ultrapay247.vercel.app','https://ultrapay247merchant.vercel.app','https://ultra-pay247.vercel.app'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Merchant-Id',
        'X-Merchant-Token'
    ]
}));
app.use(apiRateLimit);
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'UltraPay' }));
app.use('/api/auth', require('./modules/user/routes'));
app.use('/api/admin', require('./modules/admin/routes'));
app.use('/api/dashboard', require('./modules/dashboard/merchant-routes'));
app.use(
  '/api/notifications',
  require('./middlewares/merchant-auth'),
  require('./modules/notification/routes')('merchant')
);
app.use('/api/payin', require('./modules/payin/merchant-routes'));
app.use('/api/disputes', require('./modules/dispute/merchant-routes'));
app.use('/api/direct-fund-requests', require('./modules/direct-fund/merchant-routes'));
app.use('/api/withdrawals', require('./modules/withdrawal/merchant-routes'));
app.use('/api/tickets', require('./modules/ticket/merchant-routes'));
app.use('/api/payments', require('./modules/payment/routes'));
app.use('/api/payouts', require('./modules/payout/merchant-routes'));

app.use((err,req,res,next)=>{
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

module.exports = app;
