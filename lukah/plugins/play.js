'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const config = require('../../luka/config/settings');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');

const API_TIMEOUT = 60000;
const DOWNLOAD_TIMEOUT = 90000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

// ═══════════════════════════════════════════════════════════
// YOUTUBE HELPERS
// ═══════════════════════════════════════════════════════════

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
    if (typeof value === 'string' && value.includes(':')) {
        return value;
    }

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
        headers: {
            'User-Agent': UA
        },
        maxRedirects: 5
    });

    return response.data;
}

// ═══════════════════════════════════════════════════════════
// AUDIO DOWNLOAD VALIDATION
// ═══════════════════════════════════════════════════════════

async function downloadAudioBuffer(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Error('Invalid audio download URL');
    }

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        maxRedirects: 5,
        headers: {
            'User-Agent': UA,
            'Accept': 'audio/mpeg, audio/*, application/octet-stream, */*'
        },
        validateStatus: status => status >= 200 && status < 300
    });

    const buffer = Buffer.from(response.data);

    if (!buffer.length || buffer.length < 4096) {
        throw new Error('Downloaded audio is empty or too small');
    }

    const contentType = String(
        response.headers?.['content-type'] || ''
    ).toLowerCase();

    // Some APIs return an HTML error page instead of an audio file.
    const preview = buffer
        .subarray(0, 300)
        .toString('utf8')
        .trim()
        .toLowerCase();

    const looksLikeHtml =
        contentType.includes('text/html') ||
        preview.startsWith('<!doctype html') ||
        preview.startsWith('<html') ||
        preview.startsWith('<head');

    if (looksLikeHtml) {
        throw new Error('Provider returned an HTML page instead of audio');
    }

    return buffer;
}

// ═══════════════════════════════════════════════════════════
// YOUTUBE SEARCH
// ═══════════════════════════════════════════════════════════

async function searchYouTube(query) {
    const endpoints = [
        async () => {
            const data = await getJson(
                `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encodeURIComponent(query)}`
            );

            const result = data?.result;

            const videoUrl =
                result?.videoUrl ||
                result?.url ||
                result?.link;

            if (data?.status && videoUrl) {
                return [{
                    title: result.title || query,
                    url: videoUrl,
                    thumbnail: result.thumbnail || '',
                    duration: result.duration || ''
                }];
            }

            throw new Error('No valid search result');
        },

        async () => {
            const data = await getJson(
                `https://api.nexray.web.id/downloader/ytmp3?url=${encodeURIComponent(
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
                )}`
            );

            const items = getArray(data);

            const results = items
                .map(item => ({
                    title: item.title || item.name || '',
                    url: item.url || item.videoUrl || item.link || '',
                    thumbnail: item.thumbnail || '',
                    duration: item.duration || item.timestamp || ''
                }))
                .filter(item =>
                    item.title &&
                    /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(item.url)
                );

            if (results.length) return results;

            throw new Error('No valid results from Nexray');
        }
    ];

    for (const endpoint of endpoints) {
        try {
            const results = await endpoint();
            if (results.length) return results;
        } catch (error) {
            console.error('[YT SEARCH]', error.message);
        }
    }

    return [];
}

// ═══════════════════════════════════════════════════════════
// AUDIO RESOLVER
// Tries the next provider if resolving OR downloading fails.
// ═══════════════════════════════════════════════════════════

async function resolveAudio(query, isUrl) {
    const encoded = encodeURIComponent(query);
    const id = extractYtId(query);

    const endpoints = [];

    if (isUrl) {
        // Provider 1: Sidycoders
        endpoints.push(async () => {
            const data = await getJson(
                `https://api.sidycoders.xyz/api/ytdl?url=${encoded}&format=mp3&apikey=memberdycoders`
            );

            if (data?.status && data?.cdn) {
                return {
                    url: data.cdn,
                    title: data.title || 'Track',
                    thumbnail: data.thumbnail || ''
                };
            }

            throw new Error('Sidycoders audio unavailable');
        });

        // Provider 2: Nexray
        if (id) {
            endpoints.push(async () => {
                const data = await getJson(
                    `https://api.nexray.web.id/downloader/ytmp3?url=${encodeURIComponent(
                        `https://www.youtube.com/watch?v=${id}`
                    )}`
                );

                const result = data?.result;

                const url =
                    result?.url ||
                    result?.downloadUrl ||
                    result?.download_url;

                if (data?.status && url) {
                    return {
                        url,
                        title: result?.title || 'Track',
                        thumbnail: result?.thumbnail || ''
                    };
                }

                throw new Error('Nexray audio unavailable');
            });
        }
    } else {
        // Provider 1: Apiziaul search download
        endpoints.push(async () => {
            const data = await getJson(
                `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encoded}`
            );

            const result = data?.result;

            const url =
                result?.downloadUrl ||
                result?.download_url;

            if (data?.status && url) {
                return {
                    url,
                    title: result?.title || query,
                    thumbnail: result?.thumbnail || '',
                    sourceUrl: result?.videoUrl || ''
                };
            }

            throw new Error('Apiziaul audio unavailable');
        });
    }

    // Legacy provider fallbacks.
    const legacy = [
        {
            name: 'GiftedTech',
            url: `https://api.giftedtech.web.id/api/download/ytmp3?apikey=free&url=${encoded}`
        },
        {
            name: 'Ryzendesu',
            url: `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encoded}`
        },
        {
            name: 'Siputzx',
            url: `https://api.siputzx.my.id/api/d/ytmp3?url=${encoded}`
        },
        {
            name: 'Apiskeith',
            url: `https://apiskeith.top/download/audio?url=${encoded}`
        }
    ];

    for (const provider of legacy) {
        endpoints.push(async () => {
            const data = await getJson(provider.url);
            const result = data?.result;

            const url =
                (typeof result === 'string' ? result : null) ||
                data?.download_url ||
                result?.url ||
                result?.download_url ||
                data?.url ||
                data?.link;

            if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
                throw new Error(`${provider.name}: Audio URL missing`);
            }

            return {
                url,
                title: data?.title || result?.title || query
            };
        });
    }

    let lastError = null;

    for (let index = 0; index < endpoints.length; index++) {
        let result;

        try {
            // Resolve a download URL from the current provider.
            result = await endpoints[index]();

            if (!result?.url) {
                throw new Error('Download URL missing');
            }

            // IMPORTANT:
            // Download the actual file here. If this provider returns 404,
            // HTML, an empty file, or another download error, continue
            // to the next provider instead of stopping at the first URL.
            const buffer = await downloadAudioBuffer(result.url);

            console.log(
                `[AUDIO PROVIDER] Provider ${index + 1}/${endpoints.length} succeeded`
            );

            return {
                ...result,
                buffer
            };
        } catch (error) {
            lastError = error;

            console.error(
                `[AUDIO PROVIDER ${index + 1}/${endpoints.length}]`,
                error.response?.status || error.message
            );
        }
    }

    if (lastError) {
        console.error('[AUDIO] All providers failed:', lastError.message);
    }

    return null;
}

// ═══════════════════════════════════════════════════════════
// VIDEO RESOLVER
// ═══════════════════════════════════════════════════════════

async function resolveVideo(query, isUrl) {
    const encoded = encodeURIComponent(query);
    const endpoints = [];

    // Provider 1: Nexray
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

    // Provider 2: Sidycoders
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

    // Legacy video providers.
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

    for (let index = 0; index < endpoints.length; index++) {
        try {
            const result = await endpoints[index]();

            if (result?.url) {
                console.log(
                    `[VIDEO PROVIDER] Provider ${index + 1}/${endpoints.length} resolved`
                );

                return result;
            }
        } catch (error) {
            console.error(
                `[VIDEO PROVIDER ${index + 1}/${endpoints.length}]`,
                error.response?.status || error.message
            );
        }
    }

    return null;
}

// ═══════════════════════════════════════════════════════════
// SEND AUDIO
// ═══════════════════════════════════════════════════════════

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

        // Try query-based providers if the first route fails.
        if (!resolved) {
            resolved = await resolveAudio(query, false);
        }
    }

    if (!resolved?.buffer) {
        await ctx.react('❌');

        return ctx.reply(
            `❌ Audio download failed for: ${query}\n\n` +
            `All available audio providers failed. Try again later or use another YouTube link.\n\n` +
            `${FOOTER}`
        );
    }

    await ctx.react('⬇️');

    const title = resolved.title || query;

    // Use the buffer already downloaded and validated by resolveAudio().
    // This avoids making a second request to a URL that may return 404.
    await ctx.sock.sendMessage(ctx.from, {
        audio: resolved.buffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle(title)}.mp3`,
        contextInfo: channelCtx()
    }, {
        quoted: ctx.m
    });

    await ctx.react('✅');
}

// ═══════════════════════════════════════════════════════════
// SEND VIDEO
// ═══════════════════════════════════════════════════════════

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
        video: {
            url: resolved.url
        },
        mimetype: 'video/mp4',
        caption:
            `🎬 *${resolved.title || query}*\n` +
            (
                resolved.duration
                    ? `⏱️ ${formatDuration(resolved.duration)}\n`
                    : ''
            ) +
            `\n${config.BOT_NAME || 'LUKA-XMD'}\n${FOOTER}`,
        contextInfo: channelCtx()
    }, {
        quoted: ctx.m
    });

    await ctx.react('✅');
}

// ═══════════════════════════════════════════════════════════
// PLAY COMMAND
// ═══════════════════════════════════════════════════════════

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
                `Or: ${ctx.prefix}play https://youtu.be/VIDEO_ID\n\n` +
                `${FOOTER}`
            );
        }

        try {
            await sendAudio(ctx, query);
        } catch (error) {
            console.error(
                '[PLAY ERROR]',
                error.response?.status || error.message
            );

            await ctx.react('❌');

            await ctx.reply(
                `❌ Audio failed: ${error.message}\n\n${FOOTER}`
            );
        }
    }
});

// ═══════════════════════════════════════════════════════════
// YTMP3 COMMAND
// ═══════════════════════════════════════════════════════════

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
            console.error(
                '[YTMP3 ERROR]',
                error.response?.status || error.message
            );

            await ctx.react('❌');

            await ctx.reply(
                `❌ MP3 failed: ${error.message}\n\n${FOOTER}`
            );
        }
    }
});

// ═══════════════════════════════════════════════════════════
// VIDEO COMMAND
// ═══════════════════════════════════════════════════════════

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
                `Or: ${ctx.prefix}video https://youtu.be/VIDEO_ID\n\n` +
                `${FOOTER}`
            );
        }

        try {
            await sendVideo(ctx, query);
        } catch (error) {
            console.error(
                '[VIDEO ERROR]',
                error.response?.status || error.message
            );

            await ctx.react('❌');

            await ctx.reply(
                `❌ Video failed: ${error.message}\n\n${FOOTER}`
            );
        }
    }
});

// ═══════════════════════════════════════════════════════════
// YTSEARCH COMMAND
// ═══════════════════════════════════════════════════════════

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
                `🔍 Usage: ${ctx.prefix}ytsearch diamond komasava\n\n${FOOTER}`
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

                return (
                    `${index + 1}. *${title}*\n` +
                    `⏱️ ${duration}\n` +
                    `🔗 ${url}`
                );
            });

            await ctx.reply(
                `🔍 *YouTube Search: ${query}*\n\n` +
                `${lines.join('\n\n')}\n\n${FOOTER}`
            );

            await ctx.react('✅');
        } catch (error) {
            console.error(
                '[YTSEARCH ERROR]',
                error.response?.status || error.message
            );

            await ctx.react('❌');

            await ctx.reply(
                `❌ Search failed: ${error.message}\n\n${FOOTER}`
            );
        }
    }
});
