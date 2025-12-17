// src/handlers/githubCommit.js
import { getISODate, escapeHtml } from '../helpers.js';
import { getGitHubFileSha, createOrUpdateGitHubFile } from '../github.js';

/**
 * Core function to commit files to GitHub.
 * Returns an object with the results of the operations.
 */
export async function commitFilesToGitHub(env, dateStr, dailyMd, podcastMd) {
    const results = {
        daily: { status: 'skipped', message: 'No content' },
        podcast: { status: 'skipped', message: 'No content' }
    };

    if (dailyMd) {
        const filePath = `daily/${dateStr}.md`;
        const message = `Add daily report for ${dateStr}`;
        try {
            const sha = await getGitHubFileSha(env, filePath);
            await createOrUpdateGitHubFile(env, filePath, dailyMd, message, sha);
            results.daily = { status: sha ? 'updated' : 'created', path: filePath };
        } catch (error) {
            console.error(`Error committing daily report: ${error}`);
            throw new Error(`Failed to commit daily report: ${error.message}`);
        }
    }

    if (podcastMd) {
        const podcastFilePath = `podcast/${dateStr}.md`;
        const podcastMessage = `Add podcast script for ${dateStr}`;
        try {
            const sha = await getGitHubFileSha(env, podcastFilePath);
            await createOrUpdateGitHubFile(env, podcastFilePath, podcastMd, podcastMessage, sha);
            results.podcast = { status: sha ? 'updated' : 'created', path: podcastFilePath };
        } catch (error) {
            console.error(`Error committing podcast script: ${error}`);
            throw new Error(`Failed to commit podcast script: ${error.message}`);
        }
    }

    return results;
}

export async function handleCommitToGitHub(request, env) {
    let dateStr;
    let dailyMdParam;
    let podcastMdParam;

    try {
        const formData = await request.formData();
        dateStr = formData.get('date');
        dailyMdParam = formData.get('dailyMd');
        podcastMdParam = formData.get('podcastMd');

        if (!dateStr) {
            return new Response('Date is required.', { status: 400 });
        }

        const results = await commitFilesToGitHub(env, dateStr, dailyMdParam, podcastMdParam);

        let successMessage = `<h2>Successfully Committed to GitHub for ${dateStr}</h2>`;
        if (results.daily.status !== 'skipped') {
            successMessage += `<p>Daily Report: <strong>${results.daily.status}</strong> at <code>${results.daily.path}</code></p>`;
        }
        if (results.podcast.status !== 'skipped') {
            successMessage += `<p>Podcast Script: <strong>${results.podcast.status}</strong> at <code>${results.podcast.path}</code></p>`;
        }

        successMessage += `<p><a href="/getContentHtml">Back to Daily Generation</a></p>`;

        return new Response(successMessage, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /commitToGitHub:", error);
        return new Response(`Error committing to GitHub: ${escapeHtml(error.message)}`, { status: 500 });
    }
}
