'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const yts = require('yt-search');
const config = require('../../luka/config/settings');
const { channelCtx, sendButtons } = require('../../luka/utils/gmdFunctions2');

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const http = axios.create({
    timeout: 25000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
    },
    maxRedirects: 5
});

// ── Helpers ────────────────────────────────────────────────────

function fmtSecs(secs) {
    secs = Number(secs);
    if (!Number.isFinite(secs) || secs < 0) return '?';

    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);

    return `${m}:${String(s).padStart(2, '0')}`;
}

function isYouTubeUrl(url) {
    try {
        const parsed = new URL(url);
        return /(^|\.)youtube\.com$/i.test(parsed.hostname) ||
               /(^|\.)youtu\.be$/i.test(parsed.hostname);
    } catch {
        return false;
    }
}

function extractYouTubeId(url) {
    try {
        const parsed = new URL(url);

        if (parsed.hostname === 'youtu.be') {
            return parsed.pathname.split('/').filter(Boolean)[0] || null;
        }

        if (parsed.searchParams.get('v')) {
            return parsed.searchParams.get('v');
        }

        const parts = parsed.pathname.split('/').filter(Boolean);

        if (['shorts', 'embed', 'live'].includes(parts[0])) {
            return parts[1] || null;
        }
    } catch {}

    return null;
}

function parseDownloadUrl(data, depth = 0) {
    if (!data || depth > 5) return null;

    if (typeof data === 'string') {
        const value = data.trim();

        if (/^https?:\/\/[^\s"'<>]+$/i.test(value)) {
            return value;
        }

        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return parseDownloadUrl(JSON.parse(value), depth + 1);
            } catch {}
        }

        return null;
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const found = parseDownloadUrl(item, depth + 1);
            if (found) return found;
        }

        return null;
    }

    if (typeof data !== 'object') return null;

    const keys = [
        'download_url',
        'downloadUrl',
        'download',
        'audio_url',
        'video_url',
        'media_url',
        'direct_url',
        'url',
        'link',
        'audio',
        'video',
        'result',
        'data'
    ];

    for (const key of keys) {
        if (data[key] === undefined || data[key] === null) continue;

        const value = data[key];

        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value.trim())) {
                return value.trim();
            }

            if (['result', 'data', 'audio', 'video', 'download'].includes(key)) {
                const nested = parseDownloadUrl(value, depth + 1);
                if (nested) return nested;
            }
        } else if (typeof value === 'object') {
            const nested = parseDownloadUrl(value, depth + 1);
            if (nested) return nested;
        }
    }

    return null;
}

async function getJson(url) {
    const res = await http.get(url);
    return res.data;
}

async function sendText(ctx, text) {
    return ctx.sock.sendMessage(
        ctx.from,
        {
            text,
            contextInfo: channelCtx()
        },
        { quoted: ctx.m }
    );
}

// ── YouTube Search ────────────────────────────────────────────

async function ytSearch(query) {
    if (isYouTubeUrl(query)) {
        const id = extractYouTubeId(query);

        if (!id) return null;

        try {
            const result = await yts({ videoId: id });
            const item = result?.videos?.[0] || result;

            if (item && item.title) {
                return {
                    title: item.title,
                    url: `https://www.youtube.com/watch?v=${id}`,
                    channel: item.author?.name || '',
                    duration: item.timestamp || fmtSecs(item.seconds),
                    views: Number(item.views || 0).toLocaleString(),
                    thumb: item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
                };
            }
        } catch {}

        return {
            title: `YouTube Video ${id}`,
            url: `https://www.youtube.com/watch?v=${id}`,
            channel: '',
            duration: '?',
            views: '?',
            thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        };
    }

    try {
        const result = await yts(query);
        const item = result?.videos?.[0];

        if (item) {
            return {
                title: item.title || query,
                url: item.url,
                channel: item.author?.name || '',
                duration: item.timestamp || fmtSecs(item.seconds),
                views: Number(item.views || 0).toLocaleString(),
                thumb: item.thumbnail || ''
            };
        }
    } catch (err) {
        console.error('[YT-SEARCH]', err.message);
    }

    const fallbackUrls = [
        `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`,
        `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`
    ];

    for (const endpoint of fallbackUrls) {
        try {
            const data = await getJson(endpoint);

            const items = Array.isArray(data)
                ? data
                : (data?.items || []);

            if (!items.length) continue;

            const item = items[0];

            const id = item.videoId ||
                (item.url || '').match(/[?&]v=([^&]+)/)?.[1] ||
                (item.url || '').match(/youtu\.be\/([^?&/]+)/)?.[1];

            if (!id) continue;

            return {
                title: item.title || query,
                url: `https://www.youtube.com/watch?v=${id}`,
                channel: item.author || item.uploaderName || '',
                duration: fmtSecs(item.lengthSeconds ?? item.duration),
                views: Number(item.viewCount || item.views || 0).toLocaleString(),
                thumb: item.thumbnail ||
                    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
            };
        } catch (err) {
            console.error('[YT-SEARCH-FALLBACK]', err.message);
        }
    }

    return null;
}

// ── Download URL Resolver ─────────────────────────────────────

async function queryAPI(endpoints) {
    const results = await Promise.allSettled(
        endpoints.map(async endpoint => {
            const response = await http.get(endpoint);
            const url = parseDownloadUrl(response.data);

            if (!url) {
                console.log(`[YT-DL] No download URL: ${endpoint}`);
                return null;
            }

            return url;
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            console.log('[YT-DL] A download URL was returned.');
            return result.value;
        }
    }

    return null;
}

async function ytAudio(videoUrl) {
    if (!isYouTubeUrl(videoUrl)) return null;

    const encoded = encodeURIComponent(videoUrl);

    const endpoints = [
        `https://apiskeith.top/download/audio?url=${encoded}`,
        `https://api.vreden.my.id/api/ytmp3?url=${encoded}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encoded}`,
        `https://ytdl.freelancerpriyesh.workers.dev/?url=${encoded}&type=audio`
    ];

    return queryAPI(endpoints);
}

async function ytVideo(videoUrl) {
    if (!isYouTubeUrl(videoUrl)) return null;

    const encoded = encodeURIComponent(videoUrl);

    const endpoints = [
        `https://apiskeith.top/download/video?url=${encoded}`,
        `https://api.vreden.my.id/api/ytmp4?url=${encoded}`,
        `https://ytdl.freelancerpriyesh.workers.dev/?url=${encoded}&type=video`
    ];

    return queryAPI(endpoints);
}

// ── Download result helper ────────────────────────────────────

async function sendAudio(ctx, url, title = 'audio') {
    return ctx.sock.sendMessage(
        ctx.from,
        {
            audio: { url },
            mimetype: 'audio/mpeg',
            fileName: `${title.slice(0, 80).replace(/[\\/:*?"<>|]/g, '_')}.mp3`,
            ptt: false,
            contextInfo: channelCtx()
        },
        { quoted: ctx.m }
    );
}

// ══════════════════════════════════════════════════════════════
// PLAY
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'play',
    aliases: ['music', 'song', 'ytplay'],
    desc: 'Search YouTube and download audio',
    usage: 'play <song name or YouTube URL>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text) {
            return ctx.reply(
                `🎵 *YouTube Play*\n\n` +
                `Usage: ${config.BOT_PREFIX}play <song name>\n\n` +
                `Example: ${config.BOT_PREFIX}play Diamond Platnumz Komasava\n\n` +
                `_${FOOTER}_`
            );
        }

        await ctx.react('🎵');

        try {
            await ctx.react('🔍');

            const result = await ytSearch(ctx.text);

            if (!result) {
                await ctx.react('❌');

                return sendText(
                    ctx,
                    `❌ No YouTube results found.\n\n` +
                    `Try another search term.\n\n_${FOOTER}_`
                );
            }

            await ctx.react('⏳');

            const audioUrl = await ytAudio(result.url);

            if (!audioUrl) {
                await ctx.react('⚠️');

                return sendText(
                    ctx,
                    `🎵 *${result.title}*\n` +
                    `👤 ${result.channel || 'Unknown'}\n` +
                    `⏱️ ${result.duration}\n\n` +
                    `🔗 ${result.url}\n\n` +
                    `⚠️ Download services did not return a usable audio link.\n` +
                    `Try again later or open the YouTube link.\n\n` +
                    `_${FOOTER}_`
                );
            }

            await sendAudio(ctx, audioUrl, result.title);

            await ctx.react('✅');
        } catch (err) {
            console.error('[PLAY]', err.message);

            await ctx.react('❌');

            await sendText(
                ctx,
                `❌ Could not download this song.\n\n` +
                `Reason: ${err.message}\n\n` +
                `Try again later.\n\n_${FOOTER}_`
            );
        }
    }
});

// ══════════════════════════════════════════════════════════════
// YTSEARCH
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'ytsearch',
    aliases: ['yts', 'ytsrc'],
    desc: 'Search YouTube videos',
    usage: 'ytsearch <query>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text) {
            return ctx.reply(
                `🔍 Usage: ${config.BOT_PREFIX}ytsearch <song name>`
            );
        }

        await ctx.react('🔍');

        try {
            let data;

            try {
                data = await yts(ctx.text);
            } catch {
                data = null;
            }

            const items = (data?.videos || []).slice(0, 5);

            if (!items.length) {
                await ctx.react('❌');
                return sendText(ctx, '❌ No results found.');
            }

            let text = `🔍 *YouTube Search Results*\n\n`;

            items.forEach((item, i) => {
                text +=
                    `*${i + 1}. ${item.title}*\n` +
                    `👤 ${item.author?.name || 'Unknown'}\n` +
                    `⏱️ ${item.timestamp || '?'}\n` +
                    `🔗 ${item.url}\n\n`;
            });

            text += `_${FOOTER}_`;

            await ctx.reply(text);
            await ctx.react('✅');
        } catch (err) {
            console.error('[YTSEARCH]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ YouTube search failed.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// YTMP3
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'ytmp3',
    aliases: ['yta', 'ytaudio'],
    desc: 'Download YouTube audio',
    usage: 'ytmp3 <YouTube URL>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text || !isYouTubeUrl(ctx.text.trim())) {
            return ctx.reply(
                `❌ Provide a valid YouTube URL.\n\n` +
                `Example: ${config.BOT_PREFIX}ytmp3 https://youtu.be/VIDEO_ID`
            );
        }

        await ctx.react('⏳');

        try {
            const url = await ytAudio(ctx.text.trim());

            if (!url) {
                await ctx.react('❌');
                return sendText(ctx, '❌ Audio download is currently unavailable.');
            }

            await sendAudio(ctx, url);
            await ctx.react('✅');
        } catch (err) {
            console.error('[YTMP3]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ Audio download failed.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// YTFILE
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'ytfile',
    aliases: ['ytdoc', 'ytdocument'],
    desc: 'Download YouTube audio as a document',
    usage: 'ytfile <YouTube URL>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text || !isYouTubeUrl(ctx.text.trim())) {
            return ctx.reply(
                `❌ Provide a valid YouTube URL.\n` +
                `Example: ${config.BOT_PREFIX}ytfile https://youtu.be/VIDEO_ID`
            );
        }

        await ctx.react('⏳');

        try {
            const url = await ytAudio(ctx.text.trim());

            if (!url) {
                await ctx.react('❌');
                return sendText(ctx, '❌ Audio download is currently unavailable.');
            }

            await ctx.sock.sendMessage(
                ctx.from,
                {
                    document: { url },
                    mimetype: 'audio/mpeg',
                    fileName: 'audio.mp3',
                    caption: `🎵 Audio File\n\n_${FOOTER}_`,
                    contextInfo: channelCtx()
                },
                { quoted: ctx.m }
            );

            await ctx.react('✅');
        } catch (err) {
            console.error('[YTFILE]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ Document download failed.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// YTMP4
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'ytmp4',
    aliases: ['ytv', 'ytvideo'],
    desc: 'Download YouTube video',
    usage: 'ytmp4 <YouTube URL>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text || !isYouTubeUrl(ctx.text.trim())) {
            return ctx.reply(
                `❌ Provide a valid YouTube URL.\n` +
                `Example: ${config.BOT_PREFIX}ytmp4 https://youtu.be/VIDEO_ID`
            );
        }

        await ctx.react('⏳');

        try {
            const url = await ytVideo(ctx.text.trim());

            if (!url) {
                await ctx.react('❌');
                return sendText(ctx, '❌ Video download is currently unavailable.');
            }

            await ctx.sock.sendMessage(
                ctx.from,
                {
                    video: { url },
                    mimetype: 'video/mp4',
                    caption: `🎬 YouTube Video\n\n_${FOOTER}_`,
                    contextInfo: channelCtx()
                },
                { quoted: ctx.m }
            );

            await ctx.react('✅');
        } catch (err) {
            console.error('[YTMP4]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ Video download failed.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// SPOTIFY / DEEZER SEARCH
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'spotify',
    aliases: ['deezer', 'musicsearch', 'findsong'],
    desc: 'Search song information using Deezer',
    usage: 'spotify <song name>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text) {
            return ctx.reply(
                `🎧 Usage: ${config.BOT_PREFIX}spotify <song name>`
            );
        }

        await ctx.react('🎧');

        try {
            const data = await getJson(
                `https://api.deezer.com/search?q=${encodeURIComponent(ctx.text)}&limit=5`
            );

            const tracks = data?.data || [];

            if (!tracks.length) {
                await ctx.react('❌');
                return ctx.reply('❌ No tracks found.');
            }

            const track = tracks[0];
            const duration = fmtSecs(track.duration);

            let text =
                `🎵 *${track.title}*\n` +
                `👤 Artist: ${track.artist?.name || 'Unknown'}\n` +
                `💿 Album: ${track.album?.title || 'Unknown'}\n` +
                `⏱️ Duration: ${duration}\n` +
                `🔗 ${track.link}\n\n` +
                `Use ${config.BOT_PREFIX}play ${track.title} to search YouTube.\n\n` +
                `_${FOOTER}_`;

            await ctx.reply(text);
            await ctx.react('✅');
        } catch (err) {
            console.error('[SPOTIFY]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ Music search failed.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// TTS
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'tts',
    aliases: ['speak', 'voice', 'texttospeech'],
    desc: 'Convert text to a voice note',
    usage: 'tts [language] <text>',
    category: 'tools',

    handler: async ctx => {
        if (!ctx.text) {
            return ctx.reply(
                `🔊 *Text to Speech*\n\n` +
                `Usage: ${config.BOT_PREFIX}tts <text>\n` +
                `Example: ${config.BOT_PREFIX}tts sw Habari yako`
            );
        }

        const languages = [
            'en', 'sw', 'fr', 'es', 'ar', 'zh', 'hi',
            'pt', 'de', 'it', 'ru', 'ja', 'ko', 'tr', 'pl'
        ];

        let lang = 'en';
        let text = ctx.text.trim();

        if (languages.includes(ctx.args?.[0]?.toLowerCase())) {
            lang = ctx.args[0].toLowerCase();
            text = ctx.args.slice(1).join(' ').trim();
        }

        if (!text) {
            return ctx.reply('❌ Enter text after the language code.');
        }

        if (text.length > 200) {
            return ctx.reply('❌ Maximum text length is 200 characters.');
        }

        await ctx.react('🔊');

        try {
            const url =
                `https://translate.google.com/translate_tts?ie=UTF-8` +
                `&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;

            const response = await http.get(url, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: {
                    Referer: 'https://translate.google.com/'
                }
            });

            await ctx.sock.sendMessage(
                ctx.from,
                {
                    audio: Buffer.from(response.data),
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    contextInfo: channelCtx()
                },
                { quoted: ctx.m }
            );

            await ctx.react('✅');
        } catch (err) {
            console.error('[TTS]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ Text-to-speech failed. Try again.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// SHORTEN URL
// ══════════════════════════════════════════════════════════════

addCmd({
    name: 'shorten',
    aliases: ['short', 'shorturl', 'tinyurl'],
    desc: 'Shorten a URL',
    usage: 'shorten <URL>',
    category: 'tools',

    handler: async ctx => {
        const url = ctx.text?.trim();

        try {
            const parsed = new URL(url);

            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Invalid URL');
            }
        } catch {
            return ctx.reply(
                `❌ Provide a valid URL.\n` +
                `Example: ${config.BOT_PREFIX}shorten https://example.com`
            );
        }

        await ctx.react('🔗');

        try {
            let shortUrl;

            try {
                const response = await http.get(
                    'https://is.gd/create.php',
                    {
                        params: {
                            format: 'simple',
                            url
                        }
                    }
                );

                const value = String(response.data || '').trim();

                if (/^https?:\/\//i.test(value)) {
                    shortUrl = value;
                }
            } catch {}

            if (!shortUrl) {
                const response = await http.get(
                    'https://tinyurl.com/api-create.php',
                    { params: { url } }
                );

                const value = String(response.data || '').trim();

                if (/^https?:\/\//i.test(value)) {
                    shortUrl = value;
                }
            }

            if (!shortUrl) throw new Error('No short URL returned');

            await ctx.reply(
                `🔗 *URL Shortened!*\n\n` +
                `📎 Original: ${url}\n\n` +
                `✨ Short: ${shortUrl}\n\n` +
                `_${FOOTER}_`
            );

            await ctx.react('✅');
        } catch (err) {
            console.error('[SHORTEN]', err.message);
            await ctx.react('❌');
            await ctx.reply('❌ Could not shorten this URL.');
        }
    }
});

// ══════════════════════════════════════════════════════════════
// PLAYLIST
// ══════════════════════════════════════════════════════════════

const activeQueues = new Set();

addCmd({
    name: 'playlist',
    aliases: ['queue', 'plist'],
    desc: 'Download a playlist of songs',
    usage: 'playlist <song1>, <song2>, <song3>',
    category: 'music',

    handler: async ctx => {
        if (!ctx.text) {
            return ctx.reply(
                `🎶 *Playlist*\n\n` +
                `Example:\n` +
                `${config.BOT_PREFIX}playlist Komasava, Tetema, Yatapita\n\n` +
                `Maximum: 10 songs.\n\n_${FOOTER}_`
            );
        }

        const songs = ctx.text
            .split(',')
            .map(song => song.trim())
            .filter(Boolean)
            .slice(0, 10);

        if (!songs.length) {
            return ctx.reply('❌ No songs provided.');
        }

        const jid = ctx.from;

        if (activeQueues.has(jid)) {
            return ctx.reply('⏳ A playlist is already running in this chat.');
        }

        activeQueues.add(jid);

        let sent = 0;
        let failed = 0;

        try {
            await ctx.reply(
                `🎶 *Playlist Started*\n\n` +
                `Queued songs: ${songs.length}\n\n` +
                songs.map((song, i) => `${i + 1}. ${song}`).join('\n') +
                `\n\n_${FOOTER}_`
            );

            for (let i = 0; i < songs.length; i++) {
                try {
                    await ctx.sock.sendMessage(jid, {
                        text: `⏳ [${i + 1}/${songs.length}] Searching: ${songs[i]}`,
                        contextInfo: channelCtx()
                    });

                    const result = await ytSearch(songs[i]);

                    if (!result) {
                        failed++;
                        continue;
                    }

                    const audioUrl = await ytAudio(result.url);

                    if (!audioUrl) {
                        failed++;
                        continue;
                    }

                    await ctx.sock.sendMessage(jid, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/mpeg',
                        fileName: `${result.title.slice(0, 60)}.mp3`,
                        ptt: false,
                        contextInfo: channelCtx()
                    });

                    sent++;

                    if (i < songs.length - 1) {
                        await sleep(2000);
                    }
                } catch (err) {
                    failed++;
                    console.error(`[PLAYLIST] ${songs[i]}:`, err.message);
                }
            }

            await ctx.sock.sendMessage(jid, {
                text:
                    `✅ *Playlist Finished*\n\n` +
                    `🎵 Sent: ${sent}\n` +
                    `❌ Failed: ${failed}\n\n` +
                    `_${FOOTER}_`,
                contextInfo: channelCtx()
            });

            await ctx.react(sent > 0 ? '✅' : '❌');
        } finally {
            activeQueues.delete(jid);
        }
    }
});

console.log('[MUSIC] play.js commands loaded.');
