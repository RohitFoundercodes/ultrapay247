const fs = require('fs');
require('dotenv').config();
const db = require('../src/config/db');

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS migrations (
    name VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const [rows] = await db.query("SELECT name FROM migrations");
  const done = rows.map(r=>r.name);

  const files = fs.readdirSync(__dirname + '/migrations')
    .filter(file => file.endsWith('.js'))
    .sort();

  for(const file of files){
    if(!done.includes(file)){
      console.log('Running:',file);
      const m = require('./migrations/'+file);
      await m.up(db);
      await db.query("INSERT INTO migrations (name) VALUES (?)",[file]);
    }
  }
}

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error('Database migration failed:', error);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = migrate;
