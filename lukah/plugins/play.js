'use strict';

const { guru } = require('../../luka');
const { addCmd } = require('../../luka/connection/handlers');
const config = require('../../luka/database/settings');
const axios = require('axios');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');

const API_TIMEOUT = 60000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

function isYtUrl(str) {
    return /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}/i.test(str);
}

function extractYtId(url) {
    const match = String(url).match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/))([\w-]{11})/i
    );
    return match ? match[1] : null;
}

function cleanTitle(title) {
    return String(title || 'audio')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .slice(0, 150);
}

function formatDuration(value) {
    if (typeof value === 'string' && value.includes(':')) return value;

    const seconds = Number(value) || 0;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function getArray(data) {
    const candidates = [
        data,
        data?.results,
        data?.items,
        data?.videos,
        data?.data,
        data?.data?.results,
        data?.data?.items,
        data?.result,
        data?.result?.results,
        data?.result?.videos
    ];

    return candidates.find(Array.isArray) || [];
}

async function getJson(url, timeout = API_TIMEOUT) {
    const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': UA },
        maxRedirects: 5
    });

    return response.data;
}

// Search providers from the supplied legacy plugin.
// These endpoints are third-party services and may change or stop working.
async function searchYouTube(query) {
    const endpoints = [
        async () => {
            const data = await getJson(
                `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encodeURIComponent(query)}`
            );

            const result = data?.result;
            const item = result ? [{
                title: result.title,
                url: result.videoUrl,
                thumbnail: result.thumbnail,
                duration: result.duration
            }] : [];

            if (!data?.status || !item[0]?.url) {
                throw new Error('Search provider returned no results');
            }

            return item;
        },
        async () => {
            const data = await getJson(
                `https://api.nexray.web.id/downloader/ytmp3?url=${encodeURIComponent(
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
                )}`
            );

            const result = getArray(data);
            if (result.length) return result;

            throw new Error('No search results');
        }
    ];

    for (const endpoint of endpoints) {
        try {
            const result = await endpoint();
            if (result.length) return result;
        } catch (error) {
            console.error('[YT SEARCH PROVIDER]', error.message);
        }
    }

    return [];
}

async function resolveAudio(query, isUrl) {
    const encoded = encodeURIComponent(query);
    const id = extractYtId(query);

    const endpoints = [];

    if (isUrl) {
        endpoints.push(async () => {
            const data = await getJson(
                `https://api.sidycoders.xyz/api/ytdl?url=${encoded}&format=mp3&apikey=memberdycoders`
            );

            if (data?.status && data?.cdn) {
                return {
                    url: data.cdn,
                    title: data.title || 'Track'
                };
            }

            throw new Error('Sidycoders audio unavailable');
        });

        if (id) {
            endpoints.push(async () => {
                const data = await getJson(
                    `https://api.nexray.web.id/downloader/ytmp3?url=${encodeURIComponent(
                        `https://www.youtube.com/watch?v=${id}`
                    )}`
                );

                if (data?.status && data?.result?.url) {
                    return {
                        url: data.result.url,
                        title: data.result.title || 'Track',
                        thumbnail: data.result.thumbnail || ''
                    };
                }

                throw new Error('Nexray audio unavailable');
            });
        }
    } else {
        endpoints.push(async () => {
            const data = await getJson(
                `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encoded}`
            );

            if (data?.status && data?.result?.downloadUrl) {
                return {
                    url: data.result.downloadUrl,
                    title: data.result.title || query,
                    thumbnail: data.result.thumbnail || '',
                    sourceUrl: data.result.videoUrl || ''
                };
            }

            throw new Error('Search audio unavailable');
        });
    }

    // Legacy API fallbacks from the supplied plugin.
    const legacy = [
        `https://api.giftedtech.web.id/api/download/ytmp3?apikey=free&url=${encoded}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encoded}`,
        `https://api.siputzx.my.id/api/d/ytmp3?url=${encoded}`,
        `https://apiskeith.top/download/audio?url=${encoded}`
    ];

    for (const endpoint of legacy) {
        endpoints.push(async () => {
            const data = await getJson(endpoint);
            const result = data?.result;

            const url =
                (typeof result === 'string' ? result : null) ||
                data?.download_url ||
                result?.url ||
                result?.download_url ||
                data?.url ||
                data?.link;

            if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
                throw new Error('Audio URL missing');
            }

            return {
                url,
                title: data?.title || result?.title || query
            };
        });
    }

    for (const endpoint of endpoints) {
        try {
            const result = await endpoint();
            if (result?.url) return result;
        } catch (error) {
            console.error('[AUDIO PROVIDER]', error.message);
        }
    }

    return null;
}

async function resolveVideo(query, isUrl) {
    const encoded = encodeURIComponent(query);
    const id = extractYtId(query);
    const endpoints = [];

    endpoints.push(async () => {
        const url = isUrl
            ? query
            : `https://www.youtube.com/results?search_query=${encoded}`;

        const data = await getJson(
            `https://api.nexray.web.id/downloader/ytmp4?url=${encodeURIComponent(url)}&resolusi=720`,
            90000
        );

        if (data?.status && data?.result?.url) {
            return {
                url: data.result.url,
                title: data.result.title || query,
                duration: data.result.duration || 0
            };
        }

        throw new Error('Nexray video unavailable');
    });

    if (isUrl) {
        endpoints.push(async () => {
            const data = await getJson(
                `https://api.sidycoders.xyz/api/ytdl?url=${encoded}&format=mp4&apikey=memberdycoders`,
                90000
            );

            if (data?.status && data?.cdn) {
                return {
                    url: data.cdn,
                    title: data.title || 'Video'
                };
            }

            throw new Error('Sidycoders video unavailable');
        });
    }

    const legacy = [
        `https://api.giftedtech.web.id/api/download/ytmp4?apikey=free&url=${encoded}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encoded}`,
        `https://api.siputzx.my.id/api/d/ytmp4?url=${encoded}`,
        `https://apiskeith.top/download/video?url=${encoded}`
    ];

    for (const endpoint of legacy) {
        endpoints.push(async () => {
            const data = await getJson(endpoint, 90000);
            const result = data?.result;

            const url =
                (typeof result === 'string' ? result : null) ||
                data?.download_url ||
                result?.url ||
                result?.download_url ||
                data?.url ||
                data?.link;

            if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
                throw new Error('Video URL missing');
            }

            return {
                url,
                title: data?.title || result?.title || query
            };
        });
    }

    for (const endpoint of endpoints) {
        try {
            const result = await endpoint();
            if (result?.url) return result;
        } catch (error) {
            console.error('[VIDEO PROVIDER]', error.message);
        }
    }

    return null;
}

async function sendAudio(ctx, query, directOnly = false) {
    const isUrl = isYtUrl(query);

    await ctx.react('🔍');

    let resolved;

    if (isUrl || directOnly) {
        resolved = await resolveAudio(query, true);
    } else {
        const results = await searchYouTube(query);

        if (results.length) {
            const first = results[0];
            const videoUrl = first.url || first.link;

            if (videoUrl && isYtUrl(videoUrl)) {
                resolved = await resolveAudio(videoUrl, true);
            }
        }

        // Search/download provider fallback.
        if (!resolved) resolved = await resolveAudio(query, false);
    }

    if (!resolved?.url) {
        await ctx.react('❌');
        return ctx.reply(
            `❌ Audio download failed for: ${query}\n\n` +
            `The available download providers returned no usable audio link.\n\n${FOOTER}`
        );
    }

    await ctx.react('⬇️');

    const title = resolved.title || query;
    const response = await axios.get(resolved.url, {
        responseType: 'arraybuffer',
        timeout: 90000,
        maxContentLength: Infinity,
        headers: { 'User-Agent': UA }
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length < 4096) {
        throw new Error('Downloaded audio is empty or invalid');
    }

    await ctx.sock.sendMessage(ctx.from, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle(title)}.mp3`,
        contextInfo: channelCtx()
    }, { quoted: ctx.m });

    await ctx.react('✅');
}

async function sendVideo(ctx, query) {
    const isUrl = isYtUrl(query);

    await ctx.react('🔍');

    let target = query;

    if (!isUrl) {
        const results = await searchYouTube(query);
        const first = results[0];

        if (first?.url || first?.link) {
            target = first.url || first.link;
        }
    }

    const resolved = await resolveVideo(target, isYtUrl(target));

    if (!resolved?.url) {
        await ctx.react('❌');
        return ctx.reply(
            `❌ Video download failed for: ${query}\n\n${FOOTER}`
        );
    }

    await ctx.react('⬇️');

    await ctx.sock.sendMessage(ctx.from, {
        video: { url: resolved.url },
        mimetype: 'video/mp4',
        caption:
            `🎬 *${resolved.title || query}*\n` +
            (resolved.duration
                ? `⏱️ ${formatDuration(resolved.duration)}\n`
                : '') +
            `\n${config.BOT_NAME || 'LUKA-XMD'}\n${FOOTER}`,
        contextInfo: channelCtx()
    }, { quoted: ctx.m });

    await ctx.react('✅');
}

// PLAY
addCmd({
    name: 'play',
    aliases: ['music', 'song', 'yta', 'audio', 'ply', 'ytmp3', 'ytaudio'],
    desc: 'Search and download a YouTube song',
    usage: 'play <song name or YouTube URL>',
    category: 'downloader',

    handler: async (ctx) => {
        const query = (ctx.text || '').trim();

        if (!query) {
            return ctx.reply(
                `🎵 *PLAY*\n\n` +
                `Usage: ${ctx.prefix}play diamond komasava\n` +
                `Or: ${ctx.prefix}play https://youtu.be/VIDEO_ID\n\n${FOOTER}`
            );
        }

        try {
            await sendAudio(ctx, query);
        } catch (error) {
            console.error('[PLAY ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ Audio failed: ${error.message}\n\n${FOOTER}`);
        }
    }
});

// YTMP3
addCmd({
    name: 'ytmp3',
    aliases: ['ymp3', 'yt3'],
    desc: 'Download MP3 from a YouTube URL',
    usage: 'ytmp3 <YouTube URL>',
    category: 'downloader',

    handler: async (ctx) => {
        const query = (ctx.text || '').trim();

        if (!query || !isYtUrl(query)) {
            return ctx.reply(
                `❌ Provide a valid YouTube URL.\n\n${FOOTER}`
            );
        }

        try {
            await sendAudio(ctx, query, true);
        } catch (error) {
            console.error('[YTMP3 ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ MP3 failed: ${error.message}\n\n${FOOTER}`);
        }
    }
});

// VIDEO
addCmd({
    name: 'video',
    aliases: ['ytmp4', 'mp4', 'dlmp4', 'ytv', 'ytvideo'],
    desc: 'Download a YouTube video',
    usage: 'video <title or YouTube URL>',
    category: 'downloader',

    handler: async (ctx) => {
        const query = (ctx.text || '').trim();

        if (!query) {
            return ctx.reply(
                `🎬 *VIDEO*\n\n` +
                `Usage: ${ctx.prefix}video diamond komasava\n` +
                `Or: ${ctx.prefix}video https://youtu.be/VIDEO_ID\n\n${FOOTER}`
            );
        }

        try {
            await sendVideo(ctx, query);
        } catch (error) {
            console.error('[VIDEO ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ Video failed: ${error.message}\n\n${FOOTER}`);
        }
    }
});

// YTSEARCH
addCmd({
    name: 'ytsearch',
    aliases: ['yts', 'youtubesearch'],
    desc: 'Search YouTube videos',
    usage: 'ytsearch <query>',
    category: 'downloader',

    handler: async (ctx) => {
        const query = (ctx.text || '').trim();

        if (!query) {
            return ctx.reply(
                `🔍 Usage: ${ctx.prefix}ytsearch diamond komasava`
            );
        }

        try {
            await ctx.react('🔍');

            const results = await searchYouTube(query);

            if (!results.length) {
                await ctx.react('❌');
                return ctx.reply(
                    `❌ No search results returned for "${query}".\n\n${FOOTER}`
                );
            }

            const lines = results.slice(0, 5).map((item, index) => {
                const url = item.url || item.link || '';
                const title = item.title || 'Unknown title';
                const duration = item.duration || item.timestamp || '?';

                return `${index + 1}. *${title}*\n` +
                    `⏱️ ${duration}\n` +
                    `🔗 ${url}`;
            });

            await ctx.reply(
                `🔍 *YouTube Search: ${query}*\n\n` +
                `${lines.join('\n\n')}\n\n${FOOTER}`
            );

            await ctx.react('✅');
        } catch (error) {
            console.error('[YTSEARCH ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ Search failed: ${error.message}`);
        }
    }
});
