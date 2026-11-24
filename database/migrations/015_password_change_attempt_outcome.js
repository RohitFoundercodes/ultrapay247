module.exports = {
  up: async (db) => {
    const [columns] = await db.query('SHOW COLUMNS FROM merchant_password_change_logs');
    let columnNames = new Set(columns.map(column => column.Field));
    if (columnNames.has('changed_at') && !columnNames.has('attempted_at')) {
      await db.query(`ALTER TABLE merchant_password_change_logs
        CHANGE COLUMN changed_at attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
      columnNames.delete('changed_at');
      columnNames.add('attempted_at');
    }
    if (!columnNames.has('attempted_at')) {
      const previousTimestamp = columnNames.has('created_at') ? 'created_at' : null;
      if (previousTimestamp) {
        await db.query(`ALTER TABLE merchant_password_change_logs
          CHANGE COLUMN ${previousTimestamp} attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        columnNames.delete(previousTimestamp);
      } else {
        await db.query(`ALTER TABLE merchant_password_change_logs
          ADD COLUMN attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER merchant_id`);
      }
      columnNames.add('attempted_at');
    }
    if (!columnNames.has('succeeded')) {
      await db.query(`ALTER TABLE merchant_password_change_logs
        ADD COLUMN succeeded TINYINT(1) NOT NULL DEFAULT 1 AFTER merchant_id`);
    }

    const [indexes] = await db.query('SHOW INDEX FROM merchant_password_change_logs');
    const timestampIndex = indexes
      .filter(index => index.Key_name === 'idx_merchant_password_change_log_time')
      .sort((left, right) => left.Seq_in_index - right.Seq_in_index)
      .map(index => index.Column_name);
    if (timestampIndex.length &&
        (timestampIndex[0] !== 'merchant_id' || timestampIndex[1] !== 'attempted_at' ||
         timestampIndex.length !== 2)) {
      await db.query('ALTER TABLE merchant_password_change_logs DROP INDEX idx_merchant_password_change_log_time');
    }
    if (!timestampIndex.length ||
        timestampIndex[0] !== 'merchant_id' || timestampIndex[1] !== 'attempted_at' ||
        timestampIndex.length !== 2) {
      await db.query(`ALTER TABLE merchant_password_change_logs
        ADD INDEX idx_merchant_password_change_log_time (merchant_id, attempted_at)`);
    }
  }
};
