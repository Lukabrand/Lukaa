'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const path = require('path');
const pino = require('pino');

const PAIR_DIR = path.join(__dirname, '../../sessions/pair');

const activePairs = new Map();

if (!fs.existsSync(PAIR_DIR)) {
    fs.mkdirSync(PAIR_DIR, { recursive: true });
}

async function replyText(ctx, text) {
    return ctx.sock.sendMessage(
        ctx.from,
        { text },
        { quoted: ctx.m }
    );
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

addCmd({
    name: 'pair',
    aliases: ['paircode', 'getpair'],
    desc: 'Generate a WhatsApp pairing code',
    usage: 'pair <phone_number>',
    category: 'owner',

    handler: async (ctx) => {
        const number = String(ctx.args[0] || '').replace(/\D/g, '');

        if (!number) {
            return replyText(
                ctx,
                'WHATSAPP PAIRING\n\n' +
                'Usage: .pair <phone_number>\n' +
                'Example: .pair 255712345678\n\n' +
                'Enter your number with country code, without +.\n\n' +
                'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ'
            );
        }

        if (number.length < 10 || number.length > 15) {
            return replyText(
                ctx,
                'Invalid phone number.\n' +
                'Include your country code without +.'
            );
        }

        if (activePairs.has(number)) {
            return replyText(
                ctx,
                'A pairing request for this number is already active.\n' +
                'Please wait for it to finish.'
            );
        }

        const sessionDir = path.join(PAIR_DIR, number);

        let sock;
        let timeout;
        let connectionListener;
        let credsListener;

        activePairs.set(number, true);

        try {
            await replyText(
                ctx,
                'WHATSAPP PAIRING\n\n' +
                `Phone: +${number}\n` +
                'Preparing your pairing code...\n\n' +
                'Please wait.'
            );

            fs.mkdirSync(sessionDir, { recursive: true });

            const { state, saveCreds } =
                await useMultiFileAuthState(sessionDir);

            if (state.creds.registered) {
                await replyText(
                    ctx,
                    'This number already has a saved WhatsApp session.\n\n' +
                    'Use the existing session instead of requesting a new pairing code.\n' +
                    'If you want to link it again, unlink the old session from WhatsApp first and handle the old session files carefully.'
                );
                return;
            }

            const { version } = await fetchLatestBaileysVersion();

            sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                browser: ['LUKA-XMD', 'Chrome', '1.0.0'],
                logger: pino({ level: 'silent' }),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 15000,
                markOnlineOnConnect: false,
            });

            sock.ev.on('creds.update', saveCreds);

            // Wait until the socket is open before requesting a pairing code.
            await new Promise((resolve, reject) => {
                let settled = false;

                const finish = (err) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    sock.ev.off('connection.update', connectionListener);

                    if (err) reject(err);
                    else resolve();
                };

                connectionListener = (update) => {
                    if (update.connection === 'open') {
                        finish();
                    }

                    if (update.connection === 'close') {
                        const statusCode =
                            update.lastDisconnect?.error?.output?.statusCode;

                        finish(
                            new Error(
                                `WhatsApp connection closed${statusCode ? ` (${statusCode})` : ''}. Please try again.`
                            )
                        );
                    }
                };

                sock.ev.on('connection.update', connectionListener);

                timeout = setTimeout(() => {
                    finish(
                        new Error(
                            'Connection timed out while waiting for WhatsApp.'
                        )
                    );
                }, 30000);
            }).catch(async (error) => {
                // A new, unregistered Baileys socket may not emit "open"
                // until pairing is completed. Continue to the pairing request.
                if (
                    !String(error.message).includes('Connection timed out')
                ) {
                    throw error;
                }
            });

            if (!sock || sock.ws?.readyState !== 1) {
                // Give the socket a short moment to finish opening.
                await sleep(1500);
            }

            if (state.creds.registered) {
                await replyText(
                    ctx,
                    'This WhatsApp session is already registered.'
                );
                return;
            }

            const pairingCode = await Promise.race([
                sock.requestPairingCode(number),
                new Promise((_, reject) => {
                    timeout = setTimeout(
                        () => reject(
                            new Error(
                                'Pairing code request timed out. Check your internet and try again.'
                            )
                        ),
                        45000
                    );
                }),
            ]);

            clearTimeout(timeout);
            timeout = null;

            if (!pairingCode) {
                throw new Error(
                    'WhatsApp did not return a pairing code. Please try again.'
                );
            }

            await replyText(
                ctx,
                'WHATSAPP PAIRING CODE\n\n' +
                `Phone Number: +${number}\n` +
                `Pairing Code: ${pairingCode}\n\n` +
                'HOW TO CONNECT\n\n' +
                '1. Open WhatsApp on your phone.\n' +
                '2. Go to Settings.\n' +
                '3. Open Linked Devices.\n' +
                '4. Select Link a Device.\n' +
                '5. Choose Link with phone number instead.\n' +
                '6. Enter the pairing code above.\n\n' +
                'Keep your pairing code private.\n' +
                'Do not share it with anyone.\n\n' +
                'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ'
            );

            // Keep the socket alive so pairing can complete and credentials
            // can be saved. Close it when the connection opens or after timeout.
            await new Promise((resolve) => {
                let finished = false;

                const finish = () => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timeout);
                    sock.ev.off('connection.update', connectionListener);
                    resolve();
                };

                connectionListener = (update) => {
                    if (update.connection === 'open') {
                        finish();
                    }

                    if (update.connection === 'close') {
                        finish();
                    }
                };

                sock.ev.on('connection.update', connectionListener);

                timeout = setTimeout(finish, 120000);
            });

        } catch (error) {
            console.error('[PAIR ERROR]', error);

            await replyText(
                ctx,
                'FAILED TO GENERATE PAIRING CODE\n\n' +
                `Reason: ${error.message || 'Unknown error'}\n\n` +
                'Check your internet connection and try again.\n\n' +
                'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ'
            ).catch(() => {});

        } finally {
            if (timeout) clearTimeout(timeout);

            if (sock) {
                if (connectionListener) {
                    sock.ev.off('connection.update', connectionListener);
                }

                if (credsListener) {
                    sock.ev.off('creds.update', credsListener);
                }

                // Do not close a successfully connected session.
                // The socket remains managed by this process.
            }

            activePairs.delete(number);
        }
    },
});
