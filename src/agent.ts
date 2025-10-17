import { StateGraph, START, END, Command } from '@langchain/langgraph';
import { MessagesZodMeta } from '@langchain/langgraph';
import { registry } from '@langchain/langgraph/zod';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import * as z from 'zod/v4';
import { ChatOpenAI } from '@langchain/openai';
import 'dotenv/config';
import { tools } from './tools.js';

// 定义状态
const State = z.object({
  messages: z
    .array(z.custom<BaseMessage>())
    .register(registry, MessagesZodMeta),
});

// 初始化模型
export const model = new ChatOpenAI({
  model: 'deepseek-ai/DeepSeek-V3.1',
  configuration: {
    baseURL: 'https://api.siliconflow.cn/v1/',
  },
});

// 绑定工具
const modelWithTools = model.bindTools(tools);

const systemPrompt = `
你是一名经验丰富的智能数据分析助手，擅长帮助用户高效完成以下任务：

1. **数据库查询：**
   - 当用户需要获取数据库中某些数据或进行SQL查询时，请调用\`sql_inter\`工具，该工具已经内置了mysql2连接MySQL数据库的全部参数，包括数据库名称、用户名、密码、端口等，你只需要根据用户需求生成SQL语句即可。
   - 你需要准确根据用户请求生成SQL语句，例如 \`SELECT * FROM 表名\` 或包含条件的查询。

2. **数据表提取：**
   - 当用户希望将数据库中的表格导入JavaScript环境进行后续分析时，请调用\`extract_data\`工具。
   - 你需要根据用户提供的表名或查询条件生成SQL查询语句，并将数据保存到指定的变量中。

3. **非绘图类任务的JavaScript代码执行：**
   - 当用户需要执行JavaScript脚本或进行数据处理、统计计算时，请调用\`javascript_inter\`工具。
   - 仅限执行非绘图类代码，例如变量定义、数据分析等。

4. **绘图类JavaScript代码执行：**
   - 当用户需要进行可视化展示（如生成图表、绘制分布等）时，请调用\`fig_inter\`工具。
   - 你可以直接读取数据并进行绘图，不需要借助\`javascript_inter\`工具读取图片。
   - 你应根据用户需求编写绘图代码配置，并正确指定绘图对象变量名（如 \`fig\`）。

**工具使用优先级：**
- 如需数据库数据，请先使用\`sql_inter\`或\`extract_data\`获取，再执行JavaScript分析或绘图。
- 当用户要求绘图时：
  - **不要生成 JavaScript / matplotlib 代码**
  - **必须生成一个合法的 Chart.js 配置对象（JSON 格式）**
  - 配置必须包含 type（如 'bar', 'line', 'pie'）、data（含 labels 和 datasets）、options（可选）
  - 所有文本（标题、标签等）使用英文
  - 调用 fig_inter 工具时，将配置作为 config 参数传入，fname 为简短英文名（如 "sales_chart"）
  示例 config:
  {
    "type": "bar",
    "data": {
      "labels": ["Jan", "Feb", "Mar"],
      "datasets": [{
        "label": "Revenue",
        "data": [100, 150, 200],
        "backgroundColor": "rgba(54, 162, 235, 0.6)"
      }]
    },
    "options": {
      "responsive": false,
      "plugins": {
        "title": { "display": true, "text": "Monthly Revenue" }
      }
    }
  }

**回答要求：**
- 所有回答均使用**简体中文**，清晰、礼貌、简洁。
- 如果调用工具返回结构化JSON数据，你应提取其中的关键信息简要说明，并展示主要结果。
- 若需要用户提供更多信息，请主动提出明确的问题。
- 如果有生成的图片文件，请务必在回答中使用Markdown格式插入图片，如：![Categorical Features vs Churn](images/fig.png)
- 不要仅输出图片路径文字。

**风格：**
- 专业、简洁、以数据驱动。
- 不要编造不存在的工具或数据。

请根据以上原则为用户提供精准、高效的协助。
`;
// Agent 节点
const callModel = async (state: z.infer<typeof State>) => {
  const messages = [
    { role: 'system', content: systemPrompt.trim() },
    ...state.messages,
  ];

  const response = await modelWithTools.invoke(messages);
  console.log('callModel response', response);
  return { messages: [response] };
};

// 工具节点（使用内置 ToolNode 逻辑）
const callTool = async (state: z.infer<typeof State>) => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!AIMessage.isInstance(lastMessage)) {
    throw new Error('Message Error');
  }
  if (!lastMessage?.tool_calls?.length) {
    throw new Error('No tool calls found');
  }

  const toolCall = lastMessage.tool_calls[0]!;
  const selectedTool = tools.find((t) => t.name === toolCall.name);
  if (!selectedTool) {
    throw new Error(`Tool ${toolCall.name} not found`);
  }

  try {
    console.log('callTool ', toolCall.name);
    const result = await selectedTool.invoke(toolCall.args);
    return {
      messages: [
        new ToolMessage({
          content: result,
          tool_call_id: toolCall.id!,
        }),
      ],
    };
  } catch (e: any) {
    return {
      messages: [
        new ToolMessage({
          content: `Error: ${e.message}`,
          tool_call_id: toolCall.id!,
        }),
      ],
    };
  }
};

// 路由函数
const shouldContinue = (state: z.infer<typeof State>): 'tool' | typeof END => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (AIMessage.isInstance(lastMessage) && lastMessage?.tool_calls?.length) {
    return 'tool';
  }
  return END;
};

// 构建图
export const graph = new StateGraph(State)
  .addNode('agent', callModel)
  .addNode('tool', callTool)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, { tool: 'tool', [END]: END })
  .addEdge('tool', 'agent')
  .compile();
