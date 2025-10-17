import { StructuredTool, tool } from '@langchain/core/tools';
import * as z from 'zod';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const globalStore: Record<string, any> = {};

// 工具 1: SQL 查询
const SQLQuerySchema = z.object({
  sql_query: z
    .string()
    .describe(
      '字符串形式的SQL查询语句，用于执行对MySQL中demo数据库中各张表进行查询，并获得各表中的各类相关信息',
    ),
});

export const sql_inter = tool(
  async ({ sql_query }: z.infer<typeof SQLQuerySchema>) => {
    const conn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: process.env.MYSQL_PW!,
      database: 'demo',
      port: 3306,
      charset: 'utf8mb4',
    });

    try {
      const [rows] = await conn.execute(sql_query);
      console.log('sql_inter', sql_query, rows);
      return JSON.stringify(rows, null, 2);
    } finally {
      await conn.end();
    }
  },
  {
    name: 'sql_inter',
    description: `当用户需要进行数据库查询工作时，请调用该函数。
    该函数用于在指定MySQL服务器上运行一段SQL代码，完成数据查询相关工作，
    并且当前函数是使用nodejs mysql2连接MySQL数据库。
    本函数只负责运行SQL代码并进行数据查询，若要进行数据提取，则使用另一个extract_data函数。
    返回sql_query在MySQL中的运行结果。`,
    schema: SQLQuerySchema,
  },
);

// 工具 2: 提取数据到变量
const ExtractQuerySchema = z.object({
  sql_query: z.string().describe('用于从 MySQL 提取数据的 SQL 查询语句。'),
  df_name: z.string().describe('指定用于保存结果的变量名称（字符串形式）。'),
});

export const extract_data = tool(
  async ({ sql_query, df_name }: z.infer<typeof ExtractQuerySchema>) => {
    const conn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: process.env.MYSQL_PW!,
      database: 'demo',
      port: 3306,
    });

    try {
      const [rows] = await conn.execute(sql_query);
      globalStore[df_name] = rows;
      return `成功创建变量 \`${df_name}\`，包含从 MySQL 提取的数据。`;
    } catch (e: any) {
      return `执行失败：${e.message}`;
    } finally {
      await conn.end();
    }
  },
  {
    name: 'extract_data',
    description: `用于在MySQL数据库中提取一张表到当前Nodejs环境中，注意，本函数只负责数据表的提取，
    并不负责数据查询，若需要在MySQL中进行数据查询，请使用sql_inter函数。
    同时需要注意，编写外部函数的参数消息时，必须是满足json格式的字符串，
    返回表格读取和保存结果`,
    schema: ExtractQuerySchema,
  },
);

// 工具 3: 执行 JavaScript 代码（非绘图）
const CodeInput = z.object({
  code: z.string().describe('一段合法的 JavaScript 风格代码字符串'),
});

export const javascript_inter = tool(
  async ({ code }: z.infer<typeof CodeInput>) => {
    try {
      // 尝试作为表达式执行
      // 注意：Node.js 中无法直接 eval 复杂逻辑，这里简化处理
      const result = eval(code);
      console.log('执行成功，result：', result);
      return String(result);
    } catch (e) {
      console.error('eval 执行失败', code);
      try {
        // 作为语句执行（简化：只支持赋值）
        const assignMatch = code.match(/^(\w+)\s*=\s*(.+)$/);
        if (assignMatch) {
          const varName = assignMatch[1] as string;
          const value = eval(assignMatch[2] as string);
          globalStore[varName] = value;
          return `已设置变量 ${varName} = ${value}`;
        } else {
          return `无法执行代码: ${code}`;
        }
      } catch (e2) {
        return `执行失败: ${e2}`;
      }
    }
  },
  {
    name: 'javascript_inter',
    description: `当用户需要编写Nodejs程序并执行时，请调用该函数。
    该函数可以执行一段Nodejs代码并返回最终结果，需要注意，本函数只能执行非绘图类的代码，若是绘图相关代码，则需要调用fig_inter函数运行。`,
    schema: CodeInput,
  },
);

// 工具 4: 绘图
const FigCodeInput = z.object({
  config: z
    .record(z.string(), z.any())
    .describe('符合Chart.js配置格式的绘图配置（JSON 格式）'),
  fname: z.string().describe('图像对象的变量名，例如 "fig"'),
});

export const fig_inter = tool(
  async ({ config, fname }: z.infer<typeof FigCodeInput>) => {
    // 绘图函数（使用 chartjs-node-canvas）
    try {
      const width = config.width || 800;
      const height = config.height || 600;

      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config as any);

      const imagesDir = path.join(
        process.cwd(),
        'agent-chat-ui',
        'public',
        'images',
      );
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      const fullPath = path.join(imagesDir, `${fname}.png`);
      fs.writeFileSync(fullPath, imageBuffer);

      return `图片已保存，路径为: images/${fname}.png`;
    } catch (e: any) {
      console.error('绘图错误:', e);
      return `绘图失败: ${e.message || e}`;
    }
  },
  {
    name: 'fig_inter',
    description: `当用户需要进行可视化绘图任务时，请调用该函数。
    绘图过程将在Nodejs服务端运行，使用Chart.js库。绘图核心逻辑如下：
    const width = config.width || 800;
    const height = config.height || 600;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config);
    fs.writeFileSync(fullPath, imageBuffer);
   `,
    schema: FigCodeInput,
  },
);
export const tools: StructuredTool[] = [
  sql_inter,
  extract_data,
  javascript_inter,
  fig_inter,
];
