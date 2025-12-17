# AI 日报自动化系统说明文档

## 1. 系统概述
本项目 `CloudFlare-AI-Insight-Daily` 是一个基于 Cloudflare Workers 的自动化系统，旨在每天从指定源（Folo）抓取 AI 相关新闻，经过关键词过滤和 AI 总结后，自动推送到 GitHub 仓库。

## 2. 核心功能
*   **数据抓取**：从 Folo API 聚合源抓取最新新闻。
*   **智能过滤**：
    *   **时间**：仅保留过去 48 小时内的新闻。
    *   **关键词**：仅保留标题中包含特定关键词（如 Gemini, OpenAi, ChatGPT等）的新闻。
    *   **黑名单**：剔除包含特定垃圾词汇的内容。
    *   **去重**：自动剔除标题完全重复的条目。
*   **AI 生成**：使用 Google Gemini 1.5/2.5 Flash 模型生成每日摘要。
*   **自动发布**：生成 Markdown 文件并提交到 GitHub `book` 分支的 `daily/` 目录。
*   **KV 缓存**：使用 Cloudflare KV 缓存 API 响应，减少源站请求压力。

## 3. 安装与配置

### 3.1 环境要求
*   Node.js & npm
*   Wrangler CLI (`npm install -g wrangler`)
*   Cloudflare 账号
*   GitHub 账号及 Token

### 3.2 配置文件 (`wrangler.toml`)
确保正确配置以下核心变量：
```toml
[vars]
# API设置
GEMINI_API_KEY = "你的_Gemini_Key"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

# 数据源设置
FOLO_COOKIE_KV_KEY = "folo_auth_cookie" # 需在 KV 中预存 Folo Cookie
NEWS_AGGREGATOR_LIST_ID = "你的_Folo_List_ID"
NEWS_AGGREGATOR_FETCH_PAGES = "5" # 抓取页数

# GitHub集设置
GITHUB_TOKEN = "你的_GitHub_Token"
GITHUB_REPO_OWNER = "你的用户名"
GITHUB_REPO_NAME = "你的仓库名"
GITHUB_BRANCH = "book"
```

### 3.3 部署指令
```bash
npx wrangler deploy
```

## 4. 常见问题排查与解决方案

### Q1: 生成的日报为空或内容非常少？
*   **原因**：
    1.  **关键词过滤太严**：比如移除了热门词（如 OpenAI）或仅匹配标题（Title Only）。
    2.  **源数据杂乱**：聚合源中包含了大量非 AI 内容（如生物、营销号）。
    3.  **时间窗口**：过去 48 小时内确实没有符合关键词的新闻。
*   **解决方案**：
    1.  检查 `src/scheduled.js` 中的 `KEYWORDS` 列表，适当添加泛词（如 "AI"）。
    2.  调整过滤逻辑，恢复对 Description 的搜索（如需）。
    3.  优化 Folo 源，删除不相关的订阅。
    4.  手动清除 KV 缓存以强制重新抓取（见 Q3）。

### Q2: 遇到 "429 Resource Exhausted" 错误？
*   **原因**：Gemini API 配额耗尽或请求速率（RPM）过高。
*   **解决方案**：
    1.  更换 gemini 模型版本（如 `flash-lite` 换回 `flash`）。
    2.  更换 API Key。
    3.  等待配额重置。

### Q3: 修改了源或关键词，但测试结果没变？
*   **原因**：Worker 优先使用 KV 中的缓存数据（有效期默认为当天）。
*   **解决方案**：需手动清除 KV 缓存。
    ```bash
    # 替换 YYYY-MM-DD 为当天日期（注意 UTC 时间）
    npx wrangler kv:key delete YYYY-MM-DD-news --binding DATA_KV --remote
    ```

### Q4: 发现完全重复的新闻标题？
*   **原因**：不同来源报道同一事件，或源本身重复输出。
*   **解决方案**：系统已内置去重逻辑（`seenTitles` Set），自动过滤标题完全一致的后续条目。

## 5. 调试工具
*   **手动触发测试**：访问 `https://你的worker域名/test-schedule`
    *   该接口会执行完整的抓取->过滤->生成->提交流程。
    *   请留意返回的 JSON 日志，特别是 `[Filter-Reject]` 部分，可帮你看清为什么某条新闻被过滤了。

## 6. 注意事项
*   **Cookie 有效期**：Folo 的 Cookie 可能会过期。如果日志显示 "Empty Data on Page 1" 且不是源的问题，请更新 KV 中的 Cookie。
*   **GitHub 权限**：确保 Token 具有 `repo` 写权限，否则无法提交。
