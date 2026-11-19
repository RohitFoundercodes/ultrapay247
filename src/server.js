const app = require('./app');
const migrate = require('../database/migrate');
const db = require('./config/db');
const port = process.env.PORT || 3000;

async function start() {
  try {
    await migrate();
  } catch (error) {
    console.error('Unable to start UltraPay because database migrations failed:', error);
    await db.end();
    process.exitCode = 1;
    return;
  }

  app.listen(port, () => console.log(`UltraPay API listening on port ${port}`));
}

start();
