import yts from 'yt-search';
import fetch from 'node-fetch';
import { sendInteractive } from '../../lib/sendInteractive.js';

export default async (context) => {
    const { client, m, text } = context;

    await client.sendMessage(m.chat, {
        react: { text: '⌛', key: m.reactKey }
    });

    if (!text?.trim()) {
        await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
        }).catch(() => {});

        return sendInteractive(
            client,
            m,
            `🎬 *VIDEO — LUKA-XMD*\n\n▢ Enter a video name.\n▢ Example: .video Diamond Platnumz\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
        );
    }

    if (text.length > 100) {
        await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
        }).catch(() => {});

        return sendInteractive(
            client,
            m,
            `❌ Video title must be under 100 characters.\n\nLUKA-XMD`
        );
    }

    try {
        const searchResult = await yts(`${text.trim()} official`);
        const video = searchResult.videos[0];

        if (!video) {
            await client.sendMessage(m.chat, {
                react: { text: '❌', key: m.reactKey }
            }).catch(() => {});

            return sendInteractive(
                client,
                m,
                `❌ No video found: ${text.trim()}\n\nLUKA-XMD`
            );
        }

        const response = await fetch(
            `https://api.ootaizumi.web.id/downloader/youtube?url=${encodeURIComponent(video.url)}&format=720`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Video API HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.status || !data.result?.download) {
            throw new Error('Video download URL not available.');
        }

        const title = data.result.title || video.title || 'Untitled';
        const videoUrl = data.result.download;
        const thumbnailUrl = data.result.thumbnail || video.thumbnail;
        const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_');

        await client.sendMessage(m.chat, {
            react: { text: '✅', key: m.reactKey }
        });

        await client.sendMessage(m.chat, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`,
            caption: `🎬 ${title}\n\nLUKA-XMD`,
            contextInfo: {
                externalAdReply: {
                    title: title.substring(0, 50),
                    body: 'LUKA-XMD',
                    thumbnailUrl,
                    sourceUrl: video.url,
                    mediaType: 2,
                    renderLargerThumbnail: false
                }
            }
        });

    } catch (error) {
        console.error('Video error:', error);

        await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
        }).catch(() => {});

        await sendInteractive(
            client,
            m,
            `❌ Video download failed.\n\nLUKA-XMD`
        );
    }
};
