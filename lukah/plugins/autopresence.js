'use strict';

const { addCmd } = require('../../luka/handlers/loader');

const state = global.autoPresenceState ||= {
    typing: false,
    recording: false,
    sockets: new WeakSet()
};

function attachPresenceListener(sock) {
    if (!sock?.ev || state.sockets.has(sock)) return;

    state.sockets.add(sock);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages || []) {
            const jid = msg.key?.remoteJid;

            if (!jid || msg.key?.fromMe || jid === 'status@broadcast') continue;
            if (jid.endsWith('@g.us') && !state.typing && !state.recording) continue;

            const mode = state.typing
                ? 'composing'
                : state.recording
                    ? 'recording'
                    : null;

            if (!mode) continue;

            try {
                await sock.sendPresenceUpdate(mode, jid);

                setTimeout(async () => {
                    try {
                        await sock.sendPresenceUpdate('paused', jid);
                    } catch {}
                }, 2000);
            } catch (err) {
                console.error('[AUTOPRESENCE]', err.message);
            }
        }
    });
}

function registerCommand(pattern, description, type) {
    addCmd({
        pattern,
        alias: [],
        desc: description,
        category: 'owner',
        fromMe: true,
        async handler(ctx) {
            const sock = ctx.sock || ctx.conn || ctx.client ||
                global.sock || global.conn;

            const action = (ctx.args || [])
                .join(' ')
                .trim()
                .toLowerCase();

            if (!sock) {
                return ctx.reply('WhatsApp connection is unavailable.');
            }

            attachPresenceListener(sock);

            if (action === 'on') {
                state[type] = true;
            } else if (action === 'off') {
                state[type] = false;
            } else {
                return ctx.reply(
                    `${description}\n\n` +
                    `Usage: .${pattern} on\n` +
                    `Usage: .${pattern} off\n\n` +
                    `Status: ${state[type] ? 'ON' : 'OFF'}\n\n` +
                    `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
                );
            }

            return ctx.reply(
                `${description}\n\n` +
                `Status: ${state[type] ? 'ENABLED' : 'DISABLED'}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        }
    });
}

registerCommand('autotyping', 'Auto Typing Settings', 'typing');
registerCommand('autorecording', 'Auto Recording Settings', 'recording');
