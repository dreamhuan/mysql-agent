import mysql from 'mysql2/promise';
import 'dotenv/config';

async function test() {
  const sql_query = 'select * from app_uv;';
  const config = {
    host: 'localhost',
    user: 'root',
    password: process.env.MYSQL_PW!,
    database: 'demo',
    port: 3306,
    charset: 'utf8mb4',
  };
  console.log(config);
  const conn = await mysql.createConnection(config);
  try {
    const [rows] = await conn.execute(sql_query);
    const res = JSON.stringify(rows, null, 2);
    console.log(res);
    return res;
  } finally {
    await conn.end();
  }
}

test();
