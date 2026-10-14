'use strict';

const { addCmd } = require('../../guru/handlers/loader');
const config = require('../../guru/config/settings');
const {
    downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

const OWNER_NUMBER = config.OWNER_NUMBER || '2557XXXXXXXX';

function getQuotedMessage(ctx) {
    return ctx.m?.message?.extendedTextMessage
        ?.contextInfo?.quotedMessage || null;
}

function unwrapMessage(message) {
    let msg = message;

    while (msg) {
        const next =
            msg.ephemeralMessage?.message ||
            msg.viewOnceMessage?.message ||
            msg.viewOnceMessageV2?.message ||
            msg.viewOnceMessageV2Extension?.message;

        if (!next) break;
        msg = next;
    }

    return msg;
}

async function downloadMedia(message) {
    const msg = unwrapMessage(message);

    const types = [
        ['imageMessage', 'image'],
        ['videoMessage', 'video'],
        ['audioMessage', 'audio'],
        ['documentMessage', 'document'],
        ['stickerMessage', 'sticker'],
    ];

    for (const [key, type] of types) {
        if (!msg?.[key]) continue;

        const mediaMessage = msg[key];
        const stream = await downloadContentFromMessage(
            mediaMessage,
            type
        );

        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return {
            buffer: Buffer.concat(chunks),
            type,
            message: mediaMessage,
        };
    }

    return null;
}

async function sendToOwner(ctx, mode = 'all') {
    const quoted = getQuotedMessage(ctx);

    if (!quoted) {
        return ctx.reply(
            '❌ Reply to an image, video, audio, document, or sticker.'
        );
    }

    const number = String(OWNER_NUMBER).replace(/\D/g, '');

    if (!number || number.includes('X')) {
        return ctx.reply(
            '❌ Set your real OWNER_NUMBER in the bot configuration.'
        );
    }

    const ownerJid = `${number}@s.whatsapp.net`;

    try {
        const media = await downloadMedia(quoted);

        if (!media) {
            return ctx.reply('❌ No supported media found.');
        }

        if (mode === 'sticker' && media.type !== 'sticker') {
            return ctx.reply('❌ Reply to a sticker and try again.');
        }

        const caption =
            `📥 *SAVED MEDIA*\n\n` +
            `🤖 Bot: ${config.BOT_NAME || 'LUKA-XMD'}\n` +
            `👤 Requested by: ${ctx.sender || 'Unknown'}\n` +
            `📂 Type: ${media.type}\n\n` +
            `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

        let content;

        switch (media.type) {
            case 'image':
                content = {
                    image: media.buffer,
                    caption,
                };
                break;

            case 'video':
                content = {
                    video: media.buffer,
                    caption,
                };
                break;

            case 'audio':
                content = {
                    audio: media.buffer,
                    mimetype: media.message.mimetype || 'audio/mpeg',
                    ptt: media.message.ptt || false,
                };
                break;

            case 'document':
                content = {
                    document: media.buffer,
                    mimetype: media.message.mimetype ||
                        'application/octet-stream',
                    fileName: media.message.fileName || 'saved_file',
                    caption,
                };
                break;

            case 'sticker':
                content = {
                    sticker: media.buffer,
                };
                break;
        }

        await ctx.sock.sendMessage(ownerJid, content);

        await ctx.reply('✅ Media sent to the bot owner successfully.');
        await ctx.react('✅');
    } catch (error) {
        console.error('[SAVE TO OWNER]', error);
        await ctx.reply(`❌ Failed: ${error.message}`);
    }
}

addCmd({
    name: 'save',
    aliases: ['saver', 'savefile'],
    desc: 'Send replied media to the bot owner',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});

addCmd({
    name: 'vv',
    aliases: ['viewonce', 'retrievemedia'],
    desc: 'Send quoted media to the owner',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});

addCmd({
    name: 'steal',
    aliases: ['getsticker', 'savesticker'],
    desc: 'Send a replied sticker to the owner',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx, 'sticker'),
});

addCmd({
    name: 'take',
    aliases: ['getmedia', 'reupload'],
    desc: 'Send replied media to the owner',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});

addCmd({
    name: 'saveall',
    aliases: ['saveany', 'fetchmedia'],
    desc: 'Send supported replied media to the owner',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});
