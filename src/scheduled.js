// src/scheduled.js
import { getISODate, formatDateToChinese } from './helpers.js';
import { getFromKV, storeInKV } from './kv.js';
import { dataSources, fetchAndTransformDataForType } from './dataFetchers.js';
import { generateDailyContent } from './handlers/genAIContent.js';
import { commitFilesToGitHub } from './handlers/githubCommit.js';

export async function handleScheduled(event, env) {
    const dateStr = getISODate();
    console.log(`[Scheduled] Starting automated generation for ${dateStr}...`);
    const logs = [`[Start] ${dateStr}`];

    try {
        // 1. Fetch data (Only News as requested)
        const targetSources = ['news'];
        const allFetchedData = {};

        for (const sourceType of targetSources) {
            // Try fetching from KV first
            let data = await getFromKV(env.DATA_KV, `${dateStr}-${sourceType}`);

            // If empty, fetch from Source (Folo)
            if (!data || data.length === 0) {
                logs.push(`[Fetch] KV empty for ${sourceType}, fetching from source...`);

                // Get Folo Cookie from KV
                const cookieKey = env.FOLO_COOKIE_KV_KEY;
                const foloCookie = cookieKey ? await env.DATA_KV.get(cookieKey) : null;
                logs.push(`[Debug] Cookie Key: ${cookieKey}, Cookie Found: ${!!foloCookie}`);

                try {
                    data = await fetchAndTransformDataForType(sourceType, env, foloCookie);
                    if (data && data.length > 0) {
                        // Cache back to KV
                        await storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, data);
                        logs.push(`[Fetch] Fetched ${data.length} items from source & cached.`);
                    } else {
                        logs.push(`[Fetch] Source returned 0 items.`);
                    }
                } catch (err) {
                    logs.push(`[Error] Fetching from source failed: ${err.message}`);
                }
            } else {
                logs.push(`[Fetch] KV hit for ${sourceType}: ${data.length} items`);
            }

            allFetchedData[sourceType] = data || [];
        }

        // 2. Select Items Strategy
        const selectedItems = [];
        const KEYWORDS = [
            "Gemini", "Antigravity", "NotebookLM", "Nano Banana", "ChatGPT", "Veo", "Wan", "kimi",
            "Sora", "Codex", "Notion app", "Doubao", "OpenAI", "GPT-Image", "Kling", "Vibe Coding", "qwen", "千问",
            "Home Assistant", "豆包"
        ].map(k => k.toLowerCase());

        const BLACKLIST = [
            "pixel", "price", "discount", "wrapped", "game", "apparel", "fashion",
            "shopping", "virtual try", "try on", "try-on", "play store", "app store",
            "price cut", "spotify",
            // Finance & Business
            "融资", "亿美元", "市值", "股价", "收购", "财报", "营收", "投资", "股权",
            "markets", "stock", "funding", "billion", "revenue", "IPO",
            // Personnel & Management
            "聘请", "高管", "离职", "加入", "掌舵", "ex-", "former", "hired", "resigns",
            // Others
            "预测市场", "赌注", "betting", "policy"
        ].map(k => k.toLowerCase());

        const MAX_ITEMS = 30;
        const HOURS_48_MS = 48 * 60 * 60 * 1000;
        const now = new Date();

        // Process News
        const news = allFetchedData['news'] || [];
        let rejectedLogCount = 0;
        const seenTitles = new Set(); // For deduplication

        let filteredNews = news.filter(item => {
            // A. Time Filter (Past 48 hours)
            const itemDateStr = item.published_date || item.date;
            if (!itemDateStr) {
                if (rejectedLogCount < 5) {
                    logs.push(`[Filter-Reject] No Date: ${item.title.substring(0, 30)}...`);
                    rejectedLogCount++;
                }
                return false;
            }

            const itemTime = new Date(itemDateStr).getTime();
            if (isNaN(itemTime)) {
                if (rejectedLogCount < 5) {
                    logs.push(`[Filter-Reject] Invalid Date: ${itemDateStr} - ${item.title.substring(0, 30)}...`);
                    rejectedLogCount++;
                }
                return false;
            }

            const isWithin48Hours = (now.getTime() - itemTime) <= HOURS_48_MS;
            if (!isWithin48Hours) {
                if (rejectedLogCount < 5) {
                    logs.push(`[Filter-Reject] Too Old (${Math.round((now.getTime() - itemTime) / 3600000)}h ago): ${itemDateStr} - ${item.title.substring(0, 20)}...`);
                    rejectedLogCount++;
                }
                return false;
            }

            // A-2. Title Deduplication
            const normalizedTitle = (item.title || '').trim().toLowerCase();
            if (seenTitles.has(normalizedTitle)) {
                if (rejectedLogCount < 5) {
                    logs.push(`[Filter-Reject] Title Duplicate: ${item.title.substring(0, 30)}...`);
                    rejectedLogCount++;
                }
                return false;
            }

            // B. Keyword & Blacklist Filter
            const textToSearch = `${item.title || ''}`.toLowerCase();

            // 1. Check Blacklist
            const hasBlacklist = BLACKLIST.some(blockWord => textToSearch.includes(blockWord));
            if (hasBlacklist) {
                if (rejectedLogCount < 10) {
                    logs.push(`[Filter-Reject] Blacklist: ${item.title.substring(0, 30)}...`);
                    rejectedLogCount++;
                }
                return false;
            }

            // 2. Check Whitelist Keywords
            const hasKeyword = KEYWORDS.some(keyword => textToSearch.includes(keyword));
            if (!hasKeyword) {
                if (rejectedLogCount < 5) {
                    logs.push(`[Filter-Reject] No Keyword: ${item.title.substring(0, 30)}...`);
                    rejectedLogCount++;
                }
                return false;
            }

            // If passes all checks, add to seen titles
            seenTitles.add(normalizedTitle);
            return true;
        });

        logs.push(`[Filter] News after keyword & time check: ${filteredNews.length}`);

        // C. Sort by Date Descending (ensure freshest are picked if we have > 30)
        filteredNews.sort((a, b) => {
            const dateA = new Date(a.published_date || a.date).getTime();
            const dateB = new Date(b.published_date || b.date).getTime();
            return dateB - dateA;
        });

        // D. Limit to 30
        const finalNews = filteredNews.slice(0, MAX_ITEMS);
        finalNews.forEach(item => {
            selectedItems.push(`news:${item.id}`);
        });

        // Debug: Log selected titles
        logs.push(`[Select] Final News Count: ${finalNews.length}`);
        finalNews.slice(0, 20).forEach((item, idx) => {
            logs.push(`[Select-Preview-${idx + 1}] ${item.title.substring(0, 50)}...`);
        });

        if (selectedItems.length === 0) {
            console.log(`[Scheduled] No items found matching criteria for ${dateStr}. Skipping generation.`);
            logs.push(`[Skip] No items selected after filtering.`);
            return { success: false, logs };
        }

        console.log(`[Scheduled] Selected ${selectedItems.length} items for generation.`);
        logs.push(`[Generate] Generating content for ${selectedItems.length} items...`);

        // 3. Generate Content
        // generateDailyContent returns { dailySummaryMarkdownContent, ... }
        const generationResult = await generateDailyContent(env, dateStr, selectedItems);
        const dailyMd = generationResult.dailySummaryMarkdownContent;
        logs.push(`[Generate] Success. Markdown length: ${dailyMd.length}`);

        // 4. Commit to GitHub
        // We only generate daily report automatically, not podcast script yet (optional)
        const commitResult = await commitFilesToGitHub(env, dateStr, dailyMd, null);

        console.log(`[Scheduled] Automation completed. Daily: ${commitResult.daily.status}`);
        logs.push(`[Commit] Status: ${commitResult.daily.status}`);

        return { success: true, logs };

    } catch (error) {
        console.error(`[Scheduled] Error during automated generation:`, error);
        logs.push(`[Error] ${error.message}`);
        logs.push(`[Stack] ${error.stack}`);
        // Return logs for manual trigger debugging
        return { success: false, logs };
    }
}
