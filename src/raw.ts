import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ override: true });

// ===== 工具定义 =====
const sql_inter = {
  name: 'sql_inter',
  description: `在MySQL中执行SQL查询并返回JSON结果`,
  parameters: {
    type: 'object',
    properties: {
      sql_query: { type: 'string', description: 'SQL查询语句' },
    },
    required: ['sql_query'],
  },
  async execute({ sql_query }: any) {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: process.env.MYSQL_PW!,
      database: 'demo',
      port: 3306,
      charset: 'utf8mb4',
    });

    try {
      const [rows] = await connection.query(sql_query);
      console.log('sql_inter', sql_query, rows);
      return JSON.stringify(rows, null, 2);
    } catch (error: any) {
      return `执行失败：${error.message}`;
    } finally {
      await connection.end();
    }
  },
};

const extract_data = {
  name: 'extract_data',
  description: `提取MySQL表并保存为本地JSON文件`,
  parameters: {
    type: 'object',
    properties: {
      sql_query: { type: 'string' },
      df_name: { type: 'string' },
    },
    required: ['sql_query', 'df_name'],
  },
  async execute({ sql_query, df_name }: any) {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: process.env.MYSQL_PW!,
      database: 'demo',
      port: 3306,
    });

    try {
      const [rows] = await connection.query(sql_query);
      const dataDir = join(process.cwd(), 'public', 'data');
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      const filePath = join(dataDir, `${df_name}.json`);
      writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
      console.log('extract_data', rows, df_name);
      return `成功保存数据到 public/data/${df_name}.json`;
    } catch (error: any) {
      return `执行失败：${error.message}`;
    } finally {
      await connection.end();
    }
  },
};

const js_eval = {
  name: 'js_eval',
  description: `执行JavaScript表达式或语句（非绘图）`,
  parameters: {
    type: 'object',
    properties: {
      js_code: { type: 'string' },
    },
    required: ['js_code'],
  },
  async execute({ js_code }: any) {
    try {
      // 注意：生产环境应使用 vm2 等安全沙箱
      const result = eval(js_code);
      console.log('js_eval', js_code, result);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err: any) {
      console.log('js_eval failed', err);
      return `代码执行失败：${err.message}`;
    }
  },
};

// 前端使用echarts渲染图表
// <div id="chart" style="width:600px;height:400px;"></div>
// <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
// <script>
//   fetch('/images/chart_123.json')
//     .then(r => r.json())
//     .then(option => {
//       const chart = echarts.init(document.getElementById('chart'));
//       chart.setOption(option);
//     });
// </script>
const fig_inter = {
  name: 'fig_inter',
  description: `生成图表配置JSON供前端渲染`,
  parameters: {
    type: 'object',
    properties: {
      chart_type: { type: 'string', enum: ['line', 'bar', 'scatter', 'pie'] },
      data_ref: { type: 'string' },
      x_field: { type: 'string' },
      y_field: { type: 'string' },
      title: { type: 'string' },
    },
    required: ['chart_type', 'data_ref', 'x_field', 'title'],
  },
  async execute({ chart_type, data_ref, x_field, y_field, title }: any) {
    try {
      const dataPath = join(process.cwd(), data_ref);
      const data = JSON.parse(readFileSync(dataPath, 'utf8'));

      let option;
      if (chart_type === 'bar' || chart_type === 'line') {
        const xData = [...new Set(data.map((d: any) => d[x_field]))];
        const yData = data.map((d: any) => d[y_field]);
        option = {
          title: { text: title },
          tooltip: {},
          xAxis: { type: 'category', data: xData },
          yAxis: { type: 'value' },
          series: [{ type: chart_type, data: yData }],
        };
      } else if (chart_type === 'pie') {
        const countMap = data.reduce((acc: any, d: any) => {
          const key = d[x_field];
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        option = {
          title: { text: title },
          series: [
            {
              type: 'pie',
              data: Object.entries(countMap).map(([name, value]) => ({
                name,
                value,
              })),
            },
          ],
        };
      }

      const imagesDir = join(process.cwd(), 'public', 'images');
      if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });

      const chartId = `chart_${Date.now()}`;
      const configPath = join(imagesDir, `${chartId}.json`);
      writeFileSync(configPath, JSON.stringify(option));

      console.log('fig_inter success');
      return `/images/${chartId}.json`; // 前端可访问的路径
    } catch (error: any) {
      return `图表生成失败：${error.message}`;
    }
  },
};

const tools = [sql_inter, extract_data, js_eval, fig_inter];

// ===== 使用 fetch 调用 DeepSeek API =====
async function callDeepSeekAPI(messages: any) {
  const url = 'https://api.siliconflow.cn/v1/chat/completions';
  const apiKey = process.env.OPENAI_API_KEY;

  const payload = {
    model: 'deepseek-ai/DeepSeek-V3.1',
    messages,
    tools: tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    tool_choice: 'auto',
    temperature: 0.1,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${err}`);
  }
  const json = await response.json();

  console.log('callDeepSeekAPI result:', json);
  return json;
}

// ===== React Agent 核心逻辑 =====
async function createReactAgent(userMessage: string) {
  const systemPrompt = `
你是一名智能数据分析助手，请按以下规则工作：
- 数据库查询 → 调用 sql_inter
- 提取整表 → 调用 extract_data
- 数据计算 → 调用 js_eval
- 绘图需求 → 调用 fig_inter（返回JSON路径，前端渲染）
- 所有回答用简体中文
`;

  let messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // 第一步：让模型决定是否调用工具
  const firstResponse = await callDeepSeekAPI(messages);
  const assistantMsg = firstResponse.choices[0].message;
  messages.push(assistantMsg);

  // 检查是否有工具调用
  if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
    const toolResults = [];

    for (const toolCall of assistantMsg.tool_calls) {
      const tool = tools.find((t) => t.name === toolCall.function.name);
      if (!tool) continue;

      const args = JSON.parse(toolCall.function.arguments);
      const result = await tool.execute(args);

      toolResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: tool.name,
        content: result,
      });
    }

    // 将工具结果追加到消息历史
    messages = [...messages, ...toolResults];

    // 第二步：让模型综合工具结果生成最终回答
    const finalResponse = await callDeepSeekAPI(messages);
    return finalResponse.choices[0].message.content;
  }

  // 无工具调用，直接返回
  return assistantMsg.content;
}

export { createReactAgent };

async function main() {
  try {
    const result = await createReactAgent('请查询 app_uv 表的最新3天数据');
    console.log('最终回答：\n', result);
  } catch (error) {
    console.error('错误：', error);
  }
}
main();
