'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Jimp = require('jimp');

const BOT_NAME = config.BOT_NAME || 'LUKA-XMD';
const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

const TEMP_DIR = path.join(os.tmpdir(), 'luka-media');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function getQuotedMessage(ctx) {
    const message = ctx.m?.message;
    const context = message?.extendedTextMessage?.contextInfo;

    return context?.quotedMessage || null;
}

function getQuotedType(ctx) {
    const quoted = getQuotedMessage(ctx);

    if (!quoted) return null;

    if (quoted.imageMessage) return 'image';
    if (quoted.videoMessage) return 'video';
    if (quoted.stickerMessage) return 'sticker';
    if (quoted.audioMessage) return 'audio';
    if (quoted.documentMessage) return 'document';

    return null;
}

function getQuotedKey(ctx) {
    const context = ctx.m?.message?.extendedTextMessage?.contextInfo;

    if (!context?.stanzaId) return null;

    return {
        remoteJid: ctx.from,
        id: context.stanzaId,
        participant: context.participant
    };
}

function getTargetJid(ctx) {
    const context = ctx.m?.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid || [];

    if (mentioned.length) return mentioned[0];

    return context?.participant || null;
}

function getInput(ctx) {
    return String(ctx.text || '').trim();
}

function isUrl(value) {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

function replyText(ctx, text) {
    return ctx.reply(`${text}\n\n${FOOTER}`);
}

// Download quoted media using the Baileys media utility.
async function downloadQuotedMedia(ctx) {
    const quoted = getQuotedMessage(ctx);

    if (!quoted) {
        throw new Error('Reply to a media message first.');
    }

    const baileys = require('@whiskeysockets/baileys');

    if (typeof baileys.downloadContentFromMessage !== 'function') {
        throw new Error('The installed Baileys version does not expose downloadContentFromMessage.');
    }

    const mediaEntry = Object.entries(quoted).find(([key]) =>
        ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage']
            .includes(key)
    );

    if (!mediaEntry) {
        throw new Error('Unsupported quoted media.');
    }

    const [key, message] = mediaEntry;
    const type = key.replace('Message', '');

    const stream = await baileys.downloadContentFromMessage(message, type);
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return {
        buffer: Buffer.concat(chunks),
        type,
        message
    };
}

async function sendFile(ctx, filePath, mimetype, filename, caption) {
    await ctx.sock.sendMessage(
        ctx.from,
        {
            document: fs.readFileSync(filePath),
            mimetype,
            fileName: filename,
            caption
        },
        { quoted: ctx.m }
    );
}

// 1. IMAGE EFFECT — JIMP
addCmd({
    name: 'effect',
    aliases: ['jimp', 'imgeffect'],
    desc: 'Apply an effect to a quoted image',
    category: 'media',

    handler: async (ctx) => {
        const effect = (getInput(ctx) || 'grayscale').toLowerCase();

        const allowed = [
            'grayscale',
            'invert',
            'blur',
            'pixelate',
            'sepia'
        ];

        if (!allowed.includes(effect)) {
            return replyText(
                ctx,
                `Available effects: ${allowed.join(', ')}\nUsage: ${ctx.prefix || '.'}effect grayscale`
            );
        }

        let inputPath;
        let outputPath;

        try {
            await ctx.react('⏳');

            const media = await downloadQuotedMedia(ctx);

            if (media.type !== 'image') {
                throw new Error('Reply to an image, not a video or sticker.');
            }

            inputPath = path.join(TEMP_DIR, `input-${Date.now()}.jpg`);
            outputPath = path.join(TEMP_DIR, `effect-${Date.now()}.jpg`);

            fs.writeFileSync(inputPath, media.buffer);

            let image = await Jimp.read(inputPath);

            switch (effect) {
                case 'grayscale':
                    image = image.grayscale();
                    break;
                case 'invert':
                    image = image.invert();
                    break;
                case 'blur':
                    image = image.blur(5);
                    break;
                case 'pixelate':
                    image = image.pixelate(12);
                    break;
                case 'sepia':
                    image = image.sepia();
                    break;
            }

            await image.writeAsync(outputPath);

            await ctx.sock.sendMessage(
                ctx.from,
                {
                    image: fs.readFileSync(outputPath),
                    caption: `Image effect: ${effect}\n${FOOTER}`
                },
                { quoted: ctx.m }
            );

            await ctx.react('✅');
        } catch (error) {
            console.error('[EFFECT]', error.message);
            await ctx.react('❌');
            await replyText(ctx, error.message || 'Unable to process the image.');
        } finally {
            for (const file of [inputPath, outputPath]) {
                if (file && fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            }
        }
    }
});

// 2. VCF CONTACT
addCmd({
    name: 'vcf',
    aliases: ['contact'],
    desc: 'Create a contact card',
    category: 'tools',

    handler: async (ctx) => {
        const parts = getInput(ctx).split('|').map(value => value.trim());

        if (parts.length < 2 || !parts[0] || !parts[1]) {
            return replyText(
                ctx,
                `Usage: ${ctx.prefix || '.'}vcf Name|PhoneNumber\nExample: ${ctx.prefix || '.'}vcf Luka|255712345678`
            );
        }

        const name = parts[0].replace(/[\r\n]/g, ' ');
        const phone = parts[1].replace(/[^\d+]/g, '');

        if (!/^\+?\d{7,15}$/.test(phone)) {
            return replyText(ctx, 'Please enter a valid phone number.');
        }

        const safeName = name.replace(/[\\,;]/g, ' ');

        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${safeName}`,
            `TEL;TYPE=CELL:${phone}`,
            'END:VCARD'
        ].join('\r\n');

        try {
            await ctx.sock.sendMessage(
                ctx.from,
                {
                    contacts: {
                        displayName: name,
                        contacts: [{ vcard }]
                    }
                },
                { quoted: ctx.m }
            );
        } catch (error) {
            console.error('[VCF]', error.message);
            await replyText(ctx, 'Unable to create the contact card.');
        }
    }
});

// 3. BAN
addCmd({
    name: 'ban',
    aliases: ['blockuser'],
    desc: 'Block a WhatsApp user',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const target = getTargetJid(ctx);

        if (!target) {
            return replyText(
                ctx,
                `Reply to a user's message or mention them with ${ctx.prefix || '.'}ban`
            );
        }

        try {
            await ctx.sock.updateBlockStatus(target, 'block');
            return replyText(ctx, `User blocked successfully: ${target}`);
        } catch (error) {
            console.error('[BAN]', error.message);
            return replyText(ctx, 'Unable to block this user.');
        }
    }
});

// 4. BAN LIST
addCmd({
    name: 'banlist',
    aliases: ['blocked'],
    desc: 'Show blocked WhatsApp users',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const list = await ctx.sock.fetchBlocklist();

            if (!Array.isArray(list) || !list.length) {
                return replyText(ctx, 'Your block list is empty.');
            }

            return replyText(
                ctx,
                `BLOCKED USERS (${list.length})\n\n` +
                list.map((jid, index) => `${index + 1}. ${jid}`).join('\n')
            );
        } catch (error) {
            console.error('[BANLIST]', error.message);
            return replyText(ctx, 'Unable to retrieve the block list.');
        }
    }
});

// 5. UNBAN
addCmd({
    name: 'unban',
    aliases: ['unblock'],
    desc: 'Unblock a WhatsApp user',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const target = getTargetJid(ctx) || getInput(ctx);

        if (!target) {
            return replyText(
                ctx,
                `Usage: ${ctx.prefix || '.'}unban 255712345678\nOr reply to the user's message.`
            );
        }

        let jid = target;

        if (!jid.includes('@')) {
            const number = jid.replace(/\D/g, '');

            if (!/^\d{7,15}$/.test(number)) {
                return replyText(ctx, 'Please enter a valid phone number.');
            }

            jid = `${number}@s.whatsapp.net`;
        }

        try {
            await ctx.sock.updateBlockStatus(jid, 'unblock');
            return replyText(ctx, `User unblocked successfully: ${jid}`);
        } catch (error) {
            console.error('[UNBAN]', error.message);
            return replyText(ctx, 'Unable to unblock this user.');
        }
    }
});

// 6. VIEW ONCE
addCmd({
    name: 'vv',
    aliases: ['viewonce'],
    desc: 'Retrieve a supported view-once message',
    category: 'media',

    handler: async (ctx) => {
        const quoted = getQuotedMessage(ctx);

        if (!quoted) {
            return replyText(ctx, `Reply to a view-once message with ${ctx.prefix || '.'}vv`);
        }

        const viewOnce =
            quoted.viewOnceMessage?.message ||
            quoted.viewOnceMessageV2?.message ||
            quoted.viewOnceMessageV2Extension?.message;

        if (!viewOnce) {
            return replyText(ctx, 'The quoted message is not a recognized view-once message.');
        }

        try {
            const messageType = Object.keys(viewOnce).find(key =>
                ['imageMessage', 'videoMessage'].includes(key)
            );

            if (!messageType) {
                return replyText(ctx, 'This view-once media type is not supported.');
            }

            const media = await downloadQuotedMedia(ctx);

            if (media.type === 'image') {
                await ctx.sock.sendMessage(
                    ctx.from,
                    { image: media.buffer, caption: FOOTER },
                    { quoted: ctx.m }
                );
            } else if (media.type === 'video') {
                await ctx.sock.sendMessage(
                    ctx.from,
                    { video: media.buffer, caption: FOOTER },
                    { quoted: ctx.m }
                );
            }
        } catch (error) {
            console.error('[VV]', error.message);
            return replyText(ctx, 'Unable to retrieve this message with the current connection.');
        }
    }
});

// 7. TO URL
addCmd({
    name: 'tourl',
    aliases: ['upload'],
    desc: 'Upload quoted media and return a URL',
    category: 'media',

    handler: async (ctx) => {
        if (!getQuotedType(ctx)) {
            return replyText(
                ctx,
                `Reply to an image, video, or document with ${ctx.prefix || '.'}tourl`
            );
        }

        return replyText(
            ctx,
            'No media upload provider is configured. Connect a file-hosting API to enable this command.'
        );
    }
});

// 8. REMINI
addCmd({
    name: 'remini',
    aliases: ['enhance'],
    desc: 'Enhance an image',
    category: 'media',

    handler: async (ctx) => {
        if (getQuotedType(ctx) !== 'image') {
            return replyText(
                ctx,
                `Reply to an image with ${ctx.prefix || '.'}remini`
            );
        }

        return replyText(
            ctx,
            'Image enhancement API is not configured yet.'
        );
    }
});

// 9. TAKE
addCmd({
    name: 'take',
    aliases: ['steal', 'rename'],
    desc: 'Rename a sticker pack',
    category: 'media',

    handler: async (ctx) => {
        if (getQuotedType(ctx) !== 'sticker') {
            return replyText(
                ctx,
                `Reply to a sticker with ${ctx.prefix || '.'}take PackName`
            );
        }

        const packName = getInput(ctx);

        if (!packName) {
            return replyText(
                ctx,
                `Usage: ${ctx.prefix || '.'}take PackName`
            );
        }

        return replyText(
            ctx,
            `Requested sticker pack: ${packName}\nSticker metadata utility is not configured yet.`
        );
    }
});

// 10. STICKER TO IMAGE
addCmd({
    name: 'toimg',
    aliases: ['toimage'],
    desc: 'Convert a sticker into an image',
    category: 'media',

    handler: async (ctx) => {
        if (getQuotedType(ctx) !== 'sticker') {
            return replyText(
                ctx,
                `Reply to a static sticker with ${ctx.prefix || '.'}toimg`
            );
        }

        return replyText(
            ctx,
            'Sticker-to-image conversion is not configured yet.'
        );
    }
});
