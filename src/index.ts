import { HumanMessage } from '@langchain/core/messages';
import { graph } from './agent.js';

const main = async () => {
  const result = await graph.invoke({
    // messages: [new HumanMessage('介绍一下你自己')],
    messages: [new HumanMessage('查询 app_uv 表最近3天的 UV，并画折线图')],
  });

  console.log(result.messages.map((m) => m.content).join('\n'));
};

main().catch(console.error);
