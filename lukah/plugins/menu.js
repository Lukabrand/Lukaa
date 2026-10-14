'use strict';
// ╔══════════════════════════════════════════════════════════════╗
//  ⚡  LUKA-XMD  —  menu.js  (LUKABRAND EDITION v2)
//  🌍  Rounded menu design with full category listing, licence
//      status, uptime display, RAM usage, and per-category commands.
// ╚══════════════════════════════════════════════════════════════╝

// WhatsApp "read more" expander — collapses long messages safely
const _more     = String.fromCharCode(8206);
const _readmore = _more.repeat(4001);

const { addCmd, addTrigger, getAllCmds } = require('../../luka/handlers/loader');
const { gmdProgress, runtime, fmtBytes } = require('../../luka/utils/gmdFunctions');
const { daysUntil, fmtDate, parseExpiryDate, fmtCountdown, expiryBar, expiryLine } = require('../../luka/utils/expiry');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');
const config = require('../../luka/config/settings');
const moment = require('moment-timezone');
const { sendButtons } = require('../../luka/utils/gmdFunctions2');

const MENU_IMAGE = 'https://i.imgur.com/YbnhBIV.png';

const CATS = [
    { key: 'general',    label: 'GENERAL',     icon: '⚙️',  block: '█' },
    { key: 'ai',         label: 'AI & CHAT',   icon: '🤖',  block: '▓' },
    { key: 'downloader', label: 'DOWNLOADER',  icon: '📥',  block: '▒' },
    { key: 'music',      label: 'MUSIC',       icon: '🎵',  block: '░' },
    { key: 'search',     label: 'SEARCH',      icon: '🔍',  block: '▰' },
    { key: 'tools',      label: 'TOOLS',       icon: '🔧',  block: '▱' },
    { key: 'group',      label: 'GROUP',       icon: '👥',  block: '▌' },
    { key: 'games',      label: 'GAMES',       icon: '🎮',  block: '▐' },
    { key: 'media',      label: 'MEDIA',       icon: '🎬',  block: '◆' },
    { key: 'lifestyle',  label: 'LIFESTYLE',   icon: '🌿',  block: '◇' },
    { key: 'fun',        label: 'FUN',         icon: '😂',  block: '●' },
    { key: 'owner',      label: 'OWNER',       icon: '👑',  block: '◉' },
    { key: 'religion',   label: 'RELIGION',    icon: '🕌',  block: '◈' },
    { key: 'misc',       label: 'MISC',        icon: '📦',  block: '○' },
];

// Clean dividers
const DIV   = '─'.repeat(30);
const DIV_S = '─'.repeat(18);

function now(fmt) { return moment().tz(config.TIME_ZONE || 'Africa/Nairobi').format(fmt); }
function numFromJid(jid) { return (jid || '').split('@')[0].split(':')[0]; }

// ── Pending-menu state (per chat, 3-min TTL) ──────────────────
//   Map<chatJid, { categories: [{ key, label, icon, cmds }], expiresAt }>
const pendingMenus = new Map();
const PENDING_TTL_MS = 3 * 60 * 1000;

function setPending(chatJid, categories) {
    pendingMenus.set(chatJid, { categories, expiresAt: Date.now() + PENDING_TTL_MS });
    setTimeout(() => {
        const e = pendingMenus.get(chatJid);
        if (e && e.expiresAt <= Date.now()) pendingMenus.delete(chatJid);
    }, PENDING_TTL_MS + 500);
}
function getPending(chatJid) {
    const e = pendingMenus.get(chatJid);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { pendingMenus.delete(chatJid); return null; }
    return e;
}

function getExpiryStatus() {
    try {
        const raw = process.env.EXPIRY_DATE;
        if (!raw?.trim()) return { line: '✅ No expiry set', urgent: false };
        const exp  = parseExpiryDate(raw);
        if (!exp)  return { line: '✅ No expiry set', urgent: false };
        const days = daysUntil(exp);
        const ms   = exp.getTime() - Date.now();
        const bar  = expiryBar(days, 30, 14);
        if (ms <= 0) return {
            line: `🔴 *EXPIRED* ${Math.abs(days)}d ago · Contact owner!`,
            urgent: true
        };
        if (days === 1) return {
            line: `🆘 *TODAY!* ${fmtCountdown(ms)} left\n     ${bar}`,
            urgent: true
        };
        if (days <= 3) return {
            line: `🔴 *${days}d left!* ${fmtCountdown(ms)}\n     ${bar} · ${fmtDate(exp)}`,
            urgent: true
        };
        if (days <= 7) return {
            line: `🟠 ${days}d left · ${bar} · ${fmtDate(exp)}`,
            urgent: false
        };
        return {
            line: `🟢 Active · ${days}d remaining · ${fmtDate(exp)}`,
            urgent: false
        };
    } catch { return { line: '✅ No expiry', urgent: false }; }
}

// ═══════════════════════════════════════════════════════════════
//  LUKA-XMD — ROUNDED MAIN MENU
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'menu',
    aliases: ['help', 'commands', 'cmds', 'start', 'ls'],
    desc: 'Show main menu and command categories',
    usage: 'menu | menu <category>',
    category: 'general',

    handler: async (ctx) => {
        const allCmds = getAllCmds();
        const p = config.BOT_PREFIX || '.';
        const arg = ctx.args?.[0]?.toLowerCase();

        const catMatch = CATS.find(
            c => c.key.toLowerCase() === arg ||
                 c.label.toLowerCase() === arg
        );

        if (arg && catMatch) {
            return sendCategoryDetail(ctx, catMatch, allCmds);
        }

        // Time and greeting
        const hour = Number(now('HH'));
        const timeGreet =
            hour < 12 ? '🌅 Good Morning' :
            hour < 17 ? '☀️ Good Afternoon' :
            hour < 21 ? '🌆 Good Evening' :
            '🌙 Good Night';

        const dateTime = now('DD MMM YYYY  •  hh:mm A');
        const uptime = runtime(process.uptime() * 1000);

        // Licence
        const expiry = getExpiryStatus();

        // RAM usage
        const usedMem = process.memoryUsage().rss;
        const totalMem = require('os').totalmem();
        const ramPercent = Math.min(
            100,
            Math.round((usedMem / totalMem) * 100)
        );

        const filled = Math.round(ramPercent / 10);
        const ramBar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

        // Categories with commands
        const grouped = {};

        for (const cmd of allCmds) {
            const cat = String(cmd.category || 'misc').toLowerCase();

            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(cmd);
        }

        const numbered = CATS.filter(
            cat => (grouped[cat.key] || []).length > 0
        );

        const displayName = ctx.pushName || 'User';
        const botName = config.BOT_NAME || 'LUKA-XMD';
        const mode = String(config.MODE || 'public').toUpperCase();
        const version = config.BOT_VERSION || '5.0.0';

        // Build menu message
        let menu = '';

        menu += `╭══〘〘 *${botName}* 〙〙═⊷\n`;
        menu += `┃\n`;
        menu += `┃ 👋 ${timeGreet}, *${displayName}*\n`;
        menu += `┃ 📅 ${dateTime}\n`;
        menu += `┃\n`;
        menu += `┃ 🟢 Status   : *ONLINE*\n`;
        menu += `┃ 📦 Plugins  : *${allCmds.length}*\n`;
        menu += `┃ ⚡ Prefix   : *${p}*\n`;
        menu += `┃ 🌐 Mode     : *${mode}*\n`;
        menu += `┃ 📱 Version  : *v${version.replace(/^v/i, '')}*\n`;
        menu += `┃ ⏱ Uptime   : *${uptime}*\n`;
        menu += `┃ 🔒 Licence  : ${expiry.line}\n`;
        menu += `┃\n`;
        menu += `┃ ╭─「 📋 CATEGORIES 」\n`;

        numbered.forEach((cat, i) => {
            const num = String(i + 1).padStart(2, '0');
            menu += `┃ ${num}  ${cat.label.toUpperCase()}\n`;
        });

        menu += `┃ ╰───────────────\n`;
        menu += `┃\n`;
        menu += `╰═════════════════⊷\n`;
        menu += `     ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

        // Save category list for number replies
        setPending(ctx.from, numbered);

        // Send the menu
        try {
            await ctx.sock.sendMessage(
                ctx.from,
                {
                    image: { url: MENU_IMAGE },
                    caption: menu,
                    mentions: [ctx.sender],
                    contextInfo: channelCtx()
                },
                { quoted: ctx.m }
            );
        } catch (error) {
            await ctx.reply(menu);
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// PING — BOT SPEED
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'ping',
    aliases: ['speed', 'latency', 'test', 'pi', 'p'],
    desc: 'Check bot response speed',
    category: 'general',

    handler: async (ctx) => {
        const startTime = process.hrtime();

        // Simulate a short delay like the original ping implementation
        await new Promise(resolve =>
            setTimeout(resolve, Math.floor(80 + Math.random() * 420))
        );

        const elapsed = process.hrtime(startTime);

        const responseTime = Math.floor(
            elapsed[0] * 1000 + elapsed[1] / 1000000
        );

        try {
            await sendButtons(ctx.sock, ctx.from, {
                title: 'Bot Speed',
                text: `⚡ Pong: ${responseTime}ms`,
                footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ*`,

                buttons: [
                    {
                        id: `${config.BOT_PREFIX || '.'}runtime`,
                        text: '⏱️ Uptime'
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'WaChannel',
                            url: config.CHANNEL_URL || 'https://whatsapp.com/'
                        })
                    }
                ]
            }, { quoted: ctx.m });

        } catch (error) {
            console.error('[PING ERROR]', error);

            await ctx.sock.sendMessage(
                ctx.from,
                {
                    text:
                        `*Bot Speed*\n\n` +
                        `⚡ Pong: ${responseTime}ms\n\n` +
                        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ*`,
                    contextInfo: channelCtx()
                },
                { quoted: ctx.m }
            );
        }
    }
});

// ═══════════════════════════════════════════════════════════════
//  INFO
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'info',
    aliases: ['botinfo', 'about'],
    desc: 'Show detailed bot information',
    category: 'general',
    handler: async (ctx) => {
        const mem    = process.memoryUsage();
        const uptime = runtime(process.uptime() * 1000);
        const memPct = Math.round((mem.heapUsed / mem.heapTotal) * 10);
        const bar    = gmdProgress(memPct, 10, '');

        await ctx.sock.sendMessage(
            ctx.from,
            {
                text:
                    `*🐾 BOT INFO*\n${config.BOT_NAME}\n\n` +
                    `🤖 *Name:*     ${config.BOT_NAME}\n` +
                    `📦 *Version:*  v${config.BOT_VERSION || '2.0.0'}\n` +
                    `👑 *Owner:*    ${config.OWNER_NAME}\n` +
                    `📞 *Contact:*  +${config.OWNER_NUMBER}\n\n` +
                    `⚙️ *Prefix:*   ${config.BOT_PREFIX}\n` +
                    `🌍 *Mode:*     ${config.MODE}\n` +
                    `⏱️ *Uptime:*   ${uptime}\n` +
                    `💾 *RAM:*      ${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}\n` +
                    `${bar}\n\n` +
                    `📅 *Date:*     ${now('DD MMM YYYY')}\n` +
                    `🕐 *Time:*     ${now('hh:mm A')}\n\n` +
                    `*🔒 LICENCE*\n${expiryLine()}\n\n` +
                    `◈ ${config.CHANNEL_NAME}`,
                contextInfo: channelCtx(),
            },
            { quoted: ctx.m }
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  ALIVE
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'alive',
    aliases: ['status', 'online', 'active', 'wake'],
    desc: 'Confirm the bot is running',
    category: 'general',
    handler: async (ctx) => {
        const mem     = process.memoryUsage();
        const uptime  = runtime(process.uptime() * 1000);
        const memPct  = Math.round((mem.heapUsed / mem.heapTotal) * 10);
        const bar     = gmdProgress(memPct, 10, '');
        const userNum = numFromJid(ctx.sender);
        const expiry  = getExpiryStatus();

        const caption =
            `*🐾 LUKA-XMD*\n` +
            `${'═'.repeat(30)}\n` +
            `*Wakanda Forever!* ✊🏿\n` +
            `${'═'.repeat(30)}\n\n` +
            `Hey *@${userNum}*, I'm ALIVE! ⚡\n\n` +
            `✅ *Status:*  Online & Active\n` +
            `⏱️ *Uptime:*  ${uptime}\n` +
            `📅 *Date:*    ${now('DD MMM YYYY')}\n` +
            `🕐 *Time:*    ${now('hh:mm:ss A')}\n` +
            `💾 *RAM:*     ${fmtBytes(mem.heapUsed)}\n` +
            `${bar}\n\n` +
            `*🔒 Licence:*\n${expiry.line}\n\n` +
            `👑 *Owner:*   ${config.OWNER_NAME}\n` +
            `⚙️ *Prefix:*  ${config.BOT_PREFIX}\n` +
            `🌍 *Mode:*    ${config.MODE}\n\n` +
            `◈ ${config.CHANNEL_NAME}`;

        try {
            await ctx.sock.sendMessage(
                ctx.from,
                {
                    image:    { url: MENU_IMAGE },
                    caption,
                    mentions: [ctx.sender],
                    contextInfo: channelCtx(),
                },
                { quoted: ctx.m }
            );
        } catch {
            await ctx.sock.sendMessage(
                ctx.from,
                {
                    text:     caption,
                    mentions: [ctx.sender],
                    contextInfo: channelCtx(),
                },
                { quoted: ctx.m }
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  RUNTIME / SYSINFO
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'runtime',
    aliases: ['uptime', 'stats', 'sysinfo', 'system'],
    desc: 'Show bot uptime and system stats',
    category: 'general',
    handler: async (ctx) => {
        const mem     = process.memoryUsage();
        const uptime  = runtime(process.uptime() * 1000);
        const memPct  = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        const filled  = Math.round((memPct / 100) * 20);
        const bar     = '█'.repeat(filled) + '░'.repeat(20 - filled);
        const allCmds = getAllCmds();

        await ctx.sock.sendMessage(
            ctx.from,
            {
                text:
                    `*💻 SYSTEM STATS*\n${config.BOT_NAME}\n\n` +
                    `✅ *Status:*    Online & Active\n` +
                    `⏱️ *Uptime:*    ${uptime}\n` +
                    `📦 *Commands:*  ${allCmds.length} loaded\n\n` +
                    `💾 *RAM Used:*  ${fmtBytes(mem.heapUsed)}\n` +
                    `🖥️ *RAM Total:* ${fmtBytes(mem.heapTotal)}\n` +
                    `📊 *RAM %:*     ${memPct}%\n` +
                    `[${bar}]\n\n` +
                    `🖥️ *Platform:* ${process.platform}\n` +
                    `⚙️ *Node.js:*  ${process.version}\n` +
                    `📅 *Date:*     ${now('DD MMM YYYY')}\n` +
                    `🕐 *Time:*     ${now('hh:mm:ss A')}\n\n` +
                    `*🔒 Licence:*\n${expiryLine()}\n\n` +
                    `◈ ${config.CHANNEL_NAME}`,
                contextInfo: channelCtx(),
            },
            { quoted: ctx.m }
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  MY INFO
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'myinfo',
    aliases: ['whoami', 'me', 'profile'],
    desc: 'Show your personal info card',
    category: 'general',
    handler: async (ctx) => {
        const number = numFromJid(ctx.sender);
        let ppUrl = null;
        try { ppUrl = await ctx.sock.profilePictureUrl(ctx.sender, 'image'); } catch {}

        const role = ctx.isOwner ? '👑 Bot Owner' : ctx.isAdmin ? '🛡️ Group Admin' : '👤 Member';
        const msg =
            `*🪪 YOUR PROFILE*\n${config.BOT_NAME}\n\n` +
            `📛 *Name:*    ${ctx.pushName || 'Unknown'}\n` +
            `📞 *Number:*  +${number}\n` +
            `🆔 *JID:*     \`${ctx.sender}\`\n` +
            `🎭 *Role:*    ${role}\n` +
            `💬 *Group:*   ${ctx.isGroup ? (ctx.groupName || 'Yes') : 'Private Chat'}\n` +
            `🖼️ *Photo:*   ${ppUrl ? '✅ Has profile pic' : '❌ No profile pic'}\n` +
            `🕐 *Time:*    ${now('hh:mm A')}\n\n` +
            `◈ ${config.CHANNEL_NAME}`;

        if (ppUrl) {
            await ctx.sock.sendMessage(ctx.from, { image: { url: ppUrl }, caption: msg, contextInfo: channelCtx() }, { quoted: ctx.m });
        } else {
            await ctx.sock.sendMessage(ctx.from, { text: msg, contextInfo: channelCtx() }, { quoted: ctx.m });
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  EXPIRY STATUS COMMAND
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'expiry',
    aliases: ['licence', 'license', 'validity', 'expire'],
    desc: 'Check bot licence expiry in detail',
    category: 'general',
    handler: async (ctx) => {
        try {
            const raw = process.env.EXPIRY_DATE;
            if (!raw?.trim()) return ctx.reply(`*🔒 LICENCE STATUS*\n${config.BOT_NAME}\n\n✅ *No expiry configured.*\nThis bot runs indefinitely.\n\n◈ ${config.CHANNEL_NAME}`);
            const exp    = parseExpiryDate(raw);
            if (!exp) return ctx.reply('✅ No expiry date set.');
            const days   = daysUntil(exp);
            const ms     = exp.getTime() - Date.now();
            const bar    = expiryBar(days, 30);
            const countdown = ms > 0 ? fmtCountdown(ms) : 'EXPIRED';

            const urgency = ms <= 0 ? '🔴 EXPIRED'
                          : days <= 1 ? '🆘 EXPIRES TODAY'
                          : days <= 3 ? '🔴 CRITICAL'
                          : days <= 7 ? '🟠 WARNING'
                          : days <= 14 ? '🟡 NOTICE'
                          : '🟢 ACTIVE';

            const text =
                `*🔒 LICENCE STATUS*\n${config.BOT_NAME}\n` +
                `${'═'.repeat(32)}\n\n` +
                `📊 *Status:*     ${urgency}\n` +
                `📅 *Expiry Date:* ${fmtDate(exp)}\n` +
                `⏳ *Countdown:*  ${countdown}\n` +
                `📆 *Days Left:*  ${days > 0 ? days : 'EXPIRED'}\n\n` +
                `${bar}\n\n` +
                (ms <= 0
                    ? `🔴 This bot has expired!\n📞 Contact: wa.me/254105521300\n`
                    : days <= 7
                        ? `⚠️ Renew before expiry!\n📞 Contact: wa.me/254105521300\n`
                        : `✅ Licence is valid.\n`) +
                `\n◈ ${config.CHANNEL_NAME}`;

            await ctx.sock.sendMessage(ctx.from, { text, contextInfo: channelCtx() }, { quoted: ctx.m });
        } catch { await ctx.reply('❌ Error reading expiry status.'); }
    },
});

// ═══════════════════════════════════════════════════════════════
//  CATEGORY DETAIL HELPER + NUMERIC REPLY TRIGGER
// ═══════════════════════════════════════════════════════════════
async function sendCategoryDetail(ctx, cat, allCmds) {
    const p    = config.BOT_PREFIX;
    const cmds = (cat.cmds && cat.cmds.length)
        ? cat.cmds
        : allCmds.filter(c => c.category === cat.key);
    if (!cmds.length) return ctx.reply(`No commands in *${cat.label}* yet.`);

    let out = '';
    out += `${cat.icon}  *${cat.label}*\n`;
    out += `_${config.BOT_NAME}_\n`;
    out += `${DIV}\n\n`;
    cmds.forEach(c => {
        out += `• *${p}${c.name}*\n`;
        if (c.desc)  out += `   _${c.desc}_\n`;
        if (c.usage) out += `   ↳ \`${p}${c.usage}\`\n`;
        out += `\n`;
    });
    out += `${DIV}\n`;
    out += `◈ ${config.CHANNEL_NAME}`;

    return sendButtons(ctx.sock, ctx.from, {
        title:  `${cat.icon} ${cat.label}`,
        text:   out,
        footer: config.BOT_NAME,
        image:  { url: MENU_IMAGE },
        buttons: [
            { id: `${p}menu`,     text: '🏠 Back to Menu' },
            { id: `${p}fullcmds`, text: '📋 Full Commands List' },
        ],
    }, { quoted: ctx.m }).catch(async () => {
        try {
            return await ctx.sock.sendMessage(
                ctx.from,
                { image: { url: MENU_IMAGE }, caption: out, contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        } catch {
            return ctx.sock.sendMessage(
                ctx.from,
                { text: out, contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }
    });
}

// ═══════════════════════════════════════════════════════════════
//  FULL COMMANDS LIST
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'fullcmds',
    aliases: ['allcmds', 'cmdlist', 'commands'],
    desc: 'Show every command with description and usage, grouped by category',
    usage: 'fullcmds  |  fullcmds <category>',
    category: 'general',
    handler: async (ctx) => {
        const allCmds = getAllCmds();
        const p       = config.BOT_PREFIX;
        const arg     = ctx.args[0]?.toLowerCase();

        // ── Single-category mode ─────────────────────────────
        if (arg) {
            const cat = CATS.find(c => c.key === arg || c.label.toLowerCase() === arg);
            if (!cat) return ctx.reply(`❌ Unknown category: *${arg}*\n\nValid: ${CATS.map(c => c.key).join(', ')}`);
            const cmds = allCmds.filter(c => (c.category || 'misc') === cat.key);
            if (!cmds.length) return ctx.reply(`No commands found in *${cat.label}*.`);

            let out = '';
            out += `${cat.icon} *${cat.label} COMMANDS*\n`;
            out += `_${config.BOT_NAME}_\n`;
            out += `${'─'.repeat(30)}\n`;
            out += `_${cmds.length} command${cmds.length !== 1 ? 's' : ''} in this category_\n`;
            out += _readmore + '\n\n';

            cmds.forEach((c, i) => {
                out += `*${i + 1}.* \`${p}${c.name}\``;
                if (c.aliases?.length) out += `  _(also: ${c.aliases.slice(0, 3).join(', ')})_`;
                out += '\n';
                if (c.desc)  out += `   ↳ ${c.desc}\n`;
                if (c.usage) out += `   📌 \`${p}${c.usage}\`\n`;
                out += '\n';
            });

            out += `${'─'.repeat(30)}\n`;
            out += `💡 _${p}fullcmds for all categories_\n`;
            out += `◈ ${config.CHANNEL_NAME}`;

            await sendButtons(ctx.sock, ctx.from, {
                title:  `${cat.icon} ${cat.label} — ${cmds.length} cmds`,
                text:   out,
                footer: config.BOT_NAME,
                image:  { url: MENU_IMAGE },
                buttons: [
                    { id: `${p}menu`,     text: '🏠 Main Menu' },
                    { id: `${p}fullcmds`, text: '📋 All Categories' },
                ],
            }, { quoted: ctx.m }).catch(async () => {
                try {
                    await ctx.sock.sendMessage(ctx.from,
                        { image: { url: MENU_IMAGE }, caption: out, contextInfo: channelCtx() },
                        { quoted: ctx.m });
                } catch {
                    await ctx.sock.sendMessage(ctx.from,
                        { text: out, contextInfo: channelCtx() },
                        { quoted: ctx.m });
                }
            });
            return;
        }

        // ── All-categories mode ──────────────────────────────
        const grouped = {};
        for (const cmd of allCmds) {
            const cat = cmd.category || 'misc';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(cmd);
        }

        const uptime = runtime(process.uptime() * 1000);
        let total = 0;

        // Header (always visible before "read more")
        let header = '';
        header += `꧁ *${config.BOT_NAME}* ꧂\n`;
        header += `📋 *FULL COMMANDS LIST*\n`;
        header += `${'═'.repeat(30)}\n`;
        header += `⏱️ Uptime: ${uptime}  •  Prefix: ${p}\n`;
        header += `${'─'.repeat(30)}`;

        // Body (collapsed behind "read more")
        let body = '\n\n';
        for (const cat of CATS) {
            const cmds = grouped[cat.key];
            if (!cmds?.length) continue;
            body += `┌─ ${cat.icon} *${cat.label}* (${cmds.length})\n`;
            cmds.forEach((c, i) => {
                const isLast = i === cmds.length - 1;
                const prefix = isLast ? '└' : '├';
                body += `${prefix}◈ \`${p}${c.name}\``;
                if (c.aliases?.length) body += ` _(${c.aliases.slice(0, 2).join('/')})_`;
                body += '\n';
                if (c.desc)  body += `${isLast ? '   ' : '│  '} ↳ _${c.desc}_\n`;
                if (c.usage) body += `${isLast ? '   ' : '│  '} 📌 \`${p}${c.usage}\`\n`;
                total++;
            });
            body += '\n';
        }

        body += `${'─'.repeat(30)}\n`;
        body += `📦 *Total:* ${total} commands loaded\n`;
        body += `💡 _Use \`${p}fullcmds <category>\` for details_\n`;
        body += `💡 _Use \`${p}menu <category>\` for commands-only view_\n`;
        body += `◈ ${config.CHANNEL_NAME}`;

        const out = header + _readmore + body;

        await sendButtons(ctx.sock, ctx.from, {
            title:  `📋 ${config.BOT_NAME} — ${total} Commands`,
            text:   out,
            footer: config.BOT_NAME,
            image:  { url: MENU_IMAGE },
            buttons: [
                { id: `${p}menu`, text: '🏠 Back to Menu' },
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '📂 Jump to Category',
                        sections: [{
                            title: '📋 Categories',
                            rows: CATS
                                .filter(c => grouped[c.key]?.length)
                                .map(c => ({
                                    id:          `${p}fullcmds ${c.key}`,
                                    title:       `${c.icon} ${c.label}`,
                                    description: `${grouped[c.key].length} command${grouped[c.key].length !== 1 ? 's' : ''}`,
                                })),
                        }],
                    }),
                },
            ],
        }, { quoted: ctx.m }).catch(async () => {
            try {
                await ctx.sock.sendMessage(ctx.from,
                    { image: { url: MENU_IMAGE }, caption: out, contextInfo: channelCtx() },
                    { quoted: ctx.m });
            } catch {
                await ctx.sock.sendMessage(ctx.from,
                    { text: out, contextInfo: channelCtx() },
                    { quoted: ctx.m });
            }
        });
    },
});

// Trigger: pure-number reply within 3 min of receiving the menu
addTrigger({
    pattern: /^\s*(\d{1,2})\s*$/,
    handler: async (ctx) => {
        const pending = getPending(ctx.from);
        if (!pending) return;
        const idx = parseInt(ctx.body.trim(), 10) - 1;
        if (idx < 0 || idx >= pending.categories.length) {
            return ctx.reply(`❌ Invalid number. Pick *1–${pending.categories.length}*.`);
        }
        const cat = pending.categories[idx];
        return sendCategoryDetail(ctx, cat, getAllCmds());
    },
});
