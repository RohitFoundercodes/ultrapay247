module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE payout_transactions
      ADD COLUMN payout_type ENUM('IMPS', 'UPI', 'SELF') NULL AFTER provider_name`);
  }
};
