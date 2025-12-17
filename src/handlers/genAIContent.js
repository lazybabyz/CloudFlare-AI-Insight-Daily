// src/handlers/genAIContent.js
import { getISODate, escapeHtml, stripHtml, removeMarkdownCodeBlock, formatDateToChinese, convertEnglishQuotesToChinese } from '../helpers.js';
import { getFromKV } from '../kv.js';
import { callChatAPIStream } from '../chatapi.js';
import { generateGenAiPageHtml } from '../htmlGenerators.js';
import { dataSources } from '../dataFetchers.js'; // Import dataSources
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepZero";
import { getSystemPromptSummarizationStepTwo } from "../prompt/summarizationPromptStepTwo";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { getSystemPromptPodcastFormatting, getSystemPromptShortPodcastFormatting } from '../prompt/podcastFormattingPrompt.js';
import { getSystemPromptDailyAnalysis } from '../prompt/dailyAnalysisPrompt.js'; // Import new prompt
import { insertFoot } from '../foot.js';
import { insertAd } from '../ad.js';
import { getDailyReportContent } from '../github.js'; // 导入 getDailyReportContent

export async function handleGenAIPodcastScript(request, env) {
    let dateStr;
    let selectedItemsParams = [];
    let formData;
    let outputOfCall1 = null; // This will be the summarized content from Call 1

    let userPromptPodcastFormattingData = null;
    let fullPromptForCall3_System = null;
    let fullPromptForCall3_User = null;
    let finalAiResponse = null;

    try {
        formData = await request.formData();
        dateStr = formData.get('date');
        selectedItemsParams = formData.getAll('selectedItems');
        const readGithub = formData.get('readGithub') === 'true';

        if (readGithub) {
            const filePath = `daily/${dateStr}.md`;
            console.log(`从 GitHub 读取文件: ${filePath}`);
            try {
                outputOfCall1 = await getDailyReportContent(env, filePath);
                if (!outputOfCall1) {
                    throw new Error(`从 GitHub 读取文件 ${filePath} 失败或内容为空。`);
                }
                console.log(`成功从 GitHub 读取文件，内容长度: ${outputOfCall1.length}`);
            } catch (error) {
                console.error(`读取 GitHub 文件出错: ${error}`);
                const errorHtml = generateGenAiPageHtml(env, '生成AI播客脚本出错', `<p><strong>从 GitHub 读取文件失败:</strong> ${escapeHtml(error.message)}</p>${error.stack ? `<pre>${escapeHtml(error.stack)}</pre>` : ''}`, dateStr, true, null, null, null, null, null, null, outputOfCall1, null);
                return new Response(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
        } else {
            outputOfCall1 = formData.get('summarizedContent'); // Get summarized content from form data
        }

        if (!outputOfCall1) {
            const errorHtml = generateGenAiPageHtml(env, '生成AI播客脚本出错', '<p><strong>Summarized content is missing.</strong> Please go back and generate AI content first.</p>', dateStr, true, null, null, null, null, null, null, outputOfCall1, null);
            return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }


        fullPromptForCall3_System = getSystemPromptPodcastFormatting(env);
        userPromptPodcastFormattingData = outputOfCall1;
        fullPromptForCall3_User = userPromptPodcastFormattingData;

        console.log("Call 3 to Chat (Podcast Formatting): User prompt length:", userPromptPodcastFormattingData.length);
        try {
            let podcastChunks = [];
            for await (const chunk of callChatAPIStream(env, userPromptPodcastFormattingData, fullPromptForCall3_System)) {
                podcastChunks.push(chunk);
            }
            finalAiResponse = podcastChunks.join('');
            if (!finalAiResponse || finalAiResponse.trim() === "") throw new Error("Chat podcast formatting call returned empty content.");
            finalAiResponse = removeMarkdownCodeBlock(finalAiResponse); // Clean the output
            console.log("Call 3 (Podcast Formatting) successful. Final output length:", finalAiResponse.length);
        } catch (error) {
            console.error("Error in Chat API Call 3 (Podcast Formatting):", error);
            const errorHtml = generateGenAiPageHtml(env, '生成AI播客脚本出错(播客文案)', `<p><strong>Failed during podcast formatting:</strong> ${escapeHtml(error.message)}</p>${error.stack ? `<pre>${escapeHtml(error.stack)}</pre>` : ''}`, dateStr, true, selectedItemsParams, null, null, fullPromptForCall3_System, fullPromptForCall3_User, null, outputOfCall1, null);
            return new Response(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        let finalAiResponseOut = `## Full: Podcast Formatting ` + `\n\n` + finalAiResponse;
        let promptsMarkdownContent = `# Prompts for ${dateStr}\n\n`;
        promptsMarkdownContent += `## Call 3: Podcast Formatting\n\n`;
        if (fullPromptForCall3_System) promptsMarkdownContent += `### System One Instruction\n\`\`\`\n${fullPromptForCall3_System}\n\`\`\`\n\n`;


        let fullPromptForCall4_System = getSystemPromptShortPodcastFormatting(env);
        console.log("Call 4 to Chat (Podcast Formatting): User prompt length:", userPromptPodcastFormattingData.length);
        try {
            let podcastChunks = [];
            for await (const chunk of callChatAPIStream(env, userPromptPodcastFormattingData, fullPromptForCall4_System)) {
                podcastChunks.push(chunk);
            }
            finalAiResponse = podcastChunks.join('');
            if (!finalAiResponse || finalAiResponse.trim() === "") throw new Error("Chat podcast formatting call returned empty content.");
            finalAiResponse = removeMarkdownCodeBlock(finalAiResponse); // Clean the output
            console.log("Call 4 (Podcast Formatting) successful. Final output length:", finalAiResponse.length);
        } catch (error) {
            console.error("Error in Chat API Call 4 (Podcast Formatting):", error);
            const errorHtml = generateGenAiPageHtml(env, '生成AI播客脚本出错(播客文案)', `<p><strong>Failed during podcast formatting:</strong> ${escapeHtml(error.message)}</p>${error.stack ? `<pre>${escapeHtml(error.stack)}</pre>` : ''}`, dateStr, true, selectedItemsParams, null, null, fullPromptForCall3_System, fullPromptForCall3_User, null, outputOfCall1, null);
            return new Response(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        finalAiResponseOut += `\n\n` + `## Short: Podcast Formatting ` + `\n\n` + finalAiResponse;
        let fullPromptForCallSystem = fullPromptForCall3_System + `\n\n` + fullPromptForCall4_System;

        promptsMarkdownContent += `## Call 4: Podcast Formatting\n\n`;
        if (fullPromptForCall4_System) promptsMarkdownContent += `### System Two Instruction\n\`\`\`\n${fullPromptForCall4_System}\n\`\`\`\n\n`;
        if (fullPromptForCall3_User) promptsMarkdownContent += `### User Input (Output of Call 1)\n\`\`\`\n${fullPromptForCall3_User}\n\`\`\`\n\n`;

        let podcastScriptMarkdownContent = `# ${env.PODCAST_TITLE} ${formatDateToChinese(dateStr)}\n\n${removeMarkdownCodeBlock(finalAiResponseOut)}`;

        const successHtml = generateGenAiPageHtml(
            env,
            'AI播客脚本',
            escapeHtml(finalAiResponseOut),
            dateStr, false, selectedItemsParams,
            null, null, // No Call 1 prompts for this page
            fullPromptForCallSystem, fullPromptForCall3_User,
            convertEnglishQuotesToChinese(removeMarkdownCodeBlock(promptsMarkdownContent)),
            outputOfCall1, // No daily summary for this page
            convertEnglishQuotesToChinese(podcastScriptMarkdownContent)
        );
        return new Response(successHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /genAIPodcastScript (outer try-catch):", error);
        const pageDateForError = dateStr || getISODate();
        const itemsForActionOnError = Array.isArray(selectedItemsParams) ? selectedItemsParams : [];
        const errorHtml = generateGenAiPageHtml(env, '生成AI播客脚本出错', `<p><strong>Unexpected error:</strong> ${escapeHtml(error.message)}</p>${error.stack ? `<pre>${escapeHtml(error.stack)}</pre>` : ''}`, pageDateForError, true, itemsForActionOnError, null, null, fullPromptForCall3_System, fullPromptForCall3_User);
        return new Response(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}

/**
 * Core function to generate daily content.
 * Returns an object containing the generated HTML and raw markdown data, or throws an error.
 */
export async function generateDailyContent(env, dateStr, selectedItemsParams) {
    console.log(`Generating AI content for ${selectedItemsParams.length} selected item references from date ${dateStr}`);

    const allFetchedData = {};
    const fetchPromises = [];
    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            fetchPromises.push(
                getFromKV(env.DATA_KV, `${dateStr}-${sourceType}`).then(data => {
                    allFetchedData[sourceType] = data || [];
                })
            );
        }
    }
    await Promise.allSettled(fetchPromises);

    const selectedContentItems = [];
    let validItemsProcessedCount = 0;

    for (const selection of selectedItemsParams) {
        // Handle "type:id" format
        const [type, idStr] = selection.split(':');
        const itemsOfType = allFetchedData[type];
        const item = itemsOfType ? itemsOfType.find(dataItem => String(dataItem.id) === idStr) : null;

        if (item) {
            let itemText = "";
            switch (item.type) {
                case 'news':
                    itemText = `News Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nContent Summary: ${stripHtml(item.details.content_html)}`;
                    break;
                case 'project':
                    itemText = `Project Name: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nDescription: ${item.description}\nStars: ${item.details.totalStars}`;
                    break;
                case 'paper':
                    itemText = `Papers Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nAbstract/Content Summary: ${stripHtml(item.details.content_html)}`;
                    break;
                case 'socialMedia':
                    itemText = `socialMedia Post by ${item.authors}：Published: ${item.published_date}\nUrl: ${item.url}\nContent: ${stripHtml(item.details.content_html)}`;
                    break;
                default:
                    itemText = `Type: ${item.type}\nTitle: ${item.title || 'N/A'}\nDescription: ${item.description || 'N/A'}\nURL: ${item.url || 'N/A'}`;
                    if (item.published_date) itemText += `\nPublished: ${item.published_date}`;
                    if (item.source) itemText += `\nSource: ${item.source}`;
                    if (item.details && item.details.content_html) itemText += `\nContent: ${stripHtml(item.details.content_html)}`;
                    break;
            }

            if (itemText) {
                selectedContentItems.push(itemText);
                validItemsProcessedCount++;
            }
        } else {
            console.warn(`Could not find item for selection: ${selection} on date ${dateStr}.`);
        }
    }

    if (validItemsProcessedCount === 0) {
        throw new Error('Selected items could not be retrieved or resulted in no content.');
    }

    // Call 2: Process outputOfCall1
    let outputOfCall2 = null;
    let fullPromptForCall2_System = getSystemPromptSummarizationStepOne();
    let fullPromptForCall2_User = '\n\n------\n\n' + selectedContentItems.join('\n\n------\n\n') + '\n\n------\n\n';

    console.log("Call 2 to Chat (Processing Call 1 Output): User prompt length:", fullPromptForCall2_User.length);
    try {
        let processedChunks = [];
        for await (const chunk of callChatAPIStream(env, fullPromptForCall2_User, fullPromptForCall2_System)) {
            processedChunks.push(chunk);
        }
        outputOfCall2 = processedChunks.join('');
        if (!outputOfCall2 || outputOfCall2.trim() === "") throw new Error("Chat processing call returned empty content.");
        outputOfCall2 = removeMarkdownCodeBlock(outputOfCall2);
        console.log("Call 2 (Processing Call 1 Output) successful. Output length:", outputOfCall2.length);
    } catch (error) {
        console.error("Error in Chat API Call 2:", error);
        throw error; // Re-throw to be handled by caller
    }

    let promptsMarkdownContent = `# Prompts for ${dateStr}\n\n`;
    promptsMarkdownContent += `## Call 2: Summarized Content Format\n\n`;
    if (fullPromptForCall2_System) promptsMarkdownContent += `### System Instruction\n\`\`\`\n${fullPromptForCall2_System}\n\`\`\`\n\n`;
    if (fullPromptForCall2_User) promptsMarkdownContent += `### User Input (Output of Call 1)\n\`\`\`\n${fullPromptForCall2_User}\n\`\`\`\n\n`;

    let dailySummaryMarkdownContent = `## ${env.DAILY_TITLE} ${formatDateToChinese(dateStr)}` + '\n\n';
    dailySummaryMarkdownContent += '> ' + env.DAILY_TITLE_MIN + '\n\n';

    let fullPromptForCall3_System = getSystemPromptSummarizationStepThree();
    let fullPromptForCall3_User = outputOfCall2;
    let outputOfCall3 = null;
    console.log("Call 3 to Chat (Processing Call 1 Output): User prompt length:", fullPromptForCall3_User.length);
    try {
        let processedChunks = [];
        for await (const chunk of callChatAPIStream(env, fullPromptForCall3_User, fullPromptForCall3_System)) {
            processedChunks.push(chunk);
        }
        outputOfCall3 = processedChunks.join('');
        if (!outputOfCall3 || outputOfCall3.trim() === "") throw new Error("Chat processing call returned empty content.");
        outputOfCall3 = removeMarkdownCodeBlock(outputOfCall3);
        console.log("Call 3 (Processing Call 2 Output) successful. Output length:", outputOfCall3.length);
    } catch (error) {
        console.error("Error in Chat API Call 3:", error);
        throw error;
    }
    dailySummaryMarkdownContent += '\n\n### **今日摘要**\n\n```\n' + outputOfCall3 + '\n```\n\n';

    dailySummaryMarkdownContent += `\n\n${removeMarkdownCodeBlock(outputOfCall2)}`;
    if (env.INSERT_AD == 'true') dailySummaryMarkdownContent += insertAd() + `\n`;
    if (env.INSERT_FOOT == 'true') dailySummaryMarkdownContent += insertFoot() + `\n\n`;

    return {
        dailySummaryMarkdownContent,
        promptsMarkdownContent,
        outputOfCall2, // Needed for prompts display
        fullPromptForCall2_System,
        fullPromptForCall2_User
    };
}

export async function handleGenAIContent(request, env) {
    let dateStr;
    let selectedItemsParams = [];
    let formData;

    try {
        formData = await request.formData();
        const dateParam = formData.get('date');
        dateStr = dateParam ? dateParam : getISODate();
        selectedItemsParams = formData.getAll('selectedItems');

        if (selectedItemsParams.length === 0) {
            const errorHtml = generateGenAiPageHtml(env, '生成AI日报出错，未选生成条目', '<p><strong>No items were selected.</strong> Please go back and select at least one item.</p>', dateStr, true, null);
            return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        const result = await generateDailyContent(env, dateStr, selectedItemsParams);

        const successHtml = generateGenAiPageHtml(
            env,
            'AI日报',
            escapeHtml(result.dailySummaryMarkdownContent),
            dateStr, false, selectedItemsParams,
            result.fullPromptForCall2_System, result.fullPromptForCall2_User,
            null, null,
            convertEnglishQuotesToChinese(removeMarkdownCodeBlock(result.promptsMarkdownContent)),
            convertEnglishQuotesToChinese(result.dailySummaryMarkdownContent),
            null,
        );
        return new Response(successHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /genAIContent (outer try-catch):", error);
        const pageDateForError = dateStr || getISODate();
        const itemsForActionOnError = Array.isArray(selectedItemsParams) ? selectedItemsParams : [];
        const errorHtml = generateGenAiPageHtml(env, '生成AI日报出错', `<p><strong>Unexpected error:</strong> ${escapeHtml(error.message)}</p>${error.stack ? `<pre>${escapeHtml(error.stack)}</pre>` : ''}`, pageDateForError, true, itemsForActionOnError);
        return new Response(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}

export async function handleGenAIDailyAnalysis(request, env) {
    let dateStr;
    let userPromptDailyAnalysisData = '';
    let fullPromptForDailyAnalysis_System = null;
    let finalAiResponse = null;

    try {
        const requestBody = await request.json();
        dateStr = requestBody.date || getISODate();
        const summarizedContent = requestBody.summarizedContent; // Get summarized content from request body

        if (!summarizedContent || !summarizedContent.trim()) {
            return new Response('未提供摘要内容进行分析。', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }

        userPromptDailyAnalysisData = summarizedContent; // Use summarized content as user prompt

        console.log(`Generating AI daily analysis for date: ${dateStr} using summarized content.`);
        fullPromptForDailyAnalysis_System = getSystemPromptDailyAnalysis();

        console.log("Call to Chat (Daily Analysis): User prompt length:", userPromptDailyAnalysisData.length);
        try {
            let analysisChunks = [];
            for await (const chunk of callChatAPIStream(env, userPromptDailyAnalysisData, fullPromptForDailyAnalysis_System)) {
                analysisChunks.push(chunk);
            }
            finalAiResponse = analysisChunks.join('');
            if (!finalAiResponse || finalAiResponse.trim() === "") throw new Error("Chat daily analysis call returned empty content.");
            finalAiResponse = removeMarkdownCodeBlock(finalAiResponse); // Clean the output
            console.log("Daily Analysis successful. Final output length:", finalAiResponse.length);
        } catch (error) {
            console.error("Error in Chat API Call (Daily Analysis):", error);
            return new Response(`AI 日报分析失败: ${escapeHtml(error.message)}`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }

        return new Response(finalAiResponse, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /genAIDailyAnalysis (outer try-catch):", error);
        return new Response(`服务器错误: ${escapeHtml(error.message)}`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
}
