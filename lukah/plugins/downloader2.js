'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const {
    MAX_MEDIA_SIZE,
    getMimeCategory,
    getMimeFromUrl,
} = require('../../luka/utils/gmdFunctions');

const {
    gmdBuffer,
    formatAudio,
    formatVideo,
} = require('../../luka/utils/gmdFunctions');

const config = require('../../luka/config/settings');
const axios = require('axios');
const GIFTED_DLS = require('gifted-dls');
const { sendButtons } = require('gifted-btns');

const guruDls = new GIFTED_DLS();

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function extractButtonId(msg) {
    if (!msg) return null;

    if (msg.templateButtonReplyMessage?.selectedId) {
        return msg.templateButtonReplyMessage.selectedId;
    }

    if (msg.buttonsResponseMessage?.selectedButtonId) {
        return msg.buttonsResponseMessage.selectedButtonId;
    }

    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return msg.listResponseMessage.singleSelectReply.selectedRowId;
    }

    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;

        if (nf?.paramsJson) {
            try {
                const parsed = JSON.parse(nf.paramsJson);
                if (parsed.id) return parsed.id;
            } catch {}
        }

        return msg.interactiveResponseMessage.buttonId || null;
    }

    return null;
}

function getApiConfig() {
    return {
        base: config.KOYOTEH_API || process.env.KOYOTEH_API,
        key: config.GURU_API_KEY || process.env.GURU_API_KEY,
    };
}

function getContext(ctx) {
    return {
        q: Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '',
        sock: ctx.sock,
        from: ctx.from,
        sender: ctx.sender,
        quoted: ctx.m,
        botName: config.BOT_NAME || 'LUKA-XMD',
        botFooter: 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ',
    };
}

function apiUrl(path, params = {}) {
    const { base, key } = getApiConfig();

    if (!base || !key) {
        throw new Error('API configuration is missing.');
    }

    const url = new URL(`${base.replace(/\/+$/, '')}${path}`);

    url.searchParams.set('apikey', key);

    for (const [name, value] of Object.entries(params)) {
        url.searchParams.set(name, value);
    }

    return url.toString();
}

async function getBuffer(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return Buffer.from(response.data);
}

async function react(ctx, emoji) {
    try {
        if (typeof ctx.react === 'function') {
            await ctx.react(emoji);
        }
    } catch {}
}

async function sendError(ctx, message) {
    await react(ctx, '❌');
    return ctx.reply(message);
}

// ═══════════════════════════════════════════════════════════════
// SPOTIFY
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'spotify',
    aliases: ['spotifydl', 'spotidl', 'spoti'],
    desc: 'Download Spotify tracks by URL or song name',
    category: 'downloader',

    handler: async (ctx) => {
        const { q, sock, from, quoted, botName, botFooter } = getContext(ctx);

        if (!q) {
            return sendError(
                ctx,
                'Please provide a Spotify URL or song name.\n\n' +
                '*Examples:*\n' +
                '.spotify https://open.spotify.com/track/...\n' +
                '.spotify The Spectre Alan Walker'
            );
        }

        const downloadAndSend = async (trackUrl, quotedMsg = quoted) => {
            let result = null;

            try {
                result = await Promise.any(
                    ['spotifydl', 'spotifydlv2'].map(async (endpoint) => {
                        const response = await axios.get(
                            apiUrl(`/api/download/${endpoint}`, {
                                url: trackUrl,
                            }),
                            { timeout: 20000 }
                        );

                        if (
                            response.data?.success &&
                            response.data?.result?.download_url
                        ) {
                            return response.data.result;
                        }

                        throw new Error(`${endpoint} failed`);
                    })
                );
            } catch {}

            if (!result?.download_url) {
                try {
                    const trackId = trackUrl.match(/track\/([a-zA-Z0-9]+)/)?.[1];

                    if (trackId) {
                        const response = await axios.get(
                            `https://api.spotifydown.com/download/${trackId}`,
                            {
                                headers: {
                                    origin: 'https://spotifydown.com',
                                    referer: 'https://spotifydown.com/',
                                },
                                timeout: 20000,
                            }
                        );

                        if (response.data?.success && response.data?.link) {
                            result = {
                                download_url: response.data.link,
                                title: response.data.metadata?.title || 'Spotify Track',
                            };
                        }
                    }
                } catch {}
            }

            if (!result?.download_url) {
                throw new Error('Unable to retrieve Spotify download.');
            }

            const buffer = await getBuffer(result.download_url);
            const audio = await formatAudio(buffer);
            const title = (result.title || 'spotify_track')
                .replace(/[^\w\s.-]/g, '')
                .trim();

            await sock.sendMessage(
                from,
                audio.length > MAX_MEDIA_SIZE
                    ? {
                        document: audio,
                        fileName: `${title || 'spotify_track'}.mp3`,
                        mimetype: 'audio/mpeg',
                    }
                    : {
                        audio,
                        mimetype: 'audio/mpeg',
                    },
                { quoted: quotedMsg }
            );

            await react(ctx, '✅');
        };

        try {
            if (/spotify\.com/i.test(q)) {
                await downloadAndSend(q);
                return;
            }

            const response = await axios.get(
                apiUrl('/api/search/spotifysearch', { query: q }),
                { timeout: 30000 }
            );

            if (!response.data?.success || !response.data?.results) {
                return sendError(ctx, 'Spotify search failed. Please try again.');
            }

            const results = response.data.results;

            const tracks = Array.isArray(results)
                ? results.slice(0, 3)
                : Array.isArray(results.tracks)
                    ? results.tracks.slice(0, 3)
                    : results.url || results.link
                        ? [results]
                        : [];

            if (!tracks.length) {
                return sendError(ctx, 'No Spotify tracks found.');
            }

            const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            const buttons = tracks.map((track, index) => ({
                id: `sp_${index}_${requestId}`,
                text: `${track.title || track.name || 'Unknown Track'}`
                    .slice(0, 20),
            }));

            const list = tracks.map((track, index) => {
                const title = track.title || track.name || 'Unknown Track';
                const artist = track.artist ||
                    (Array.isArray(track.artists)
                        ? track.artists.join(', ')
                        : 'Unknown Artist');

                return `${index + 1}. ${title} — ${artist}`;
            }).join('\n');

            const thumbnail =
                tracks[0]?.thumbnail ||
                tracks[0]?.image ||
                tracks[0]?.album?.images?.[0]?.url;

            await sendButtons(sock, from, {
                title: `${botName} SPOTIFY`,
                text: `*Search Results:*\n\n${list}\n\nSelect a track below.`,
                footer: botFooter,
                ...(thumbnail ? { image: { url: thumbnail } } : {}),
                buttons,
            }, { quoted });

            const handleResponse = async (event) => {
                const message = event.messages?.[0];
                if (!message?.message) return;
                if (message.key?.remoteJid !== from) return;

                const buttonId = extractButtonId(message.message);
                if (!buttonId?.startsWith(`sp_`) ||
                    !buttonId.endsWith(`_${requestId}`)) {
                    return;
                }

                sock.ev.off('messages.upsert', handleResponse);

                try {
                    await react(ctx, '⬇️');

                    const index = Number(buttonId.split('_')[1]);
                    const track = tracks[index];

                    const url =
                        track?.url ||
                        track?.link ||
                        track?.external_urls?.spotify ||
                        track?.spotify_url;

                    if (!url) {
                        return ctx.reply('Track URL not available.');
                    }

                    await downloadAndSend(url, message);
                } catch (error) {
                    console.error('[SPOTIFY DOWNLOAD]', error);
                    await sendError(ctx, 'Failed to download this track.');
                }
            };

            sock.ev.on('messages.upsert', handleResponse);

            setTimeout(() => {
                sock.ev.off('messages.upsert', handleResponse);
            }, 300000);
        } catch (error) {
            console.error('[SPOTIFY ERROR]', error);
            return sendError(ctx, 'An error occurred while processing Spotify.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// GOOGLE DRIVE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'gdrive',
    aliases: ['googledrive', 'drive', 'gdrivedl'],
    desc: 'Download files from Google Drive',
    category: 'downloader',

    handler: async (ctx) => {
        const { q, sock, from, quoted } = getContext(ctx);

        if (!q || !/drive\.google\.com/i.test(q)) {
            return sendError(ctx, 'Please provide a valid Google Drive URL.');
        }

        try {
            const response = await axios.get(
                apiUrl('/api/download/gdrivedl', { url: q }),
                { timeout: 60000 }
            );

            const result = response.data?.result;

            if (!response.data?.success || !result?.download_url) {
                return sendError(
                    ctx,
                    'Could not retrieve the file. Check that it is publicly accessible.'
                );
            }

            const name = result.name || 'gdrive_file';
            let mime = getMimeFromUrl(name) || 'application/octet-stream';

            try {
                const head = await axios.head(result.download_url, {
                    timeout: 15000,
                });

                const contentType = head.headers['content-type'];

                if (contentType && !contentType.includes('text/html')) {
                    mime = contentType.split(';')[0].trim();
                }
            } catch {}

            const category = getMimeCategory(mime);
            const buffer = await getBuffer(result.download_url);
            const asDocument =
                buffer.length > MAX_MEDIA_SIZE || category === 'document';

            let payload;

            if (category === 'audio' && !asDocument) {
                payload = {
                    audio: await formatAudio(buffer),
                    mimetype: 'audio/mpeg',
                };
            } else if (category === 'video' && !asDocument) {
                payload = {
                    video: await formatVideo(buffer),
                    mimetype: 'video/mp4',
                    caption: `*${name}*`,
                };
            } else if (category === 'image' && !asDocument) {
                payload = {
                    image: buffer,
                    caption: `*${name}*`,
                };
            } else {
                payload = {
                    document: buffer,
                    fileName: name,
                    mimetype: mime,
                };
            }

            await sock.sendMessage(from, payload, { quoted });
            await react(ctx, '✅');
        } catch (error) {
            console.error('[GDRIVE ERROR]', error);
            return sendError(ctx, 'Failed to download the Google Drive file.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// MEDIAFIRE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'mediafire',
    aliases: ['mfire', 'mediafiredl', 'mfiredl'],
    desc: 'Download files from MediaFire',
    category: 'downloader',

    handler: async (ctx) => {
        const { q, sock, from, quoted } = getContext(ctx);

        if (!q || !/mediafire\.com/i.test(q)) {
            return sendError(ctx, 'Please provide a valid MediaFire URL.');
        }

        try {
            const response = await axios.get(
                apiUrl('/api/download/mediafire', { url: q }),
                { timeout: 60000 }
            );

            const result = response.data?.result;

            if (!response.data?.success || !result?.downloadUrl) {
                return sendError(ctx, 'Failed to retrieve the MediaFire file.');
            }

            const {
                fileName = 'mediafire_file',
                fileSize = 'Unknown',
                fileType = 'Unknown',
                mimeType,
                downloadUrl,
            } = result;

            const mime = mimeType || getMimeFromUrl(fileName) ||
                'application/octet-stream';

            const category = getMimeCategory(mime);
            const sizeMatch = String(fileSize).match(/([\d.]+)\s*(KB|MB|GB)/i);

            let sizeBytes = 0;

            if (sizeMatch) {
                const units = {
                    KB: 1024,
                    MB: 1024 ** 2,
                    GB: 1024 ** 3,
                };

                sizeBytes =
                    parseFloat(sizeMatch[1]) *
                    units[sizeMatch[2].toUpperCase()];
            }

            const asDocument =
                sizeBytes > MAX_MEDIA_SIZE || category === 'document';

            const caption =
                `*${fileName}*\n\n` +
                `*Size:* ${fileSize}\n` +
                `*Type:* ${fileType}`;

            let payload;

            if (category === 'audio' && !asDocument) {
                const buffer = await getBuffer(downloadUrl);

                payload = {
                    audio: await formatAudio(buffer),
                    mimetype: 'audio/mpeg',
                };
            } else if (category === 'video' && !asDocument) {
                payload = {
                    video: { url: downloadUrl },
                    mimetype: mime,
                    caption,
                };
            } else if (category === 'image' && !asDocument) {
                payload = {
                    image: { url: downloadUrl },
                    caption,
                };
            } else {
                payload = {
                    document: { url: downloadUrl },
                    fileName,
                    mimetype: mime,
                    caption,
                };
            }

            await sock.sendMessage(from, payload, { quoted });
            await react(ctx, '✅');
        } catch (error) {
            console.error('[MEDIAFIRE ERROR]', error);
            return sendError(ctx, 'Failed to download the MediaFire file.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// APK DOWNLOADER
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'apk',
    aliases: ['app', 'apkdl', 'appdownload'],
    desc: 'Download Android APK files',
    category: 'downloader',

    handler: async (ctx) => {
        const { q, sock, from, quoted, botName } = getContext(ctx);

        if (!q) {
            return sendError(
                ctx,
                'Please provide an app name.\n\n*Example:* .apk WhatsApp'
            );
        }

        try {
            const response = await axios.get(
                apiUrl('/api/download/apkdl', { appName: q }),
                { timeout: 60000 }
            );

            const result = response.data?.result;

            if (!response.data?.success || !result?.download_url) {
                return sendError(ctx, 'App not found. Try another name.');
            }

            const {
                appname = q,
                appicon,
                developer = 'Unknown',
                mimetype,
                download_url,
            } = result;

            const caption =
                `*${botName} APK DOWNLOADER*\n\n` +
                `*App:* ${appname}\n` +
                `*Developer:* ${developer}`;

            if (appicon) {
                await sock.sendMessage(
                    from,
                    {
                        image: { url: appicon },
                        caption,
                    },
                    { quoted }
                );
            } else {
                await ctx.reply(caption);
            }

            await sock.sendMessage(
                from,
                {
                    document: { url: download_url },
                    fileName: `${appname.replace(/[^\w\s.-]/g, '')}.apk`,
                    mimetype:
                        mimetype || 'application/vnd.android.package-archive',
                },
                { quoted }
            );

            await react(ctx, '✅');
        } catch (error) {
            console.error('[APK ERROR]', error);
            return sendError(ctx, 'Failed to download the APK.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// PASTEBIN
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'pastebin',
    aliases: ['getpaste', 'getpastebin', 'pastedl', 'pastebindl', 'paste'],
    desc: 'Fetch content from Pastebin',
    category: 'downloader',

    handler: async (ctx) => {
        const { q, sock, from, quoted, botName } = getContext(ctx);

        if (!q || !/pastebin\.com/i.test(q)) {
            return sendError(
                ctx,
                'Please provide a valid Pastebin URL.\n\n' +
                '*Example:* .pastebin https://pastebin.com/xxxxxx'
            );
        }

        try {
            await ctx.reply('Fetching paste content...');

            const response = await axios.get(
                apiUrl('/api/download/pastebin', { url: q }),
                { timeout: 30000 }
            );

            if (!response.data?.success || !response.data?.result) {
                return sendError(ctx, 'Failed to fetch the Pastebin content.');
            }

            let content = String(response.data.result);

            content = content
                .replace(/\\r\\n/g, '\n')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n');

            const pasteId = q.split('/').pop().split('?')[0] || 'paste';

            const header =
                `*${botName} PASTEBIN VIEWER*\n` +
                `*Paste ID:* ${pasteId}\n` +
                `${'━'.repeat(20)}\n\n`;

            const fullMessage = header + content;

            if (fullMessage.length > 65000) {
                await sock.sendMessage(
                    from,
                    {
                        document: Buffer.from(content, 'utf8'),
                        fileName: `pastebin_${pasteId}.txt`,
                        mimetype: 'text/plain',
                        caption: `*Paste ID:* ${pasteId}\nContent is too long, so it was sent as a file.`,
                    },
                    { quoted }
                );
            } else {
                await sock.sendMessage(
                    from,
                    { text: fullMessage },
                    { quoted }
                );
            }

            await react(ctx, '✅');
        } catch (error) {
            console.error('[PASTEBIN ERROR]', error);
            return sendError(ctx, 'Failed to retrieve the Pastebin content.');
        }
    },
});
