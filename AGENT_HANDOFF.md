# 项目交接备忘录 (Project Handoff for Agent)

## 1. 项目概况
*   **名称**: CloudFlare-AI-Insight-Daily
*   **目标**: 这里是一个自动化系统，用于从 Folo 抓取 AI 新闻，过滤并生成 Markdown 日报，推送到 GitHub。
*   **当前状态**: 生产运行中 (Production Ready)。
*   **部署平台**: Cloudflare Workers。
*   **核心逻辑**: 每日定时 (UTC 22:00) -> 抓取 -> 关键词+黑名单过滤 -> Gemini生成 -> 提交 GitHub。

## 2. 关键文件路径
*   `src/index.js`: 主入口，处理路由 (`/test-schedule`, `/login`)。
*   `src/scheduled.js`: **核心逻辑**。包含数据抓取协调、关键词过滤、AI 生成调用。
*   `src/dataSources/newsAggregator.js`: 处理 Folo API 交互。
*   `src/handlers/genAIContent.js`: 处理与 Gemini API 的 Prompt 交互。
*   `wrangler.toml`: 配置文件。包含 API Key (Gemini), Model 版本, Cron 表达式等。

## 3. 过滤器逻辑 (维护重点)
如果你需要调整筛选内容，请直接查看 `src/scheduled.js` 中的：
*   `KEYWORDS` 数组：白名单（如 "Gemini", "ChatGPT"）。
*   `BLACKLIST` 数组：黑名单（如 "融资", "股价"）。
*   `seenTitles` Set：去重逻辑。
*   逻辑：(Keyword Match AND Title Only) AND (NOT Blacklist Match) AND (Not Duplicate).

## 4. 常见任务指引
*   **任务：修改模型** -> 编辑 `wrangler.toml` 中的 `DEFAULT_GEMINI_MODEL`。
*   **任务：增加关键词** -> 编辑 `src/scheduled.js` 中的 `KEYWORDS`。
*   **任务：我要看原始数据** -> 无法直接看。需使用 `npx wrangler kv:key get YYYY-MM-DD-news --binding DATA_KV --remote` 获取。
*   **任务：强制刷新数据** -> 必须先执行 KV 删除命令（见 `SYSTEM_DOCS.md`），再访问 `/test-schedule`。

## 5. 调试命令
*   部署: `npx wrangler deploy`
*   清理远程缓存: `npx wrangler kv:key delete 202X-XX-XX-news --binding DATA_KV --remote`

请基于本文件快速理解项目上下文。
