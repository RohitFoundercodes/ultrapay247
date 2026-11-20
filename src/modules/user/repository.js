const db = require('../../config/db');

exports.create = async(data)=>{
  const [res] = await db.query(
    "INSERT INTO merchants (name,email,password) VALUES (?,?,?)",
    [data.name,data.email,data.password]
  );
  return {id:res.insertId,...data};
};

exports.findByEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT m.id, m.name, m.email, m.password, m.status,
      d.merchant_code, d.mobile, d.payin_enabled, d.payout_enabled
     FROM merchants m
     LEFT JOIN merchant_details d ON d.merchant_id=m.id
     WHERE m.email=?`,
    [email]
  );
  return rows[0];
};
