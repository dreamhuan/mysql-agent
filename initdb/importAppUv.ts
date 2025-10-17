import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import mysql, { type Connection } from 'mysql2/promise';
import 'dotenv/config';
import { fileURLToPath } from 'url';

// 获取当前文件目录（兼容 ESM）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 环境变量类型检查
const MYSQL_PW = process.env.MYSQL_PW;
if (!MYSQL_PW) {
  throw new Error('❌ 环境变量 MYSQL_PW 未设置，请检查 .env 文件');
}

// 数据库配置（不指定 database）
const dbConfig: mysql.ConnectionOptions = {
  host: 'localhost',
  user: 'root',
  password: MYSQL_PW,
  port: 3306,
  charset: 'utf8mb4',
};

interface AppUvRow {
  date: string; // YYYY-MM-DD
  uv: number;
}

async function readCsv(filePath: string): Promise<AppUvRow[]> {
  const results: AppUvRow[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: { date: string; uv: string }) => {
        try {
          // 解析日期：确保是合法的 YYYY-MM-DD
          const date = new Date(row.date);
          if (isNaN(date.getTime())) {
            console.warn(`⚠️ 跳过无效日期: ${row.date}`);
            return;
          }
          const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

          const uv = parseInt(row.uv, 10);
          if (isNaN(uv)) {
            console.warn(`⚠️ 跳过无效 UV 值: "${row.uv}" on ${row.date}`);
            return;
          }

          results.push({ date: dateStr!, uv });
        } catch (err) {
          console.warn(`⚠️ 解析行出错:`, row, err);
        }
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function main(): Promise<void> {
  let connection: Connection | null = null;

  try {
    // 1. 连接 MySQL（无默认数据库）
    connection = await mysql.createConnection(dbConfig);
    console.log('🔌 已连接到 MySQL。');

    // 2. 创建数据库 demo
    await connection.execute(
      'CREATE DATABASE IF NOT EXISTS demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
    );
    console.log("✅ 数据库 'demo' 已创建或已存在。");

    // 3. 切换到 demo 数据库
    await connection.changeUser({ database: 'demo' });

    // 4. 创建表 app_uv
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS app_uv (
        date DATE NOT NULL PRIMARY KEY,
        uv INT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await connection.execute(createTableSQL);
    console.log("✅ 表 'app_uv' 已创建或已存在。");

    // 5. 读取 CSV
    const csvPath = path.resolve(__dirname, './app_uv.csv');
    const data = await readCsv(csvPath);
    console.log(`📄 从 CSV 读取 ${data.length} 条有效记录。`);

    if (data.length === 0) {
      console.log('📭 无有效数据，跳过插入。');
      return;
    }

    // 构造占位符：(?, ?), (?, ?), ...
    const placeholders = data.map(() => '(?, ?)').join(', ');
    const insertSQL = `
  INSERT INTO app_uv (date, uv)
  VALUES ${placeholders}
  ON DUPLICATE KEY UPDATE uv = VALUES(uv);
`;

    // 展平数据数组：[date1, uv1, date2, uv2, ...]
    const flatValues = data.flatMap((row) => [row.date, row.uv]);

    // 使用 .query()（不是 .execute()）来支持动态 SQL
    await connection.query(insertSQL, flatValues);

    console.log(`✅ 成功插入/更新 ${data.length} 条记录到 'app_uv' 表。`);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('❌ 发生错误:', err.message);
    } else {
      console.error('❌ 未知错误:', err);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 数据库连接已关闭。');
    }
  }
}

// 启动主函数
main().catch(console.error);
