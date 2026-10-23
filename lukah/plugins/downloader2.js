'use strict';

const axios = require('axios');
const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');

const BOT_NAME = config.BOT_NAME || 'LUKA-XMD';
const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

function isValidUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

function getInput(ctx) {
    return String(ctx.text || '').trim();
}

function isPlatformUrl(url, pattern) {
    return isValidUrl(url) && pattern.test(new URL(url).hostname);
}

function sendText(ctx, message) {
    return ctx.reply(`${message}\n\n${FOOTER}`);
}

// 1. APK
addCmd({
    name: 'apk',
    aliases: ['apkdl', 'app'],
    desc: 'Search for an Android APK',
    category: 'download',

    handler: async (ctx) => {
        const query = getInput(ctx);

        if (!query) {
            return sendText(
                ctx,
                `Usage: ${ctx.prefix || '.'}apk <app name or URL>\nExample: ${ctx.prefix || '.'}apk WhatsApp`
            );
        }

        if (isValidUrl(query)) {
            return sendText(
                ctx,
                `APK Download Link:\n${query}`
            );
        }

        return sendText(
            ctx,
            `APK Search: ${query}\n\n` +
            'Search for this application on its official website or a trusted APK provider.'
        );
    }
});

// 2. SPOTIFY
addCmd({
    name: 'spotify',
    aliases: ['spdl', 'spotdl'],
    desc: 'Get a Spotify track link',
    category: 'download',

    handler: async (ctx) => {
        const url = getInput(ctx);

        if (!url) {
            return sendText(
                ctx,
                `Usage: ${ctx.prefix || '.'}spotify <Spotify URL>`
            );
        }

        if (!isPlatformUrl(url, /(^|\.)spotify\.com$/i)) {
            return sendText(ctx, 'Please provide a valid Spotify link.');
        }

        return sendText(
            ctx,
            `Spotify Link:\n${url}\n\n` +
            'Use Spotify to play or download tracks where available.'
        );
    }
});

// 3. GOOGLE DRIVE
addCmd({
    name: 'gdrive',
    aliases: ['drive'],
    desc: 'Get a Google Drive file link',
    category: 'download',

    handler: async (ctx) => {
        const url = getInput(ctx);

        if (!url) {
            return sendText(
                ctx,
                `Usage: ${ctx.prefix || '.'}gdrive <Google Drive URL>`
            );
        }

        if (!isPlatformUrl(url, /(^|\.)drive\.google\.com$/i)) {
            return sendText(ctx, 'Please provide a valid Google Drive link.');
        }

        return sendText(
            ctx,
            `Google Drive Link:\n${url}\n\n` +
            'Make sure the file is shared with the appropriate access permissions.'
        );
    }
});

// 4. PASTEBIN
addCmd({
    name: 'pastebin',
    aliases: ['paste', 'pbin'],
    desc: 'Read a public Pastebin paste',
    category: 'download',

    handler: async (ctx) => {
        const url = getInput(ctx);

        if (!url) {
            return sendText(
                ctx,
                `Usage: ${ctx.prefix || '.'}pastebin <Pastebin URL>`
            );
        }

        if (!isPlatformUrl(url, /(^|\.)pastebin\.com$/i)) {
            return sendText(ctx, 'Please provide a valid Pastebin link.');
        }

        try {
            const pasteId = new URL(url).pathname
                .split('/')
                .filter(Boolean)
                .pop();

            if (!pasteId || !/^[a-zA-Z0-9]+$/.test(pasteId)) {
                return sendText(ctx, 'The Pastebin ID is invalid.');
            }

            const response = await axios.get(
                `https://pastebin.com/raw/${pasteId}`,
                { timeout: 20000, responseType: 'text' }
            );

            const content = String(response.data || '');

            if (!content.trim()) {
                return sendText(ctx, 'The Pastebin content is empty.');
            }

            if (content.length > 12000) {
                return sendText(
                    ctx,
                    'The Pastebin content is too long to display in one message.'
                );
            }

            return sendText(ctx, `PASTEBIN CONTENT:\n\n${content}`);
        } catch (error) {
            console.error('[PASTEBIN]', error.message);

            return sendText(
                ctx,
                'Unable to retrieve this paste. It may be private, deleted, or unavailable.'
            );
        }
    }
});

// 5. GITHUB
addCmd({
    name: 'githubdl',
    aliases: ['gitdl', 'github'],
    desc: 'Get a GitHub repository link',
    category: 'download',

    handler: async (ctx) => {
        const url = getInput(ctx);

        if (!url) {
            return sendText(
                ctx,
                `Usage: ${ctx.prefix || '.'}githubdl <GitHub repository URL>`
            );
        }

        if (!isPlatformUrl(url, /(^|\.)github\.com$/i)) {
            return sendText(ctx, 'Please provide a valid GitHub repository link.');
        }

        return sendText(
            ctx,
            `GitHub Repository:\n${url}\n\n` +
            'Open the repository and select Code → Download ZIP to download its files.'
        );
    }
});

