'use strict';

const db = require('../../luka/db/database');
const { getBotName } = require('../botname');
const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');

const CONFIG_DB_KEY = 'antidelete_config';

const DEFAULT_CONFIG = {
    enabled: false,
    mode: 'inbox',
    totalDeleted: 0,
    lastDeleted: null
};

class AntiDeleteManager {
    constructor() {
        this.config = this.loadConfig();
        this.messages = new Map();
    }

    loadConfig() {
        try {
            return {
                ...DEFAULT_CONFIG,
                ...db.getConfigSync(CONFIG_DB_KEY, DEFAULT_CONFIG)
            };
        } catch {
            return { ...DEFAULT_CONFIG };
        }
    }

    saveConfig() {
        try {
            db.setConfig(CONFIG_DB_KEY, this.config).catch(() => {});
        } catch {}
    }

    cacheMessage(msg) {
        try {
            if (!msg?.key?.id || !msg.message || msg.key.fromMe) return false;

            if (msg.key.remoteJid === 'status@broadcast') return false;

            this.messages.set(msg.key.id, {
                key: msg.key,
                message: msg.message,
                pushName: msg.pushName || 'Unknown',
                timestamp: Date.now()
            });

            if (this.messages.size > 500) {
                this.messages.delete(this.messages.keys().next().value);
            }

            return true;
        } catch (err) {
            console.error('[ANTIDELETE CACHE]', err.message);
            return false;
        }
    }

    async handleDelete(sock, update) {
        try {
            if (!this.config.enabled || !update?.key?.id) return false;
            if (update.message) return false;

            const key = update.key;
            const saved = this.messages.get(key.id);

            if (!saved) return false;

            this.messages.delete(key.id);

            const ownerNumber = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
            const ownerJid = ownerNumber
                ? `${ownerNumber}@s.whatsapp.net`
                : null;

            const chatJid = saved.key.remoteJid;

            const message = saved.message;
            const content =
                message.conversation ||
                message.extendedTextMessage?.text ||
                message.imageMessage?.caption ||
                message.videoMessage?.caption ||
                message.documentMessage?.caption ||
                '[Media or non-text message]';

            const messageType = Object.keys(message)[0] || 'unknown';

            const report =
                `🛡️ *ANTI-DELETE ALERT*\n\n` +
                `👤 Sender: ${saved.pushName}\n` +
                `📱 Number: ${key.participant || chatJid}\n` +
                `💬 Chat: ${chatJid}\n` +
                `📂 Type: ${messageType}\n` +
                `📝 Message: ${content}\n` +
                `🕒 Deleted at: ${new Date().toLocaleString()}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

            const destination = this.config.mode === 'chat'
                ? chatJid
                : ownerJid;

            if (!destination) {
                console.error('[ANTIDELETE] OWNER_NUMBER is missing in settings.');
                return false;
            }

            await sock.sendMessage(destination, { text: report });

            this.config.totalDeleted++;
            this.config.lastDeleted = {
                sender: saved.pushName,
                chat: chatJid,
                message: content,
                timestamp: Date.now()
            };

            this.saveConfig();

            console.log(`[ANTIDELETE] Deleted message detected from ${saved.pushName}`);
            return true;
        } catch (err) {
            console.error('[ANTIDELETE]', err.message);
            return false;
        }
    }

    getStats() {
        return {
            ...this.config,
            cachedMessages: this.messages.size
        };
    }
}

const antiDeleteManager = new AntiDeleteManager();

async function handleAntiDelete(sock, update) {
    return antiDeleteManager.handleDelete(sock, update);
}

function cacheAntiDeleteMessage(msg) {
    return antiDeleteManager.cacheMessage(msg);
}

addCmd({
    name: 'antidelete',
    aliases: ['antidel', 'ad'],
    desc: 'Detect deleted WhatsApp messages',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const { args, reply, isOwner } = ctx;
            const prefix = config.BOT_PREFIX;
            
            if (!isOwner) {
                await reply('❌ Owner only!');
                return;
            }

            if (!args.length) {
                let text = `╭─⌈ 🛡️ *ANTIDELETE* ⌋\n│\n`;
                text += `├─⊷ *${prefix}antidelete on*\n│  └⊷ Enable Anti-Delete\n`;
                text += `├─⊷ *${prefix}antidelete off*\n│  └⊷ Disable Anti-Delete\n`;
                text += `├─⊷ *${prefix}antidelete inbox*\n│  └⊷ Send deleted messages to owner inbox\n`;
                text += `├─⊷ *${prefix}antidelete chat*\n│  └⊷ Send alerts to the original chat\n`;
                text += `├─⊷ *${prefix}antidelete status*\n│  └⊷ View Anti-Delete statistics\n`;
                text += `╰⊷ *Powered by ${getBotName().toUpperCase()}*`;

                await reply(text);
                return;
            }

            switch (args[0].toLowerCase()) {
                case 'on':
                    antiDeleteManager.config.enabled = true;
                    antiDeleteManager.saveConfig();
                    await reply('✅ *ANTIDELETE ENABLED*\n\nDeleted-message alerts are now active.');
                    break;

                case 'off':
                    antiDeleteManager.config.enabled = false;
                    antiDeleteManager.saveConfig();
                    await reply('❌ *ANTIDELETE DISABLED*');
                    break;

                case 'inbox':
                    antiDeleteManager.config.mode = 'inbox';
                    antiDeleteManager.saveConfig();
                    await reply('✅ *INBOX MODE ENABLED*\n\nDeleted-message alerts will be sent to your WhatsApp inbox.');
                    break;

                case 'chat':
                    antiDeleteManager.config.mode = 'chat';
                    antiDeleteManager.saveConfig();
                    await reply('✅ *CHAT MODE ENABLED*\n\nDeleted-message alerts will be sent to the original chat.');
                    break;

                case 'status': {
                    const stats = antiDeleteManager.getStats();

                    let text = `📊 *ANTIDELETE STATUS*\n\n`;
                    text += `🛡️ Status: ${stats.enabled ? 'ON ✅' : 'OFF ❌'}\n`;
                    text += `📥 Mode: ${stats.mode.toUpperCase()}\n`;
                    text += `🗑️ Deleted messages: ${stats.totalDeleted}\n`;
                    text += `💾 Cached messages: ${stats.cachedMessages}\n`;

                    if (stats.lastDeleted) {
                        text += `👤 Last sender: ${stats.lastDeleted.sender}\n`;
                    }

                    text += `\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

                    await reply(text);
                    break;
                }

                default:
                    await reply(`❓ Unknown command. Use *${prefix}antidelete* to view all commands.`);
            }
        } catch (err) {
            console.error('[ANTIDELETE COMMAND]', err.message);
        }
    }
});

module.exports = {
    handleAntiDelete,
    cacheAntiDeleteMessage,
    antiDeleteManager
};
