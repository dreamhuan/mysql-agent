# 基于LangGraph mysql数据分析

原文：https://zhuanlan.zhihu.com/p/1951262997294065133

此项目仅供学习

## docker创建容器

```bash
docker run --name mysql8 -p 3306:3306 -v mysql_data:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=【你的密码】 -d mysql:8.0
```

## 环境变量

```
cp .env.sample .env
```

去[硅基流动](https://cloud.siliconflow.cn/me/account/ak)注册个key并把API key和数据库密码写入.env

## 安装前端项目

```bash
git clone https://github.com/langchain-ai/agent-chat-ui.git
cd agent-chat-ui
pnpm i
```

## 运行

```bash
pnpm run data
# pnpm run dev # 直接运行ts脚本
pnpm run server # 起一个server服务配合前端项目运行
# 打开新的terminal
cd agent-chat-ui
pnpm run dev # 运行前端项目
```

然后打开链接之后直接点next即可
