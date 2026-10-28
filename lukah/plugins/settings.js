'use strict';

const { addCmd, addTrigger } = require('../../luka/handlers/loader');
const { getSetting, setSetting, getGroupSettings, setGroupSetting } = require('../../luka/db/database');
const config = require('../../luka/config/settings');
const moment = require('moment-timezone');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');

// ═══════════════════════════════════════════════════════════════
//  OWNER BOOL TOGGLE HELPER
// ═══════════════════════════════════════════════════════════════

function ownerToggle({ name, aliases = [], desc, configKey, onMsg, offMsg }) {
    addCmd({
        name,
        aliases,
        desc,
        category: 'owner',
        ownerOnly: true,
        handler: async (ctx) => {
            const arg     = ctx.args[0]?.toLowerCase();
            const current = config[configKey];
            const newVal  = arg === 'on' ? true : arg === 'off' ? false : !current;
            setSetting(configKey, String(newVal));
            config[configKey] = newVal;
            await ctx.reply(newVal ? onMsg : offMsg);
        },
    });
}

// ── Auto-React ─────────────────────────────────────────────────
ownerToggle({
    name:      'autoreact',
    aliases:   ['togglereact'],
    desc:      'Toggle auto-react on every incoming message',
    configKey: 'AUTO_REACT',
    onMsg:     '✅ *Auto-React ON*\n\nI will react to every incoming message.',
    offMsg:    '🔕 *Auto-React OFF*\n\nAuto-react has been disabled.',
});

// ── Auto-Read Status ───────────────────────────────────────────
ownerToggle({
    name:      'autoread',
    aliases:   ['toggleread', 'autoreadstatus'],
    desc:      'Toggle auto-read of WhatsApp statuses',
    configKey: 'AUTO_READ_STATUS',
    onMsg:     '✅ *Auto-Read Status ON*\n\nI will automatically view all statuses.',
    offMsg:    '🔕 *Auto-Read Status OFF*\n\nStatus auto-reading has been disabled.',
});

// ── Auto-Like Status ───────────────────────────────────────────
ownerToggle({
    name:      'autolike',
    aliases:   ['togglelike', 'autolikestatus'],
    desc:      'Toggle auto-like of WhatsApp statuses',
    configKey: 'AUTO_LIKE_STATUS',
    onMsg:     '✅ *Auto-Like Status ON*\n\nI will automatically like all statuses.',
    offMsg:    '🔕 *Auto-Like Status OFF*\n\nStatus auto-liking has been disabled.',
});

// ── Auto-Bio ───────────────────────────────────────────────────
ownerToggle({
    name:      'autobio',
    aliases:   ['togglebio'],
    desc:      'Toggle auto-bio rotation every 10 minutes',
    configKey: 'AUTO_BIO',
    onMsg:     '✅ *Auto-Bio ON*\n\nProfile bio will rotate every 10 minutes.',
    offMsg:    '🔕 *Auto-Bio OFF*\n\nBio rotation has been stopped.',
});

// ═══════════════════════════════════════════════════════════════
//  AUTO-TYPING
//  Show "typing..." in chat before every bot reply
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'autotyping',
    aliases:   ['toggletyping', 'typing'],
    desc:      'Toggle typing indicator before bot replies',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('AUTO_TYPING', 'false') === 'true';
        const newVal  = !current;
        setSetting('AUTO_TYPING', String(newVal));
        config.AUTO_TYPING = newVal;
        await ctx.reply(
            newVal
                ? '⌨️ *Auto-Typing ON*\n\nI will show a typing indicator before every reply.'
                : '🔕 *Auto-Typing OFF*\n\nTyping indicator disabled.'
        );
    },
});

// Inject typing presence before every command execution
// Check isCmd FIRST before the expensive trigger lookup path
addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.m?.isCmd) return;   // ← early exit — skips 99% of messages
        if (getSetting('AUTO_TYPING', 'false') !== 'true') return;
        await ctx.sock.sendPresenceUpdate('composing', ctx.from).catch(() => {});
        await new Promise(r => setTimeout(r, 400));  // reduced from 600ms
        await ctx.sock.sendPresenceUpdate('paused', ctx.from).catch(() => {});
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-FLOOD
//  Removes members who send too many messages in a short window
// ═══════════════════════════════════════════════════════════════

const floodMap = new Map();   // key: `${groupJid}::${sender}` → { count, timer }
const FLOOD_LIMIT  = 7;       // messages
const FLOOD_WINDOW = 6000;    // milliseconds

addCmd({
    name:      'antiflood',
    aliases:   ['noflood'],
    desc:      'Toggle flood protection — removes members who spam quickly',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        if (!ctx.isBotAdmin) return ctx.sock.sendMessage(ctx.from, { text: '❌ I need to be an *admin* to remove members.', contextInfo: channelCtx() }, { quoted: ctx.m });
        const current = getGroupSettings(ctx.from).antiflood;
        if (current === undefined) {
            return ctx.sock.sendMessage(ctx.from, { text: '⚠️ Please run the bot once after this update so the DB migrates. Then try again.', contextInfo: channelCtx() }, { quoted: ctx.m });
        }
        const newVal = !current;
        setGroupSetting(ctx.from, 'antiflood', newVal);
        await ctx.reply(
            newVal
                ? `🌊 *Anti-Flood ON*\n\nMembers sending more than ${FLOOD_LIMIT} messages in ${FLOOD_WINDOW / 1000}s will be removed.`
                : '✅ *Anti-Flood OFF*\n\nFlood protection has been disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        if (ctx.isAdmin || ctx.isOwner || ctx.m.fromMe) return;

        const settings = getGroupSettings(ctx.from);
        if (!settings.antiflood) return;

        const key     = `${ctx.from}::${ctx.sender}`;
        const entry   = floodMap.get(key) || { count: 0 };

        entry.count++;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => floodMap.delete(key), FLOOD_WINDOW);
        floodMap.set(key, entry);

        if (entry.count >= FLOOD_LIMIT) {
            floodMap.delete(key);
            await ctx.sock.groupParticipantsUpdate(ctx.from, [ctx.sender], 'remove').catch(() => {});
            await ctx.send({
                text:
                    `🌊 *Anti-Flood*\n\n` +
                    `@${ctx.sender.split('@')[0]} was removed for flooding the group!\n\n` +
                    `_${config.BOT_NAME}_`,
                mentions: [ctx.sender],
            }).catch(() => {});
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET WARN LIMIT
//  Configure how many warnings before a member is kicked
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'setlimit',
    aliases:   ['warnlimit', 'setwarnlimit'],
    desc:      'Set warn-kick limit for members (default: 3)',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const num = parseInt(ctx.args[0]);
        if (!num || num < 1 || num > 20)
            return ctx.sock.sendMessage(ctx.from, { text: '❌ Provide a number between 1 and 20.\n\nExample: `.setlimit 5`', contextInfo: channelCtx() }, { quoted: ctx.m });
        setSetting('WARN_LIMIT', String(num));
        await ctx.sock.sendMessage(ctx.from, { text: `✅ *Warn Limit Set*\n\nMembers will be kicked after *${num}* warnings.`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET TIMEZONE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'settz',
    aliases:   ['settimezone', 'timezone'],
    desc:      'Change the bot timezone',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const tz = ctx.args[0];
        if (!tz) return ctx.reply(
            '❌ Provide a timezone.\n\n' +
            'Examples:\n' +
            '`Africa/Nairobi`\n`America/New_York`\n`Europe/London`\n`Asia/Dubai`\n\n' +
            `Current: *${config.TIME_ZONE}*`
        );
        if (!moment.tz.zone(tz))
            return ctx.sock.sendMessage(ctx.from, { text: `❌ *"${tz}"* is not a valid timezone.\n\nCheck https://momentjs.com/timezone/`, contextInfo: channelCtx() }, { quoted: ctx.m });
        setSetting('TIME_ZONE', tz);
        config.TIME_ZONE = tz;
        const now = moment().tz(tz).format('hh:mm A · DD MMM YYYY');
        await ctx.sock.sendMessage(ctx.from, { text: `✅ *Timezone Updated*\n\nNew timezone: *${tz}*\nCurrent time: *${now}*`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

// ═══════════════════════════════════════════════════════════════
// BOT SETTINGS — COMPACT ROUNDED STYLE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'botsettings',
    aliases: ['settings', 'bsettings', 'config', 'allsettings'],
    desc: 'View important bot settings',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const botName = config.BOT_NAME || 'LUKA-XMD';
            const footer = config.FOOTER || 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

            const get = (key, fallback = 'Not Set') => {
                const value = getSetting(key, config[key] ?? fallback);
                return value ?? config[key] ?? fallback;
            };

            const show = (value) => {
                if (value === undefined || value === null || value === '') {
                    return 'Not Set';
                }

                if (typeof value === 'object') {
                    try {
                        value = JSON.stringify(value);
                    } catch {
                        value = String(value);
                    }
                }

                const text = String(value);
                return text.length > 60 ? text.slice(0, 57) + '...' : text;
            };

            const on = (value) => {
                const v = String(value).toLowerCase().trim();

                if (value === true || ['true', 'on', 'yes', '1'].includes(v)) {
                    return 'on';
                }

                if (value === false || ['false', 'off', 'no', '0'].includes(v)) {
                    return 'off';
                }

                return show(value);
            };

            // HEADER
            let msg = `╭══〘〘 *${botName}* 〙〙═⊷\n`;
            msg += `      *⚙️ BOT SETTINGS*\n`;
            msg += `╰══✦ ✦══⊷\n\n`;

            // SYSTEM STATUS
            msg += `📡 *SYSTEM STATUS*\n`;
            msg += `▸ Status: 🟢 ONLINE\n`;
            msg += `▸ Prefix: ${show(get('BOT_PREFIX', '.'))}\n`;
            msg += `▸ Mode: ${show(get('MODE', 'public'))}\n`;
            msg += `▸ Version: ${show(get('BOT_VERSION', '5.0.0'))}\n`;
            

            // AUTO FEATURES
            msg += `⚡ *AUTO FEATURES*\n`;
            msg += `▸ Auto React: ${on(get('AUTO_REACT'))}\n`;
            msg += `▸ Auto Bio: ${on(get('AUTO_BIO'))}\n`;
            msg += `▸ Read Status: ${on(get('AUTO_READ_STATUS'))}\n`;
            msg += `▸ Like Status: ${on(get('AUTO_LIKE_STATUS'))}\n`;
            msg += `▸ Auto Reply: ${on(get('AUTO_REPLY'))}\n`;
            msg += `▸ Chatbot: ${on(get('CHATBOT'))}\n`;
            msg += `▸ Start Message: ${on(get('STARTING_MESSAGE'))}\n\n`;

            // SECURITY
            msg += `🛡️ *SECURITY*\n`;
            msg += `▸ Anti Call: ${on(get('ANTICALL'))}\n`;
            msg += `▸ Anti Delete: ${on(get('ANTIDELETE'))}\n`;
            msg += `▸ Anti Edit: ${on(get('ANTI_EDIT'))}\n`;
            msg += `▸ Warn Limit: ${show(get('WARN_LIMIT', '3'))}\n`;
            msg += `▸ Ghost Mode: ${on(get('GHOST_MODE', false))}\n\n`;

            // OTHER SETTINGS
            msg += `🔧 *OTHER SETTINGS*\n`;
            msg += `▸ Timezone: ${show(get('TIME_ZONE', 'Africa/Nairobi'))}\n`;
            msg += `▸ Menu Theme: ${show(get('MENU_THEME', 'ultra'))}\n`;
            msg += `▸ DM Presence: ${show(get('DM_PRESENCE', 'online'))}\n`;

            // SUDO USERS
            let sudoUsers = get(
                'SUDO_NUMBERS',
                config.SUDO_NUMBERS ?? config.SUDO_USERS ?? 'None'
            );

            if (Array.isArray(sudoUsers)) {
                sudoUsers = sudoUsers.length ? sudoUsers.join(', ') : 'None';
            }

            msg += `\n╭══〘〘 👑 *SUDO USERS* 〙〙═⊷\n`;
            msg += `${show(sudoUsers)}\n`;
            msg += `╰═════════════════⊷\n`;

            // GROUP SETTINGS
            msg += `\n╭══〘〘 📋 *GROUP SETTINGS* 〙〙═⊷\n`;

            let groupSettings = {};

            if (ctx.isGroup && ctx.from) {
                groupSettings = getGroupSettings(ctx.from) || {};
            }

            const groupOptions = [
                ['Welcome', 'welcomeMessage', 'welcome'],
                ['Goodbye', 'goodbyeMessage', 'goodbye'],
                ['AntiLink', 'antilink'],
                ['AntiBad', 'antibad'],
                ['AntiFlood', 'antiflood'],
                ['AntiSticker', 'antisticker']
            ];

            if (ctx.isGroup) {
                for (const [label, ...keys] of groupOptions) {
                    let value;

                    for (const key of keys) {
                        if (groupSettings[key] !== undefined) {
                            value = groupSettings[key];
                            break;
                        }
                    }

                    msg += `┃ ${label}: ${show(value)}\n`;
                }
            } else {
                msg += `┃ Run inside a group to view its settings.\n`;
            }

            msg += `╰═════════════════⊷\n\n`;
            msg += `${footer}`;

            await ctx.sock.sendMessage(ctx.from, {
    text: msg
}, { quoted: ctx.m });

        } catch (error) {
            console.error('[BOT SETTINGS ERROR]', error);
            await ctx.reply(`❌ Failed to load settings.\n${error.message}`);
        }
    }
});

// ═══════════════════════════════════════════════════════════════
//  AUTO-RECORDING
//  Show "recording..." in chat — toggle independently of typing
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'autorecording',
    aliases:   ['togglerecording', 'recording'],
    desc:      'Toggle recording indicator before bot replies',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('AUTO_RECORDING', 'false') === 'true';
        const newVal  = !current;
        setSetting('AUTO_RECORDING', String(newVal));
        config.AUTO_RECORDING = newVal;
        await ctx.reply(
            newVal
                ? '🎙️ *Auto-Recording ON*\n\nI will show a recording indicator before every reply.'
                : '🔕 *Auto-Recording OFF*\n\nRecording indicator disabled.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  GHOST MODE
//  Disables read receipts — bot reads messages silently
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'ghostmode',
    aliases:   ['ghost', 'toggleghost'],
    desc:      'Toggle ghost mode — hide read receipts',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('GHOST_MODE', 'false') === 'true';
        const newVal  = !current;
        setSetting('GHOST_MODE', String(newVal));
        config.GHOST_MODE = newVal;
        try {
            await ctx.sock.updatePrivacySettings?.('readreceipts', newVal ? 'none' : 'all').catch(() => {});
        } catch {}
        await ctx.reply(
            newVal
                ? '👻 *Ghost Mode ON*\n\nRead receipts are now hidden. I read silently.'
                : '👁️ *Ghost Mode OFF*\n\nRead receipts are now visible.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  FREEZE LAST SEEN
//  Hides last seen from everyone
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'freezelastseen',
    aliases:   ['freezels', 'hidelastseen'],
    desc:      'Toggle hiding last seen from contacts',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('FREEZE_LAST_SEEN', 'false') === 'true';
        const newVal  = !current;
        setSetting('FREEZE_LAST_SEEN', String(newVal));
        config.FREEZE_LAST_SEEN = newVal;
        try {
            await ctx.sock.updateLastSeenPrivacy?.(newVal ? 'none' : 'contacts').catch(() => {});
        } catch {}
        await ctx.reply(
            newVal
                ? '🧊 *Last Seen Frozen*\n\nNobody can see my last seen anymore.'
                : '🕐 *Last Seen Visible*\n\nLast seen is now visible to contacts.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  STATUS REPLY
//  Auto-reply to statuses with a custom message
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'statusreply',
    aliases:   ['togglestatusreply', 'autoreplystatuses'],
    desc:      'Toggle auto-reply to statuses',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('STATUS_REPLY', 'false') === 'true';
        const newVal  = !current;
        setSetting('STATUS_REPLY', String(newVal));
        config.STATUS_REPLY = newVal;
        await ctx.reply(
            newVal
                ? '💬 *Status Reply ON*\n\nI will auto-reply to statuses.'
                : '🔕 *Status Reply OFF*\n\nAuto status reply disabled.'
        );
    },
});

addCmd({
    name:      'setstatusmsg',
    aliases:   ['statusmsg'],
    desc:      'Set the message to auto-reply on statuses',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const msg = ctx.text;
        if (!msg) return ctx.reply('📝 Usage: `.setstatusmsg <message>`\n\nExample: `.setstatusmsg Nice status! 🔥`');
        setSetting('STATUS_MSG', msg);
        config.STATUS_MSG = msg;
        await ctx.reply(`✅ *Status Reply Message Set*\n\n> ${msg}`);
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET REACT EMOJIS
//  Change the random emoji pool used by auto-react
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'setreactemoji',
    aliases:   ['reactemojis', 'setemoji'],
    desc:      'Set custom auto-react emojis (comma-separated)',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const raw = ctx.text;
        if (!raw) return ctx.reply(
            '📝 Usage: `.setreactemoji 🔥,❤️,😎,✨`\n\n' +
            `Current emojis: \`${config.CUSTOM_REACT_EMOJIS}\``
        );
        const emojis = raw.split(',').map(e => e.trim()).filter(Boolean);
        if (emojis.length < 2) return ctx.reply('❌ Provide at least 2 emojis separated by commas.');
        const joined = emojis.join(',');
        setSetting('CUSTOM_REACT_EMOJIS', joined);
        config.CUSTOM_REACT_EMOJIS = joined;
        await ctx.reply(`✅ *React Emojis Updated*\n\nNew pool: ${emojis.join(' ')}`);
    },
});

// ═══════════════════════════════════════════════════════════════
//  WARN LIST  /  RESET WARNS
//  View and clear user warnings in a group
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'warnlist',
    aliases:   ['warnings', 'listwarns'],
    desc:      'List all warned users in this group',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        const { getAllWarnings } = require('../../guru/db/database');
        const warns = getAllWarnings(ctx.from);
        if (!warns || !warns.length)
            return ctx.reply('✅ No warnings have been issued in this group yet.');

        // Group by JID
        const grouped = {};
        for (const w of warns) {
            grouped[w.jid] = grouped[w.jid] || [];
            grouped[w.jid].push(w.reason || 'No reason given');
        }
        const lines = Object.entries(grouped).map(([jid, reasons]) =>
            `👤 @${jid.split('@')[0]}  ─  *${reasons.length} warn(s)*\n   └ ${reasons.slice(-1)[0]}`
        );
        const limit = getSetting('WARN_LIMIT', '3');
        await ctx.send({
            text: `⚠️ *Warned Users* (Limit: ${limit})\n\n${lines.join('\n\n')}\n\n_${config.BOT_NAME}_`,
            mentions: Object.keys(grouped),
        });
    },
});

addCmd({
    name:      'resetwarns',
    aliases:   ['clearwarns', 'resetwarn'],
    desc:      'Clear all warnings for a user (reply or mention)',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        const target = ctx.quoted?.sender
            || (ctx.m?.mentioned?.[0])
            || (ctx.args[0] ? ctx.args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);
        if (!target) return ctx.reply('❌ Reply to a user\'s message or mention them.\n\nExample: `.resetwarns @user`');
        const { clearWarnings } = require('../../guru/db/database');
        if (clearWarnings) clearWarnings(target, ctx.from);
        await ctx.send({
            text: `✅ *Warnings Cleared*\n\nAll warnings for @${target.split('@')[0]} have been reset.`,
            mentions: [target],
        });
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTISTICKER  — block stickers in groups
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'antisticker',
    aliases:   ['nosticker', 'blocksticker'],
    desc:      'Toggle antisticker — delete stickers sent in group',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        if (!ctx.isBotAdmin) return ctx.reply('❌ I need to be an *admin* to delete messages.');
        const current = getGroupSettings(ctx.from).antisticker;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antisticker', newVal);
        await ctx.reply(
            newVal
                ? '🚫 *Anti-Sticker ON*\n\nStickers sent in this group will be deleted.'
                : '✅ *Anti-Sticker OFF*\n\nSticker protection disabled.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET OWNER NUMBER / NAME  (runtime update)
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'setowner',
    aliases:   ['changeowner'],
    desc:      'Change the bot owner number at runtime',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const num = ctx.args[0]?.replace(/\D/g, '');
        if (!num || num.length < 7) return ctx.reply('❌ Provide a valid number.\n\nExample: `.setowner 254712345678`');
        setSetting('OWNER_NUMBER', num);
        config.OWNER_NUMBER = num;
        await ctx.reply(`✅ *Owner Number Updated*\n\nNew owner: +${num}`);
    },
});

addCmd({
    name:      'setownername',
    aliases:   ['ownername'],
    desc:      'Change the bot owner name at runtime',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const name = ctx.text;
        if (!name) return ctx.reply('❌ Provide a name.\n\nExample: `.setownername GuruTech`');
        setSetting('OWNER_NAME', name);
        config.OWNER_NAME = name;
        await ctx.reply(`✅ *Owner Name Updated*\n\nNew name: *${name}*`);
    },
});


// ═══════════════════════════════════════════════════════════════
//  ANTI-DELETE — FIVE COMMANDS
//  Modes: INCHAT / INDM / OFF
// ═══════════════════════════════════════════════════════════════

const ANTIDELETE_KEY = 'ANTIDELETE';

function getAntiDeleteMode() {
    const value = getSetting(ANTIDELETE_KEY, 'false');
    return String(value).toLowerCase();
}

function setAntiDeleteMode(mode) {
    setSetting(ANTIDELETE_KEY, mode);
    config.ANTIDELETE = mode;
}

// ── 1. ANTIDELETE ON ───────────────────────────────────────────

addCmd({
    name: 'antideleteon',
    aliases: ['adon'],
    desc: 'Enable Anti-Delete in DM mode',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            setAntiDeleteMode('indm');

            await ctx.reply(
                `✅ *ANTI-DELETE ENABLED*\n\n` +
                `📥 Mode: *INDM*\n` +
                `Deleted messages will be sent to the owner's inbox ` +
                `when the deletion listener is connected.\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── 2. ANTIDELETE OFF ──────────────────────────────────────────

addCmd({
    name: 'antideleteoff',
    aliases: ['adoff'],
    desc: 'Disable Anti-Delete',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            setAntiDeleteMode('false');

            await ctx.reply(
                `🔕 *ANTI-DELETE DISABLED*\n\n` +
                `Anti-Delete has been turned off.\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── 3. ANTIDELETE INCHAT ───────────────────────────────────────

addCmd({
    name: 'antideletechat',
    aliases: ['adchat'],
    desc: 'Send deleted-message alerts to the original chat',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            setAntiDeleteMode('inchat');

            await ctx.reply(
                `✅ *ANTI-DELETE INCHAT ENABLED*\n\n` +
                `Deleted-message alerts will go to the original chat ` +
                `when the deletion listener is connected.\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── 4. ANTIDELETE INDM ─────────────────────────────────────────

addCmd({
    name: 'antideletedm',
    aliases: ['addm', 'antideleteinbox'],
    desc: 'Send deleted-message alerts to the owner inbox',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            setAntiDeleteMode('indm');

            await ctx.reply(
                `📥 *ANTI-DELETE INDM ENABLED*\n\n` +
                `Deleted-message alerts are configured to go to the ` +
                `owner's WhatsApp inbox.\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── 5. ANTIDELETE STATUS ───────────────────────────────────────

addCmd({
    name: 'antideletestatus',
    aliases: ['adstatus'],
    desc: 'Check Anti-Delete mode',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const mode = getAntiDeleteMode();
            const enabled = !['false', 'off', '0'].includes(mode);

            await ctx.reply(
                `╭══〘〘 🛡️ *ANTI-DELETE STATUS* 〙〙═⊷\n` +
                `┃\n` +
                `┃ Status: *${enabled ? 'ON ✅' : 'OFF ❌'}*\n` +
                `┃ Mode: *${mode.toUpperCase()}*\n` +
                `┃\n` +
                `╰══⊷ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});
