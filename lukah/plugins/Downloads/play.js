import { sendInteractive } from '../../lib/sendInteractive.js';

export default {
  name: 'play',
  aliases: ['ply', 'playy', 'pl'],
  description: 'Downloads songs from YouTube and sends audio',

  run: async (context) => {
    const { client, m, text } = context;

    await client.sendMessage(m.chat, {
      react: { text: '⌛', key: m.reactKey }
    });

    try {
      const query = text ? text.trim() : '';

      if (!query) {
        await client.sendMessage(m.chat, {
          react: { text: '❌', key: m.reactKey }
        }).catch(() => {});

        return sendInteractive(
          client,
          m,
          `🎵 *PLAY — LUKA-XMD*

▢ Enter a song name or YouTube link.
▢ Example: .play harlem shake

ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
        );
      }

      const isYoutubeLink =
        /(?:https?:\/\/)?(?:youtu\.be\/[a-zA-Z0-9_-]{11}|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/)[a-zA-Z0-9_-]{11})/i.test(query);

      let audioUrl, filename, thumbnail, sourceUrl;

      if (isYoutubeLink) {
        const response = await fetch(
          `https://api.sidycoders.xyz/api/ytdl?url=${encodeURIComponent(query)}&format=mp3&apikey=memberdycoders`
        );

        const data = await response.json();

        if (!data.status || !data.cdn) {
          await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
          }).catch(() => {});

          return sendInteractive(
            client,
            m,
            `❌ Unable to download this YouTube link.\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
          );
        }

        audioUrl = data.cdn;
        filename = data.title || 'Unknown YouTube Song';
        thumbnail = '';
        sourceUrl = query;

      } else {
        if (query.length > 100) {
          await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
          }).catch(() => {});

          return sendInteractive(
            client,
            m,
            `❌ Song title must be under 100 characters.\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
          );
        }

        const response = await fetch(
          `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        if (!data.status || !data.result?.downloadUrl) {
          await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
          }).catch(() => {});

          return sendInteractive(
            client,
            m,
            `❌ No song found for: ${query}\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
          );
        }

        audioUrl = data.result.downloadUrl;
        filename = data.result.title || 'Unknown Song';
        thumbnail = data.result.thumbnail || '';
        sourceUrl = data.result.videoUrl || '';
      }

      await client.sendMessage(m.chat, {
        react: { text: '✅', key: m.reactKey }
      });

      const safeFilename = filename.replace(/[<>:"/\\|?*]/g, '_');

      await client.sendMessage(m.chat, {
        audio: { url: audioUrl },
        mimetype: 'audio/mpeg',
        fileName: `${safeFilename}.mp3`,
        contextInfo: thumbnail ? {
          externalAdReply: {
            title: filename.substring(0, 30),
            body: 'LUKA-XMD',
            thumbnailUrl: thumbnail,
            sourceUrl: sourceUrl,
            mediaType: 1,
            renderLargerThumbnail: false
          }
        } : undefined
      });

      await client.sendMessage(m.chat, {
        document: { url: audioUrl },
        mimetype: 'audio/mpeg',
        fileName: `${safeFilename}.mp3`,
        caption: `🎵 ${filename}\n\nLUKA-XMD`
      });

    } catch (error) {
      console.error('Play error:', error);

      await client.sendMessage(m.chat, {
        react: { text: '❌', key: m.reactKey }
      }).catch(() => {});

      await sendInteractive(
        client,
        m,
        `❌ Play download failed.\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
      );
    }
  }
};
