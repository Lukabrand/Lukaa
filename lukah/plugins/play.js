'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const config = require('../../luka/config/settings');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');

const API_KEY = process.env.GURUTECH_API_KEY;
const API_BASE = process.env.GURUTECH_API_URL;

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

async function searchYouTube(query) {
    const { data } = await axios.get(
        'https://www.googleapis.com/youtube/v3/search',
        {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: 1,
                key: process.env.YOUTUBE_API_KEY
            },
            timeout: 20000
        }
    );

    const item = data.items?.[0];

    if (!item) {
        throw new Error('No matching video was found.');
    }

    return {
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url
    };
}

async function guruDownload(url, format) {
    if (!API_BASE || !API_KEY) {
        throw new Error(
            'GuruTech API is not configured. Set GURUTECH_API_URL and GURUTECH_API_KEY.'
        );
    }

    // Replace this route and response handling with your actual GuruTech API specification.
    const { data } = await axios.get(`${API_BASE}/youtube/download`, {
        params: { url, format },
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: 60000
    });

    const mediaUrl = data?.url || data?.downloadUrl || data?.result?.url;

    if (!mediaUrl) {
        throw new Error('The API did not return a download URL.');
    }

    return {
        url: mediaUrl,
        title: data.title || 'Downloaded Media',
        mimeType: data.mimeType
    };
}

async function getLyrics(query) {
    const { data } = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(query.split(' ')[0])}/${encodeURIComponent(query.split(' ').slice(1).join(' '))}`,
        { timeout: 20000 }
    );

    if (!data.lyrics) {
        throw new Error('Lyrics were not found.');
    }

    return data.lyrics;
}

async function sendMedia(ctx, query, format, asDocument = false) {
    const video = await searchYouTube(query);
    const media = await guruDownload(video.url, format);

    const response = {
        url: media.url
    };

    if (format === 'audio') {
        response.mimetype = media.mimeType || 'audio/mpeg';
        response.ptt = false;
        if (asDocument) {
            response.document = { url: media.url };
            response.mimetype = 'audio/mpeg';
            response.fileName = `${video.title}.mp3`;
        }
    } else {
        response.mimetype = media.mimeType || 'video/mp4';
    }

    const caption = `╭───〔 ${config.BOT_NAME || 'LUKA-XMD'} 〕
│ 🎵 *Title:* ${video.title}
│ 📺 *Channel:* ${video.channel}
│ 🔗 *Source:* ${video.url}
╰──────────────
${FOOTER}`;

    if (format === 'audio' && !asDocument) {
        await ctx.sendMessage(ctx.chat, {
            audio: response.url,
            mimetype: response.mimetype,
            fileName: `${video.title}.mp3`
        });
    } else if (format === 'audio' && asDocument) {
        await ctx.sendMessage(ctx.chat, {
            document: response.url,
            mimetype: response.mimetype,
            fileName: `${video.title}.mp3`,
            caption
        });
    } else {
        await ctx.sendMessage(ctx.chat, {
            video: response.url,
            mimetype: response.mimetype,
            caption
        });
    }
}

function registerPlayCommand(name, aliases, desc, action) {
    addCmd({
        name,
        aliases,
        desc,
        category: 'downloader',
        async handler(ctx) {
            try {
                const query = ctx.args?.join(' ').trim();

                if (!query) {
                    return ctx.reply(
                        `Please provide a song name or video URL.\n\nExample: .${name} Faded Alan Walker`
                    );
                }

                await ctx.reply('⏳ Processing your request...');

                await action(ctx, query);
            } catch (error) {
                console.error(`[${name}]`, error.message);

                await ctx.reply(
                    `❌ *Request Failed*\n\n${error.message}\n\n${FOOTER}`
                );
            }
        }
    });
}

// 1. Search and download a song
registerPlayCommand('play', ['music'], 'Search and download a song', async (ctx, query) => {
    await sendMedia(ctx, query, 'audio');
});

// 2. Download audio
registerPlayCommand('song', ['audio'], 'Download a song as audio', async (ctx, query) => {
    await sendMedia(ctx, query, 'audio');
});

// 3. Download a video
registerPlayCommand('video', ['ytvideo'], 'Download a YouTube video', async (ctx, query) => {
    await sendMedia(ctx, query, 'video');
});

// 4. Download MP3
registerPlayCommand('ytmp3', ['mp3'], 'Download YouTube audio as MP3', async (ctx, query) => {
    await sendMedia(ctx, query, 'audio');
});

// 5. Download MP4
registerPlayCommand('ytmp4', ['mp4'], 'Download YouTube video as MP4', async (ctx, query) => {
    await sendMedia(ctx, query, 'video');
});

// 6. Send audio as a document
registerPlayCommand('playdoc', ['songdoc'], 'Send a song as an audio document', async (ctx, query) => {
    await sendMedia(ctx, query, 'audio', true);
});

// 7. Search song lyrics
registerPlayCommand('lyrics', ['lyric'], 'Search for song lyrics', async (ctx, query) => {
    const lyrics = await getLyrics(query);

    await ctx.reply(
        `🎶 *SONG LYRICS*\n\n${lyrics.slice(0, 3500)}\n\n${FOOTER}`
    );
});
