module.exports = {
  up: async(db)=>{
    await db.query(`CREATE TABLE payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      merchant_id BIGINT NOT NULL,
      reference VARCHAR(100) NOT NULL UNIQUE,
      amount DECIMAL(12,2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      customer_email VARCHAR(150),
      description VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    )`);
  }
};
