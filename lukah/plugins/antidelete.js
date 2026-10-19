'use strict';

const db = require('../../luka/db/database');
const { getBotName } = require('../botname');
const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');

const KEY = 'antidelete_config';
const DEFAULT = { enabled: false, mode: 'chat', totalDeleted: 0 };

class AntiDeleteManager {
    constructor() {
        this.config = this.load();
        this.messages = new Map();
    }

    load() {
        try {
            return { ...DEFAULT, ...db.getConfigSync(KEY, DEFAULT) };
        } catch {
            return { ...DEFAULT };
        }
    }

    save() {
        try { db.setConfig(KEY, this.config).catch(() => {}); } catch {}
    }

    cache(msg) {
        if (!msg?.key?.id || !msg.message || msg.key.fromMe) return;
        this.messages.set(msg.key.id, msg);
        if (this.messages.size > 500)
            this.messages.delete(this.messages.keys().next().value);
    }

    async handle(sock, update) {
        try {
            if (!this.config.enabled || !update?.key?.id || update.message) return;

            const msg = this.messages.get(update.key.id);
            if (!msg) return;
            this.messages.delete(update.key.id);

            const owner = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
            const jid = this.config.mode === 'inbox'
                ? (owner ? `${owner}@s.whatsapp.net` : null)
                : msg.key.remoteJid;

            if (!jid) return;

            const m = msg.message;
            const content = m.conversation ||
                m.extendedTextMessage?.text ||
                m.imageMessage?.caption ||
                m.videoMessage?.caption ||
                m.documentMessage?.caption ||
                '[Media or non-text message]';

            await sock.sendMessage(jid, {
                text: `🛡️ *ANTI-DELETE ALERT*\n\n👤 Sender: ${msg.pushName || 'Unknown'}\n💬 Chat: ${msg.key.remoteJid}\n📝 Message: ${content}\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            });

            this.config.totalDeleted++;
            this.save();
        } catch (e) {
            console.error('[ANTIDELETE]', e.message);
        }
    }
}

const manager = new AntiDeleteManager();

addCmd({
    name: 'antidelete',
    aliases: ['antidel', 'ad'],
    desc: 'Manage deleted messages',
    category: 'owner',
    ownerOnly: true,
    handler: async ({ args, reply, isOwner }) => {
        if (!isOwner) return reply('❌ Owner only!');

        const action = (args[0] || '').toLowerCase();

        switch (action) {
            case 'on':
                manager.config.enabled = true;
                manager.save();
                return reply('✅ Anti-Delete enabled.');

            case 'off':
                manager.config.enabled = false;
                manager.save();
                return reply('❌ Anti-Delete disabled.');

            case 'chat':
            case 'inbox':
                manager.config.mode = action;
                manager.save();
                return reply(`✅ Anti-Delete mode: ${action.toUpperCase()}`);

            case 'status':
                return reply(
                    `🛡️ *ANTIDELETE STATUS*\n\n` +
                    `Status: ${manager.config.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
                    `Mode: ${manager.config.mode.toUpperCase()}\n` +
                    `Deleted: ${manager.config.totalDeleted}\n\n` +
                    `Powered by ${getBotName().toUpperCase()}`
                );

            default:
                return reply(
                    `🛡️ *ANTIDELETE COMMANDS*\n\n` +
                    `1. .antidelete on\n` +
                    `2. .antidelete off\n` +
                    `3. .antidelete chat\n` +
                    `4. .antidelete inbox\n` +
                    `5. .antidelete status`
                );
        }
    }
});

module.exports = {
    cacheAntiDeleteMessage: msg => manager.cache(msg),
    handleAntiDelete: (sock, update) => manager.handle(sock, update),
    antiDeleteManager: manager
};
