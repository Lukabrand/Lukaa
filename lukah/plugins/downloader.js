'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const config = require('../../luka/config/settings');
const { channelCtx, sendButtons } = require('../../luka/utils/gmdFunctions2');
const { guruApi } = require('../../luka/utils/guruApi');

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

// ═══════════════════════════════════════════════════════════
// TIKTOK DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'tiktok',
    aliases: ['tt', 'tiktokdl'],
    desc: 'Download TikTok videos',
    usage: 'tiktok <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/tiktok\.com/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid TikTok URL.\n\nExample: .tiktok https://vm.tiktok.com/xxxxx',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            let videoUrl = null;
            let author = 'Unknown';
            let title = '';

            try {
                const data = await guruApi('tiktok-dl', { url });
                const result = data?.data || data?.result || data;

                videoUrl = result?.video || result?.play ||
                    result?.nowm || result?.url;

                author = result?.author?.nickname ||
                    result?.author || 'Unknown';

                title = result?.title || '';
            } catch {}

            if (!videoUrl) {
                try {
                    const res = await axios.get(
                        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
                        { timeout: 15000 }
                    );

                    const result = res.data?.data;

                    videoUrl = result?.play || result?.wmplay;
                    author = result?.author?.nickname || 'Unknown';
                    title = result?.title || '';
                } catch {}
            }

            if (!videoUrl) {
                throw new Error('Unable to retrieve the video. The link may be invalid or the API unavailable.');
            }

            await ctx.send({
                video: { url: videoUrl },
                caption:
                    `🎵 TIKTOK DOWNLOADER\n\n` +
                    `👤 Author: ${author}\n` +
                    (title ? `📝 Title: ${title}\n\n` : '\n') +
                    FOOTER,
                mimetype: 'video/mp4'
            });

            await ctx.react('✅');

        } catch (err) {
            console.error('[TIKTOK]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ TikTok download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// FACEBOOK DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    desc: 'Download Facebook videos',
    usage: 'facebook <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/(facebook\.com|fb\.watch|fb\.com)/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid Facebook video URL.\n\nExample: .facebook https://fb.watch/xxxxx',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('facebook-dl', { url });
            const result = data?.data || data?.result || data;

            const videoUrl = result?.hd || result?.sd ||
                result?.video || result?.url;

            if (!videoUrl) {
                throw new Error('No downloadable Facebook video was returned. The post may be private.');
            }

            await ctx.send({
                video: { url: videoUrl },
                caption: `📘 FACEBOOK DOWNLOADER\n\n${FOOTER}`,
                mimetype: 'video/mp4'
            });

            await ctx.react('✅');

        } catch (err) {
            console.error('[FACEBOOK]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ Facebook download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// INSTAGRAM DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'instagram',
    aliases: ['ig', 'igdl', 'insta'],
    desc: 'Download Instagram photos, videos and reels',
    usage: 'instagram <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/instagram\.com/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid Instagram URL.\n\nExample: .instagram https://www.instagram.com/reel/xxxxx',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('instagram-dl', { url });
            const result = data?.data || data?.result || data;

            const items = result?.medias ||
                (Array.isArray(result) ? result : null) ||
                (result?.url ? [result] : null);

            const item = items?.[0];

            const mediaUrl = item?.url || item?.src ||
                result?.video || result?.image;

            const isImage = item?.type === 'image' ||
                Boolean(result?.image && !result?.video);

            if (!mediaUrl) {
                throw new Error('No downloadable Instagram media was returned. The post may be private.');
            }

            if (isImage) {
                await ctx.send({
                    image: { url: mediaUrl },
                    caption: `📸 INSTAGRAM DOWNLOADER\n\n${FOOTER}`
                });
            } else {
                await ctx.send({
                    video: { url: mediaUrl },
                    caption: `📸 INSTAGRAM DOWNLOADER\n\n${FOOTER}`,
                    mimetype: 'video/mp4'
                });
            }

            await ctx.react('✅');

        } catch (err) {
            console.error('[INSTAGRAM]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ Instagram download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// TWITTER / X DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'twitter',
    aliases: ['twdl', 'xdl', 'x'],
    desc: 'Download Twitter/X videos',
    usage: 'twitter <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/(twitter\.com|x\.com)/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid Twitter/X URL.\n\nExample: .twitter https://x.com/user/status/xxxxx',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('twitter-dl', { url });
            const result = data?.data || data?.result || data;

            const videoUrl = result?.hd || result?.sd ||
                result?.video || result?.url;

            if (!videoUrl) {
                throw new Error('No downloadable video was returned.');
            }

            await ctx.send({
                video: { url: videoUrl },
                caption: `🐦 TWITTER / X DOWNLOADER\n\n${FOOTER}`,
                mimetype: 'video/mp4'
            });

            await ctx.react('✅');

        } catch (err) {
            console.error('[TWITTER]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ Twitter/X download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// SNAPCHAT DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'snapchat',
    aliases: ['snap', 'snapdl'],
    desc: 'Download Snapchat videos and stories',
    usage: 'snapchat <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/snapchat\.com/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid Snapchat URL.',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('snapchat-dl', { url });
            const result = data?.data || data?.result || data;

            const videoUrl = result?.video || result?.url;

            if (!videoUrl) {
                throw new Error('No downloadable Snapchat video was returned.');
            }

            await ctx.send({
                video: { url: videoUrl },
                caption: `👻 SNAPCHAT DOWNLOADER\n\n${FOOTER}`,
                mimetype: 'video/mp4'
            });

            await ctx.react('✅');

        } catch (err) {
            console.error('[SNAPCHAT]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ Snapchat download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// PINTEREST DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'pinterest',
    aliases: ['pin', 'pindl'],
    desc: 'Download Pinterest images and videos',
    usage: 'pinterest <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/(pinterest\.com|pin\.it)/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid Pinterest URL.',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('pinterest-dl', { url });
            const result = data?.data || data?.result || data;

            const videoUrl = result?.video;
            const imageUrl = result?.image || result?.thumbnail;

            if (videoUrl) {
                await ctx.send({
                    video: { url: videoUrl },
                    caption: `📌 PINTEREST DOWNLOADER\n\n${FOOTER}`,
                    mimetype: 'video/mp4'
                });
            } else if (imageUrl) {
                await ctx.send({
                    image: { url: imageUrl },
                    caption: `📌 PINTEREST DOWNLOADER\n\n${FOOTER}`
                });
            } else {
                throw new Error('No downloadable Pinterest media was returned.');
            }

            await ctx.react('✅');

        } catch (err) {
            console.error('[PINTEREST]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ Pinterest download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// THREADS DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'threads',
    aliases: ['threadsdl'],
    desc: 'Download Threads images and videos',
    usage: 'threads <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/threads\.(net|com)/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid Threads URL.',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('threads-dl', { url });
            const result = data?.data || data?.result || data;

            const videoUrl = result?.video;
            const imageUrl = result?.image;

            if (videoUrl) {
                await ctx.send({
                    video: { url: videoUrl },
                    caption: `🧵 THREADS DOWNLOADER\n\n${FOOTER}`,
                    mimetype: 'video/mp4'
                });
            } else if (imageUrl) {
                await ctx.send({
                    image: { url: imageUrl },
                    caption: `🧵 THREADS DOWNLOADER\n\n${FOOTER}`
                });
            } else {
                throw new Error('No downloadable Threads media was returned.');
            }

            await ctx.react('✅');

        } catch (err) {
            console.error('[THREADS]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ Threads download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// MEDIAFIRE DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'mediafire',
    aliases: ['mf', 'mfdl'],
    desc: 'Get MediaFire file download links',
    usage: 'mediafire <url>',
    category: 'downloader',

    handler: async (ctx) => {
        const url = (ctx.text || '').trim();

        if (!url || !/mediafire\.com/i.test(url)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '❌ Please provide a valid MediaFire URL.',
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('mediafire-dl', { url });
            const result = data?.data || data?.result || data;

            const downloadUrl = result?.download ||
                result?.downloadUrl || result?.url;

            const fileName = result?.filename ||
                result?.name || 'Download file';

            const fileSize = result?.size || 'Unknown';

            if (!downloadUrl) {
                throw new Error('No MediaFire download link was returned.');
            }

            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `🗄️ MEDIAFIRE DOWNLOADER\n\n` +
                    `📁 File: ${fileName}\n` +
                    `💾 Size: ${fileSize}\n\n` +
                    `⬇️ Download:\n${downloadUrl}\n\n` +
                    FOOTER,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });

            await ctx.react('✅');

        } catch (err) {
            console.error('[MEDIAFIRE]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text: `❌ MediaFire download failed.\n\n${err.message}`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// APK DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'apk',
    aliases: ['apkdl', 'appdl'],
    desc: 'Search for Android APK files',
    usage: 'apk <app name>',
    category: 'downloader',

    handler: async (ctx) => {
        const query = (ctx.text || '').trim();

        if (!query) {
            return ctx.sock.sendMessage(ctx.from, {
                text:
                    `📱 APK DOWNLOADER\n\n` +
                    `Usage: ${config.BOT_PREFIX || '.'}apk <app name>\n\n` +
                    `Examples:\n` +
                    `${config.BOT_PREFIX || '.'}apk WhatsApp\n` +
                    `${config.BOT_PREFIX || '.'}apk Telegram\n` +
                    `${config.BOT_PREFIX || '.'}apk Spotify\n\n` +
                    FOOTER,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('apk', { query });
            const result = data?.data || data?.result || data;

            const downloadUrl = result?.downloadUrl ||
                result?.download_url || result?.download ||
                result?.apk || result?.url;

            const appName = result?.name || result?.title || query;

            if (!downloadUrl || typeof downloadUrl !== 'string') {
                throw new Error('The APK API did not return a download link.');
            }

            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `📱 APK DOWNLOAD\n\n` +
                    `📦 App: ${appName}\n\n` +
                    `⬇️ Download Link:\n${downloadUrl}\n\n` +
                    `Only install APK files from sources you trust.\n\n` +
                    FOOTER,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });

            await ctx.react('✅');

        } catch (err) {
            console.error('[APK]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `❌ APK DOWNLOAD FAILED\n\n` +
                    `${err.message}\n\n` +
                    `Please check that the APK API is configured correctly.`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});


// ═══════════════════════════════════════════════════════════
// SONG DOWNLOADER
// ═══════════════════════════════════════════════════════════

addCmd({
    name: 'song',
    aliases: ['music', 'mp3', 'songdl'],
    desc: 'Search for and download songs',
    usage: 'song <song name or artist>',
    category: 'downloader',

    handler: async (ctx) => {
        const query = (ctx.text || '').trim();

        if (!query) {
            return ctx.sock.sendMessage(ctx.from, {
                text:
                    `🎵 SONG DOWNLOADER\n\n` +
                    `Usage: ${config.BOT_PREFIX || '.'}song <song name or artist>\n\n` +
                    `Examples:\n` +
                    `${config.BOT_PREFIX || '.'}song Diamond Platnumz Jeje\n` +
                    `${config.BOT_PREFIX || '.'}song Harmonize Single Again\n` +
                    `${config.BOT_PREFIX || '.'}song Zuchu Sukari\n\n` +
                    FOOTER,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }

        await ctx.react('⏳');

        try {
            const data = await guruApi('song-dl', { query });
            const result = data?.data || data?.result || data;

            const audioUrl = result?.downloadUrl ||
                result?.download_url || result?.download ||
                result?.audioUrl || result?.audio || result?.url;

            const title = result?.title || result?.name || query;
            const artist = result?.artist || result?.author || 'Unknown Artist';

            if (!audioUrl || typeof audioUrl !== 'string') {
                throw new Error('The song API did not return an audio download link.');
            }

            const safeTitle = String(title).replace(/[\\/:*?"<>|]/g, '_');

            await ctx.sock.sendMessage(ctx.from, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${safeTitle}.mp3`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });

            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `🎵 SONG DOWNLOADED\n\n` +
                    `🎶 Title: ${title}\n` +
                    `👤 Artist: ${artist}\n\n` +
                    FOOTER,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });

            await ctx.react('✅');

        } catch (err) {
            console.error('[SONG]', err.message);
            await ctx.react('❌');

            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `❌ SONG DOWNLOAD FAILED\n\n` +
                    `${err.message}\n\n` +
                    `Please check that the song API is configured correctly.`,
                contextInfo: channelCtx()
            }, { quoted: ctx.m });
        }
    }
});
