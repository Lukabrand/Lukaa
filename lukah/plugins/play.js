'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const yts = require('yt-search');
const axios = require('axios');

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

const MAX_AUDIO_SIZE = 60 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MIN_BUFFER_SIZE = 10 * 1024;

// Configure your external downloader API endpoints here.
// Each endpoint must return:
// { success: true, result: { download_url: "https://..." } }
const DOWNLOAD_APIS = {
    audio: [
        process.env.DOWNLOAD_API_AUDIO || '',
        process.env.DOWNLOAD_API_AUDIO_2 || ''
    ].filter(Boolean),

    video: [
        process.env.DOWNLOAD_API_VIDEO || '',
        process.env.DOWNLOAD_API_VIDEO_2 || ''
    ].filter(Boolean)
};

function cleanFilename(name, extension) {
    const safe = String(name || 'media')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'media';

    return `${safe}.${extension}`;
}

function validBuffer(buffer) {
    return Buffer.isBuffer(buffer) && buffer.length > MIN_BUFFER_SIZE;
}

function getDownloadUrl(data) {
    return (
        data?.result?.download_url ||
        data?.result?.url ||
        data?.download_url ||
        data?.url ||
        data?.data?.download_url ||
        data?.data?.url ||
        null
    );
}

function buildApiUrl(template, videoUrl) {
    if (template.includes('{url}')) {
        return template.replace('{url}', encodeURIComponent(videoUrl));
    }

    const separator = template.includes('?') ? '&' : '?';
    return `${template}${separator}url=${encodeURIComponent(videoUrl)}`;
}

async function downloadFromApis(videoUrl, type) {
    const endpoints = DOWNLOAD_APIS[type] || [];

    for (const endpoint of endpoints) {
        try {
            const apiUrl = buildApiUrl(endpoint, videoUrl);

            const response = await axios.get(apiUrl, {
                timeout: 25000,
                responseType: 'json',
                headers: {
                    'User-Agent': 'BLACK-PANTHER-MD/1.0'
                }
            });

            const url = getDownloadUrl(response.data);

            if (!url || !/^https?:\/\//i.test(url)) {
                continue;
            }

            const mediaResponse = await axios.get(url, {
                timeout: 60000,
                responseType: 'arraybuffer',
                maxContentLength: type === 'audio'
                    ? MAX_AUDIO_SIZE + 1
                    : MAX_VIDEO_SIZE + 1,
                maxBodyLength: type === 'audio'
                    ? MAX_AUDIO_SIZE + 1
                    : MAX_VIDEO_SIZE + 1
            });

            const buffer = Buffer.from(mediaResponse.data);

            if (validBuffer(buffer)) {
                return buffer;
            }
        } catch (error) {
            console.error(`[PLAY] ${type} API failed:`, error.message);
        }
    }

    return null;
}

async function searchYouTube(query) {
    const result = await yts(query);

    if (!result?.videos?.length) {
        return null;
    }

    return result.videos[0];
}

async function getMedia(ctx, video, type) {
    await ctx.react('⬇️');

    const buffer = await downloadFromApis(video.url, type);

    if (!buffer) {
        await ctx.react('❌');
        await ctx.reply(
            `Unable to download this ${type}.\n\n` +
            `The configured download APIs may be unavailable or incorrectly configured.\n\n` +
            `Please try again later.\n\n${FOOTER}`
        );

        return;
    }

    const sock = ctx.sock;
    const from = ctx.from;
    const quoted = ctx.m ? { quoted: ctx.m } : {};

    const title = video.title || 'Downloaded Media';
    const filename = cleanFilename(
        title,
        type === 'audio' ? 'mp3' : 'mp4'
    );

    const size = buffer.length;

    try {
        if (type === 'audio') {
            if (size > MAX_AUDIO_SIZE) {
                await sock.sendMessage(
                    from,
                    {
                        document: buffer,
                        mimetype: 'audio/mpeg',
                        fileName: filename,
                        caption: `${title}\n\n${FOOTER}`
                    },
                    quoted
                );
            } else {
                await sock.sendMessage(
                    from,
                    {
                        audio: buffer,
                        mimetype: 'audio/mpeg',
                        fileName: filename,
                        ptt: false
                    },
                    quoted
                );
            }
        } else {
            if (size > MAX_VIDEO_SIZE) {
                await sock.sendMessage(
                    from,
                    {
                        document: buffer,
                        mimetype: 'video/mp4',
                        fileName: filename,
                        caption: `${title}\n\n${FOOTER}`
                    },
                    quoted
                );
            } else {
                await sock.sendMessage(
                    from,
                    {
                        video: buffer,
                        mimetype: 'video/mp4',
                        fileName: filename,
                        caption: `${title}\n\n${FOOTER}`
                    },
                    quoted
                );
            }
        }

        await ctx.react('✅');
    } catch (error) {
        console.error('[PLAY] Send media error:', error.message);
        await ctx.react('❌');
        await ctx.reply(`Failed to send the media.\n\n${FOOTER}`);
    }
}

async function runSearch(ctx, type) {
    const query = String(ctx.text || '').trim();

    if (!query) {
        await ctx.react('❌');
        return ctx.reply(
            `Please provide a ${type === 'audio' ? 'song' : 'video'} name or URL.\n\n` +
            `Example: ${ctx.prefix || '.'}${type === 'audio' ? 'play Faded Alan Walker' : 'video Alan Walker Faded'}\n\n` +
            FOOTER
        );
    }

    try {
        await ctx.react('🔎');

        let video;

        if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(query)) {
            video = {
                url: query,
                title: 'YouTube Media',
                timestamp: 'Unknown',
                thumbnail: null
            };
        } else {
            video = await searchYouTube(query);
        }

        if (!video) {
            await ctx.react('❌');
            return ctx.reply(`No YouTube results found.\n\n${FOOTER}`);
        }

        const details =
            `🎵 *Title:* ${video.title || 'Unknown'}\n` +
            `⏱️ *Duration:* ${video.timestamp || 'Unknown'}\n` +
            `🔗 *URL:* ${video.url}\n\n` +
            `⬇️ Downloading ${type}...\n\n${FOOTER}`;

        await ctx.reply(details);
        await getMedia(ctx, video, type);
    } catch (error) {
        console.error('[PLAY] Search error:', error.message);
        await ctx.react('❌');
        await ctx.reply(
            `An error occurred while searching or downloading.\n\n${FOOTER}`
        );
    }
}

async function runDirectDownload(ctx, type) {
    const query = String(ctx.text || '').trim();

    if (!query) {
        await ctx.react('❌');
        return ctx.reply(
            `Please provide a direct media URL.\n\n` +
            `Example: ${ctx.prefix || '.'}${type === 'audio' ? 'sendaudio' : 'sendvideo'} https://example.com/media\n\n` +
            FOOTER
        );
    }

    if (!/^https?:\/\//i.test(query)) {
        await ctx.react('❌');
        return ctx.reply(`Please provide a valid HTTP/HTTPS URL.\n\n${FOOTER}`);
    }

    try {
        await ctx.react('⬇️');

        const response = await axios.get(query, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: type === 'audio'
                ? MAX_AUDIO_SIZE + 1
                : MAX_VIDEO_SIZE + 1,
            maxBodyLength: type === 'audio'
                ? MAX_AUDIO_SIZE + 1
                : MAX_VIDEO_SIZE + 1
        });

        const buffer = Buffer.from(response.data);

        if (!validBuffer(buffer)) {
            await ctx.react('❌');
            return ctx.reply(
                'The URL did not return a valid media file.\n\n' + FOOTER
            );
        }

        const contentType = String(
            response.headers['content-type'] || ''
        ).toLowerCase();

        if (
            contentType.includes('text/html') ||
            contentType.includes('application/json')
        ) {
            await ctx.react('❌');
            return ctx.reply(
                'The URL returned a webpage or JSON, not a media file.\n\n' +
                FOOTER
            );
        }

        const sock = ctx.sock;
        const from = ctx.from;
        const quoted = ctx.m ? { quoted: ctx.m } : {};

        if (type === 'audio') {
            await sock.sendMessage(
                from,
                {
                    audio: buffer,
                    mimetype: contentType.includes('ogg')
                        ? 'audio/ogg'
                        : 'audio/mpeg',
                    ptt: false
                },
                quoted
            );
        } else {
            await sock.sendMessage(
                from,
                {
                    video: buffer,
                    mimetype: contentType.includes('webm')
                        ? 'video/webm'
                        : 'video/mp4',
                    caption: FOOTER
                },
                quoted
            );
        }

        await ctx.react('✅');
    } catch (error) {
        console.error('[PLAY] Direct download error:', error.message);
        await ctx.react('❌');
        await ctx.reply(
            `Failed to download media from that URL.\n\n${FOOTER}`
        );
    }
}

// 1. PLAY — search and download audio
addCmd({
    name: 'play',
    aliases: ['ytmp3', 'yta'],
    desc: 'Search YouTube and download audio',
    usage: '.play song name',
    category: 'downloader',

    handler: async (ctx) => {
        return runSearch(ctx, 'audio');
    }
});

// 2. VIDEO — search and download video
addCmd({
    name: 'video',
    aliases: ['ytmp4', 'mp4'],
    desc: 'Search YouTube and download video',
    usage: '.video video name',
    category: 'downloader',

    handler: async (ctx) => {
        return runSearch(ctx, 'video');
    }
});

// 3. SENDAUDIO — download audio from a direct URL
addCmd({
    name: 'sendaudio',
    aliases: ['sendmp3', 'dlaudio'],
    desc: 'Download audio from a direct URL',
    usage: '.sendaudio https://example.com/audio.mp3',
    category: 'downloader',

    handler: async (ctx) => {
        return runDirectDownload(ctx, 'audio');
    }
});

// 4. SENDVIDEO — download video from a direct URL
addCmd({
    name: 'sendvideo',
    aliases: ['sendmp4', 'dlvideo'],
    desc: 'Download video from a direct URL',
    usage: '.sendvideo https://example.com/video.mp4',
    category: 'downloader',

    handler: async (ctx) => {
        return runDirectDownload(ctx, 'video');
    }
});
