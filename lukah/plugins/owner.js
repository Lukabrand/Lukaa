'use strict';
const { addCmd }                          = require('../../luka/handlers/loader');
const { getStatusReport }                 = require('../../luka/utils/statusEngine');
const { addSudo, removeSudo, getSudoList, isSudo, setSetting, getSetting } = require('../../luka/db/database');
const { numberToJid, cleanJid }           = require('../../luka/utils/helpers');
const config                              = require('../../luka/config/settings');
const { channelCtx, sendButtons }         = require('../../luka/utils/gmdFunctions2');
const { execSync }                        = require('child_process');
const fs                                  = require('fs');
const path                                = require('path');
const https                               = require('https');

// ── GitHub API helper (no git CLI needed) ──────────────────────
const GH_REPO   = 'Lukabrand/LUKA-XMD';
const GH_BRANCH = 'main';
const SHA_FILE  = path.join(process.cwd(), '.local', 'last_sha.txt');

function ghRequest(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
        const opts = {
            hostname: 'api.github.com',
            path:     apiPath,
            method,
            headers:  {
                'Authorization': token ? `token ${token}` : '',
                'Accept':        'application/vnd.github.v3+json',
                'User-Agent':    'LUKA-XMD-Bot',
                'Content-Type':  'application/json',
            },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        });
        req.on('error', reject);
        // 30-second timeout so it never hangs forever
        req.setTimeout(30000, () => { req.destroy(new Error('GitHub API request timed out')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Read the local git HEAD SHA so we know exactly what's installed
function getLocalGitSha() {
    try {
        return execSync('git rev-parse HEAD', {
            cwd: process.cwd(), encoding: 'utf8', timeout: 5000,
        }).trim();
    } catch { return null; }
}

function readStoredSha() {
    try {
        const stored = fs.readFileSync(SHA_FILE, 'utf8').trim();
        if (stored) return stored;
    } catch { /* file missing */ }
    // Seed from the actual local git HEAD on first run
    const gitSha = getLocalGitSha();
    if (gitSha) {
        storesha(gitSha);
        return gitSha;
    }
    return null;
}

function storesha(sha) {
    fs.mkdirSync(path.dirname(SHA_FILE), { recursive: true });
    fs.writeFileSync(SHA_FILE, sha, 'utf8');
}

const REPO_IMAGE = 'https://i.imgur.com/YbnhBIV.png';

// ── Sudo management ────────────────────────────────────────────
addCmd({
    name: 'addsudo',
    aliases: ['setsudo'],
    desc: 'Add a sudo user',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const target = ctx.args[0]
            ? numberToJid(ctx.args[0])
            : ctx.quoted
                ? cleanJid(ctx.m.message?.extendedTextMessage?.contextInfo?.participant || '')
                : null;

        if (!target) return ctx.sock.sendMessage(ctx.from, { text: '❌ Tag a user or provide their number.\n\nExample: `.addsudo 254712345678`', contextInfo: channelCtx() }, { quoted: ctx.m });
        if (isSudo(target)) return ctx.sock.sendMessage(ctx.from, { text: '⚠️ That user is already a sudo user.', contextInfo: channelCtx() }, { quoted: ctx.m });

        addSudo(target);
        await ctx.reply(`✅ *@${target.split('@')[0]}* has been added as a sudo user.`, { mentions: [target] });
    },
});

addCmd({
    name: 'delsudo',
    aliases: ['removesudo'],
    desc: 'Remove a sudo user',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const target = ctx.args[0]
            ? numberToJid(ctx.args[0])
            : ctx.quoted
                ? cleanJid(ctx.m.message?.extendedTextMessage?.contextInfo?.participant || '')
                : null;

        if (!target) return ctx.sock.sendMessage(ctx.from, { text: '❌ Tag a user or provide their number.', contextInfo: channelCtx() }, { quoted: ctx.m });
        if (!isSudo(target)) return ctx.sock.sendMessage(ctx.from, { text: '⚠️ That user is not a sudo user.', contextInfo: channelCtx() }, { quoted: ctx.m });

        removeSudo(target);
        await ctx.reply(`✅ *@${target.split('@')[0]}* has been removed from sudo users.`, { mentions: [target] });
    },
});

addCmd({
    name: 'sudolist',
    aliases: ['listsudo'],
    desc: 'List all sudo users',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const list = getSudoList();
        if (!list.length) return ctx.sock.sendMessage(ctx.from, { text: '📭 No sudo users have been added yet.', contextInfo: channelCtx() }, { quoted: ctx.m });
        const text = `👑 *Sudo Users* (${list.length})\n\n` +
            list.map((j, i) => `${i + 1}. @${j.split('@')[0]}`).join('\n') +
            `\n\n_${config.BOT_NAME}_`;
        await ctx.send({ text, mentions: list });
    },
});

// ── Bot settings ───────────────────────────────────────────────
addCmd({
    name: 'setmode',
    desc: 'Set bot mode (public/private/groups/dm)',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const mode = ctx.args[0]?.toLowerCase();
        const valid = ['public', 'private', 'groups', 'dm'];
        if (!mode || !valid.includes(mode))
            return ctx.reply(`❌ Invalid mode.\n\nValid modes: ${valid.join(', ')}\n\nExample: \`.setmode public\``);

        setSetting('MODE', mode);
        config.MODE = mode;
        await ctx.sock.sendMessage(ctx.from, { text: `✅ Bot mode set to *${mode}*`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

addCmd({
    name: 'setprefix',
    desc: 'Change the bot command prefix',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const prefix = ctx.args[0];
        if (!prefix) return ctx.sock.sendMessage(ctx.from, { text: '❌ Provide a new prefix.\n\nExample: `.setprefix !`', contextInfo: channelCtx() }, { quoted: ctx.m });
        setSetting('BOT_PREFIX', prefix);
        config.BOT_PREFIX = prefix;
        await ctx.sock.sendMessage(ctx.from, { text: `✅ Prefix changed to *${prefix}*`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

addCmd({
    name: 'setname',
    desc: 'Change the bot name',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const name = ctx.text;
        if (!name) return ctx.sock.sendMessage(ctx.from, { text: '❌ Provide a new bot name.', contextInfo: channelCtx() }, { quoted: ctx.m });
        setSetting('BOT_NAME', name);
        config.BOT_NAME = name;
        await ctx.sock.sendMessage(ctx.from, { text: `✅ Bot name updated to *${name}*`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

// ── Broadcast ──────────────────────────────────────────────────
addCmd({
    name: 'broadcast',
    aliases: ['bc'],
    desc: 'Broadcast a message to all groups',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        if (!ctx.text) return ctx.sock.sendMessage(ctx.from, { text: '❌ Provide a message to broadcast.', contextInfo: channelCtx() }, { quoted: ctx.m });
        const groups = await ctx.sock.groupFetchAllParticipating().catch(() => ({}));
        const ids    = Object.keys(groups);
        if (!ids.length) return ctx.sock.sendMessage(ctx.from, { text: '⚠️ No groups found.', contextInfo: channelCtx() }, { quoted: ctx.m });

        await ctx.sock.sendMessage(ctx.from, { text: `📡 Broadcasting to *${ids.length}* groups...`, contextInfo: channelCtx() }, { quoted: ctx.m });
        let sent = 0;
        for (const id of ids) {
            await ctx.sock.sendMessage(id, {
                text: `📢 *Broadcast from ${config.OWNER_NAME}*\n\n${ctx.text}\n\n_— ${config.BOT_NAME}_`,
            }).catch(() => {});
            sent++;
            await new Promise(r => setTimeout(r, 500));
        }
        await ctx.sock.sendMessage(ctx.from, { text: `✅ Broadcast sent to *${sent}* groups.`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

// ── Restart / shutdown ─────────────────────────────────────────
addCmd({
    name: 'restart',
    desc: 'Restart the bot',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        await ctx.reply('♻️ Restarting *' + config.BOT_NAME + '*...');
        setTimeout(() => process.exit(0), 2000);
    },
});

addCmd({
    name: 'shutdown',
    aliases: ['stop'],
    desc: 'Shut down the bot',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        await ctx.sock.sendMessage(ctx.from, { text: `🛑 *${config.BOT_NAME}* is shutting down. Goodbye!`, contextInfo: channelCtx() }, { quoted: ctx.m });
        setTimeout(() => process.exit(1), 2000);
    },
});

// ── Status Engine Report ───────────────────────────────────────
addCmd({
    name: 'statusreport',
    aliases: ['statusstats', 'viewstatus'],
    desc: 'Show auto-status engine statistics',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        await ctx.reply(getStatusReport());
    },
});

// ── Auto Update (GitHub API — no git CLI required) ─────────────
addCmd({
    name: 'update',
    aliases: ['upgrade', 'checkupdate'],
    desc: 'Check for and apply updates from GitHub via API',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        await ctx.react('🔄');

        const sep = `✦ ───────────── ✦`;

        // ── Step 1: Fetch latest commit from GitHub API ────────
        await ctx.sock.sendMessage(ctx.from, {
            text: `🔍 *Checking for updates...*\n\n⏳ _Contacting GitHub API…_`,
            contextInfo: channelCtx(),
        }, { quoted: ctx.m });

        let latestCommit;
        try {
            const refData = await ghRequest('GET', `/repos/${GH_REPO}/git/ref/heads/${GH_BRANCH}`);
            if (!refData?.object?.sha) throw new Error(JSON.stringify(refData).slice(0, 200));
            const commitData = await ghRequest('GET', `/repos/${GH_REPO}/git/commits/${refData.object.sha}`);
            latestCommit = {
                sha:     refData.object.sha,
                shortSha: refData.object.sha.slice(0, 7),
                message: commitData?.message?.split('\n')[0] || '—',
                author:  commitData?.author?.name || 'unknown',
                date:    commitData?.author?.date
                    ? new Date(commitData.author.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
                    : '—',
            };
        } catch (err) {
            await ctx.react('❌');
            return ctx.sock.sendMessage(ctx.from, {
                text:
                    `❌ *Could not reach GitHub*\n\n` +
                    `${sep}\n\n` +
                    `_${err.message.slice(0, 200)}_\n\n` +
                    `_Check your internet connection or try again._`,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m });
        }

        // ── Step 2: Compare with stored SHA ───────────────────
        const storedSha = readStoredSha();

        if (storedSha === latestCommit.sha) {
            await ctx.react('✅');
            return ctx.sock.sendMessage(ctx.from, {
                text:
                    `✅ *${config.BOT_NAME} is up to date!*\n\n` +
                    `${sep}\n\n` +
                    `📌 *Version :* \`${latestCommit.shortSha}\`\n` +
                    `🌿 *Branch  :* ${GH_BRANCH}\n` +
                    `👤 *Author  :* ${latestCommit.author}\n` +
                    `📅 *Date    :* ${latestCommit.date}\n\n` +
                    `_No new updates available._`,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m });
        }

        // ── Step 3: Fetch list of changed files ────────────────
        let changedFiles = [];
        let commitLog = [];
        try {
            if (storedSha) {
                // Incremental update — only files changed since last known SHA
                const compare = await ghRequest('GET',
                    `/repos/${GH_REPO}/compare/${storedSha}...${latestCommit.sha}`);

                if (compare?.message && compare.message.includes('Not Found')) {
                    // storedSha no longer exists on remote — fall back to full tree
                    throw new Error('storedSha not found on remote');
                }

                changedFiles = (compare?.files || []).map(f => ({
                    path:   f.filename,
                    status: f.status,
                }));
                commitLog = (compare?.commits || [])
                    .slice(-10)
                    .reverse()
                    .map(c => `  • ${c.commit?.message?.split('\n')[0]?.slice(0, 60) || '—'}`)
                    .join('\n');
            } else {
                throw new Error('no stored SHA — performing full update');
            }
        } catch {
            // Full update: fetch every file in the latest commit tree
            try {
                const treeData = await ghRequest('GET',
                    `/repos/${GH_REPO}/git/trees/${latestCommit.sha}?recursive=1`);
                changedFiles = (treeData?.tree || [])
                    .filter(f => f.type === 'blob')
                    .map(f => ({ path: f.path, status: 'modified' }));
                commitLog = '';
            } catch { /* non-critical */ }
        }

        const totalFiles   = changedFiles.length;
        const pkgChanged   = changedFiles.some(f => f.path === 'package.json');
        const toUpdate     = changedFiles.filter(f => f.status !== 'removed');
        const toRemove     = changedFiles.filter(f => f.status === 'removed');

        await ctx.sock.sendMessage(ctx.from, {
            text:
                `🆕 *Update Available!*\n\n` +
                `${sep}\n\n` +
                `📦 *Latest:* \`${latestCommit.shortSha}\`\n` +
                `📅 *Date  :* ${latestCommit.date}\n` +
                `👤 *By    :* ${latestCommit.author}\n\n` +
                (commitLog ? `📝 *Recent changes:*\n${commitLog}\n\n` : '') +
                `${sep}\n\n` +
                `📁 *${totalFiles} file${totalFiles !== 1 ? 's' : ''} changed* — downloading…`,
            contextInfo: channelCtx(),
        }, { quoted: ctx.m });

        // ── Step 4: Download & write changed files ─────────────
        let written = 0, failed = 0;
        for (const file of toUpdate) {
            try {
                const raw = await ghRequest('GET',
                    `/repos/${GH_REPO}/contents/${file.path}?ref=${latestCommit.sha}`);
                if (!raw?.content) continue;
                const content = Buffer.from(raw.content, 'base64');
                const dest    = path.join(process.cwd(), file.path);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, content);
                written++;
            } catch { failed++; }
        }

        for (const file of toRemove) {
            try {
                const dest = path.join(process.cwd(), file.path);
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
            } catch { /* best-effort */ }
        }

        // ── Step 5: Reinstall deps if package.json changed ────
        if (pkgChanged) {
            await ctx.sock.sendMessage(ctx.from, {
                text: `📦 *package.json changed — reinstalling dependencies…*`,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m });
            try {
                execSync('npm install --legacy-peer-deps', {
                    cwd: process.cwd(), encoding: 'utf8', timeout: 120000,
                });
            } catch (err) {
                await ctx.sock.sendMessage(ctx.from, {
                    text: `⚠️ Dependency install had issues — continuing:\n_${err.message.slice(0, 200)}_`,
                    contextInfo: channelCtx(),
                }, { quoted: ctx.m });
            }
        }

        // ── Step 6: Save new SHA and restart ──────────────────
        storesha(latestCommit.sha);

        await ctx.sock.sendMessage(ctx.from, {
            text:
                `✅ *Update Applied!*\n\n` +
                `${sep}\n\n` +
                `📌 *New version :* \`${latestCommit.shortSha}\`\n` +
                `📁 *Files written:* ${written}${failed ? `  ⚠️ ${failed} failed` : ''}\n` +
                `🔁 *Deps updated :* ${pkgChanged ? 'Yes ✅' : 'No'}\n\n` +
                `♻️ *Restarting ${config.BOT_NAME}…*`,
            contextInfo: channelCtx(),
        }, { quoted: ctx.m });

        await ctx.react('✅');
        setTimeout(() => process.exit(0), 2500);
    },
});

// ── Repo ───────────────────────────────────────────────────────
addCmd({
    name: 'repo',
    aliases: ['github', 'source', 'sourcecode'],
    desc: 'Show the bot GitHub repository link',
    category: 'owner',
    handler: async (ctx) => {
        const sep = `✦ ───────────── ✦`;
        const card =
            `🐾 *${config.BOT_NAME}* 🐾\n` +
            `✦ *Open-Source WhatsApp Bot* ✦\n` +
            `_Lukabrand  ·  Built with ❤️_\n\n` +
            `${sep}\n\n` +
            `🌿 *Branch*   ·  main\n` +
            `⚡ *Engine*   ·  Node.js + Baileys v7\n` +
            `🗄️ *Storage*  ·  SQLite\n` +
            `🔒 *License*  ·  Open-Source\n\n` +
            `${sep}\n\n` +
            `✨ *FEATURES*\n\n` +
            `🤖  200+ Commands & growing\n` +
            `🛡️  Full group protection suite\n` +
            `🎵  Music · Downloads · AI Chat\n` +
            `🔄  Auto-Bio · Auto-Status · React\n` +
            `👑  Owner-only admin controls\n` +
            `🎭  Sticker maker & media tools\n\n` +
            `${sep}\n\n` +
            `👨‍💻 *DEVELOPER*\n\n` +
            `🏷️  *${config.OWNER_NAME}*\n` +
            `📞  +${config.OWNER_NUMBER}\n\n` +
            `${sep}\n\n` +
            `⭐ *Star it · Fork it · Build yours!*\n` +
            `_Tap a button below to get started_`;

        await sendButtons(ctx.sock, ctx.from, {
            title:  `🐾 ${config.BOT_NAME} — Source Code`,
            text:   card,
            footer: `© Lukabrand • ${config.BOT_NAME}`,
            image:  { url: REPO_IMAGE },
            buttons: [
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '🌐 View on GitHub',
                        url: 'https://github.com/Lukabrand/LUKA-XMD',
                        merchant_url: 'https://github.com/Lukabrand/LUKA-XMD',
                    }),
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '💬 Chat with Owner',
                        url: `https://wa.me/${config.OWNER_NUMBER}`,
                        merchant_url: `https://wa.me/${config.OWNER_NUMBER}`,
                    }),
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📡 Join Channel',
                        url: config.CHANNEL_URL,
                        merchant_url: config.CHANNEL_URL,
                    }),
                },
            ],
        }, { quoted: ctx.m }).catch(async () => {
            await ctx.sock.sendMessage(ctx.from, {
                image:       { url: REPO_IMAGE },
                caption:     card,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m }).catch(async () => {
                await ctx.sock.sendMessage(ctx.from, { text: card, contextInfo: channelCtx() }, { quoted: ctx.m });
            });
        });
        await ctx.react('🐾');
    },
});

// ── Owner Info Card ────────────────────────────────────────────
addCmd({
    name: 'owner',
    aliases: ['developer', 'dev', 'creator', 'contact'],
    desc: 'Show bot owner contact info',
    category: 'general',
    handler: async (ctx) => {
        let ppUrl = null;

        try {
            ppUrl = await ctx.sock.profilePictureUrl(
                config.OWNER_NUMBER + '@s.whatsapp.net',
                'image'
            );
        } catch {}

        const ownerCard =
            `👑 *OWNER INFORMATION* 👑\n` +
            `🐾 ${config.BOT_NAME}\n` +
            `_Your trusted WhatsApp assistant_\n\n` +
            `✦ ───────────── ✦\n\n` +
            `👨‍💻 *OWNER DETAILS*\n\n` +
            `🏷️ *Name:* ${config.OWNER_NAME}\n` +
            `📞 *Number:* +${config.OWNER_NUMBER}\n` +
            `💬 *WhatsApp:* wa.me/${config.OWNER_NUMBER}\n\n` +
            `✦ ───────────── ✦\n\n` +
            `📡 *OFFICIAL CHANNEL*\n` +
            `${config.CHANNEL_URL}\n\n` +
            `✦ ───────────── ✦\n\n` +
            `🌐 *GITHUB REPOSITORY*\n` +
            `github.com/Lukabrand/LUKA-XMD\n\n` +
            `⭐ _Star the repository if you love the bot!_\n` +
            `_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ_`;

        const ownerImage = ppUrl
            ? { url: ppUrl }
            : { url: REPO_IMAGE };

        await sendButtons(ctx.sock, ctx.from, {
            title: `👑 ${config.OWNER_NAME} — Owner Info`,
            text: ownerCard,
            footer: `© Lukabrand • ${config.BOT_NAME}`,
            image: ownerImage,
            buttons: [
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '💬 Chat with Owner',
                        url: `https://wa.me/${config.OWNER_NUMBER}`,
                        merchant_url: `https://wa.me/${config.OWNER_NUMBER}`,
                    }),
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📡 Join Channel',
                        url: config.CHANNEL_URL,
                        merchant_url: config.CHANNEL_URL,
                    }),
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '🌐 View on GitHub',
                        url: 'https://github.com/Lukabrand/LUKA-XMD',
                        merchant_url: 'https://github.com/Lukabrand/LUKA-XMD',
                    }),
                },
            ],
        }, { quoted: ctx.m }).catch(async () => {
            await ctx.sock.sendMessage(ctx.from, {
                image: ownerImage,
                caption: ownerCard,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m }).catch(async () => {
                await ctx.sock.sendMessage(ctx.from, {
                    text: ownerCard,
                    contextInfo: channelCtx(),
                }, { quoted: ctx.m });
            });
        });

        await ctx.react('👑');
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-MENTION
//  Deletes messages that mass-mention 5+ members (non-admins)
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antimention',
    aliases: ['antitag'],
    desc: 'Block mass-mentions by non-admins (5+ tags = delete)',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const current = getGroupSettings(ctx.from).antimention;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antimention', newVal);
        await ctx.reply(
            newVal
                ? '🔕 *Anti-Mention ON*\n\nMass-mentions (5+ tags) by non-admins will be deleted automatically.'
                : '🔔 *Anti-Mention OFF*\n\nMass-mention protection has been disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        const settings = getGroupSettings(ctx.from);
        if (!settings.antimention) return;
        if (ctx.isAdmin || ctx.isOwner || ctx.m.fromMe) return;

        const mentionedJids =
            ctx.m.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
            ctx.m.message?.contextInfo?.mentionedJid || [];

        if (mentionedJids.length < 5) return;

        await ctx.deleteMsg().catch(() => {});
        await ctx.send({
            text:
                `🔕 *Anti-Mention*\n\n` +
                `@${ctx.sender.split('@')[0]} you cannot mass-tag members!\n\n` +
                `_${config.BOT_NAME}_`,
            mentions: [ctx.sender],
        }).catch(() => {});
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-VIEWONCE
//  Re-sends view-once photos/videos so everyone in the group sees them
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antiviewonce',
    aliases: ['antiview', 'avo'],
    desc: 'Re-send view-once media so all members can see it',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const current = getGroupSettings(ctx.from).antiviewonce;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antiviewonce', newVal);
        await ctx.reply(
            newVal
                ? '👁️ *Anti-ViewOnce ON*\n\nView-once media will be re-sent for everyone to see.'
                : '👁️ *Anti-ViewOnce OFF*\n\nView-once media will stay private.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        const settings = getGroupSettings(ctx.from);
        if (!settings.antiviewonce) return;
        if (ctx.m.fromMe) return;

        const raw = ctx.m.message;
        const inner =
            raw?.viewOnceMessage?.message ||
            raw?.viewOnceMessageV2?.message ||
            raw?.viewOnceMessageV2Extension?.message;
        if (!inner) return;

        const caption =
            inner.imageMessage?.caption ||
            inner.videoMessage?.caption || '';

        await ctx.sock.sendMessage(ctx.from, {
            forward: { ...ctx.m, message: inner },
        }, { quoted: ctx.m }).catch(async () => {
            await ctx.reply(
                `👁️ *Anti-ViewOnce*\n\n` +
                `@${ctx.sender.split('@')[0]} sent a view-once media.\n` +
                (caption ? `_Caption: ${caption}_` : '') +
                `\n\n_${config.BOT_NAME}_`
            ).catch(() => {});
        });
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-STICKER
//  Deletes sticker messages sent by non-admins
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antisticker',
    aliases: ['nosticker'],
    desc: 'Delete stickers sent by non-admins in the group',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const current = getGroupSettings(ctx.from).antisticker;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antisticker', newVal);
        await ctx.reply(
            newVal
                ? '🚫 *Anti-Sticker ON*\n\nStickers from non-admins will be deleted.'
                : '✅ *Anti-Sticker OFF*\n\nSticker restriction has been disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        const settings = getGroupSettings(ctx.from);
        if (!settings.antisticker) return;
        if (ctx.isAdmin || ctx.isOwner || ctx.m.fromMe) return;
        if (!ctx.m.message?.stickerMessage) return;

        await ctx.deleteMsg().catch(() => {});
        await ctx.send({
            text:
                `🚫 *Anti-Sticker*\n\n` +
                `@${ctx.sender.split('@')[0]} stickers are not allowed in this group!\n\n` +
                `_${config.BOT_NAME}_`,
            mentions: [ctx.sender],
        }).catch(() => {});
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-FOREIGN
//  Toggle command — enforcement happens in lib/handlers/group.js
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antiforeign',
    aliases: ['noforeign'],
    desc: 'Auto-remove members with foreign phone numbers when they join',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        if (!ctx.isBotAdmin) return ctx.reply('❌ I need to be an *admin* to remove members.');
        const current = getGroupSettings(ctx.from).antiforeign;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antiforeign', newVal);
        await ctx.reply(
            newVal
                ? '🌍 *Anti-Foreign ON*\n\nForeign numbers will be removed automatically when they join.'
                : '🌍 *Anti-Foreign OFF*\n\nForeign number restriction has been disabled.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  FREEZE LAST SEEN
//  Hides the bot's last seen from everyone
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'freezelastseen',
    aliases: ['freezels', 'fls'],
    desc: "Freeze / unfreeze the bot's last seen",
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const current = getSetting('FREEZE_LAST_SEEN', 'false') === 'true';
        const newVal  = !current;
        setSetting('FREEZE_LAST_SEEN', String(newVal));

        if (newVal) {
            await ctx.sock.updateLastSeenPrivacy('none').catch(() => {});
            await ctx.sock.updateOnlinePrivacy('match_last_seen').catch(() => {});
            await ctx.reply(
                `❄️ *Last Seen Frozen!*\n\n` +
                `The bot's last seen is now hidden from everyone.\n\n` +
                `_Use .freezelastseen again to unfreeze._`
            );
        } else {
            await ctx.sock.updateLastSeenPrivacy('contacts').catch(() => {});
            await ctx.reply(
                `✅ *Last Seen Unfrozen!*\n\n` +
                `The bot's last seen is now visible to contacts.`
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  GHOST MODE
//  Full privacy lock: last seen + profile photo + status all hidden
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'ghostmode',
    aliases: ['ghost'],
    desc: 'Toggle full ghost mode (hide last seen, photo & status)',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const current = getSetting('GHOST_MODE', 'false') === 'true';
        const newVal  = !current;
        setSetting('GHOST_MODE', String(newVal));

        if (newVal) {
            await Promise.all([
                ctx.sock.updateLastSeenPrivacy('none'),
                ctx.sock.updateOnlinePrivacy('match_last_seen'),
                ctx.sock.updateProfilePicturePrivacy('none'),
                ctx.sock.updateStatusPrivacy('none'),
            ]).catch(() => {});
            await ctx.reply(
                `👻 *Ghost Mode ON!*\n\n` +
                `• Last Seen  » Hidden\n` +
                `• Profile Photo » Hidden\n` +
                `• Status  » Hidden\n\n` +
                `_Use .ghostmode again to turn off._`
            );
        } else {
            await Promise.all([
                ctx.sock.updateLastSeenPrivacy('contacts'),
                ctx.sock.updateProfilePicturePrivacy('contacts'),
                ctx.sock.updateStatusPrivacy('contacts'),
            ]).catch(() => {});
            await ctx.reply(
                `✅ *Ghost Mode OFF!*\n\n` +
                `Privacy settings restored to contacts-only.`
            );
        }
    },
});


// ═══════════════════════════════════════════════════════════════
//  ANTI-DELETE  —  command to toggle anti-delete on/off
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'antidelete',
    aliases: ['antidel', 'adel'],
    desc: 'Toggle anti-delete — recover deleted messages',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const { getGroupSettings, setGroupSetting } = require('../../luka/db/database');
        const { channelCtx } = require('../../luka/utils/gmdFunctions2');
        const current = getGroupSettings(ctx.from).antidelete;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antidelete', newVal);

        await ctx.sock.sendMessage(
            ctx.from,
            {
                text: newVal
                    ? `*ANTI-DELETE ON*\n${ctx.config.BOT_NAME}\n\nDeleted messages will be recovered and shown to everyone.\n\n◈ ${ctx.config.CHANNEL_NAME}`
                    : `*ANTI-DELETE OFF*\n${ctx.config.BOT_NAME}\n\nMessage recovery has been disabled.\n\n◈ ${ctx.config.CHANNEL_NAME}`,
                contextInfo: channelCtx(),
            },
            { quoted: ctx.m }
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-EDIT  —  command to toggle anti-edit detection
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'antiedit',
    aliases: ['antied'],
    desc: 'Toggle anti-edit — log original message before edits',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const { getGroupSettings, setGroupSetting } = require('../../luka/db/database');
        const { channelCtx } = require('../../luka/utils/gmdFunctions2');
        const current = getGroupSettings(ctx.from).antidelete; // shared flag
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antidelete', newVal);

        await ctx.sock.sendMessage(
            ctx.from,
            {
                text: newVal
                    ? `*ANTI-EDIT ON*\n${ctx.config.BOT_NAME}\n\nOriginal messages will be shown when someone edits.\n\n◈ ${ctx.config.CHANNEL_NAME}`
                    : `*ANTI-EDIT OFF*\n${ctx.config.BOT_NAME}\n\nEdit detection has been disabled.\n\n◈ ${ctx.config.CHANNEL_NAME}`,
                contextInfo: channelCtx(),
            },
            { quoted: ctx.m }
        );
    },

// GET PROFILE PICTURE
addCmd({
    name: 'getpp',
    aliases: [],
    desc: 'Get profile picture',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        try {
            const sock = ctx.sock;
            const jid = ctx.quoted?.sender || ctx.m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || ctx.sender;
            const url = await sock.profilePictureUrl(jid, 'image');
            await ctx.send({ image: { url }, caption: `Profile Picture\nJID: ${jid}` });
        } catch {
            return ctx.reply('❌ Profile picture not available.');
        }
    }
});

// GET GROUP PROFILE PICTURE
addCmd({
    name: 'getgcpp',
    aliases: [],
    desc: 'Get group profile picture',
    category: 'owner',
    ownerOnly: true,
    groupOnly: true,
    async handler(ctx) {
        try {
            const url = await ctx.sock.profilePictureUrl(ctx.from, 'image');
            await ctx.send({ image: { url }, caption: 'Group Profile Picture' });
        } catch {
            return ctx.reply('❌ Group profile picture not available.');
        }
    }
});

// DISAPPEARING MESSAGES
addCmd({
    name: 'disapp',
    aliases: [],
    desc: 'Set disappearing messages',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        const value = (ctx.args?.[0] || '').toLowerCase();
        const times = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 };
        if (!(value in times)) return ctx.reply('Usage: .disapp off/24h/7d/90d');
        try {
            await ctx.sock.sendMessage(ctx.from, { disappearingMessagesInChat: times[value] });
            return ctx.reply(`✅ Disappearing messages setting requested: ${value}`);
        } catch {
            return ctx.reply('❌ Failed to update disappearing messages.');
        }
    }
});

// DELETE REPLIED MESSAGE
addCmd({
    name: 'del',
    aliases: ['delete'],
    desc: 'Delete a replied message',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        try {
            const q = ctx.quoted;
            if (!q) return ctx.reply('Reply to a message to delete it.');
            const key = q.key || q;
            const remoteJid = key.remoteJid || ctx.from;
            if (!key.id) return ctx.reply('❌ Could not identify the replied message.');
            await ctx.sock.sendMessage(remoteJid, {
                delete: {
                    remoteJid,
                    fromMe: Boolean(key.fromMe),
                    id: key.id,
                    participant: key.participant
                }
            });
        } catch {
            return ctx.reply('❌ Could not delete that message.');
        }
    }
});

// LIST MY GROUPS
addCmd({
    name: 'mygroups',
    aliases: [],
    desc: 'List groups the bot belongs to',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        try {
            const groups = await ctx.sock.groupFetchAllParticipating();
            const list = Object.entries(groups).map(([jid, g], i) =>
                `${i + 1}. ${g.subject || 'Unnamed Group'}\n${jid}`
            );
            return ctx.reply(list.length ? list.join('\n\n') : 'No groups found.');
        } catch {
            return ctx.reply('❌ Failed to fetch groups.');
        }
    }
});

// FORWARD REPLIED MESSAGE
addCmd({
    name: 'forward',
    aliases: [],
    desc: 'Forward a replied message',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        const target = ctx.args?.[0];
        const q = ctx.quoted;
        if (!target || !q) return ctx.reply('Reply to a message and use: .forward number');
        try {
            const jid = target.includes('@') ? target : `${target.replace(/\D/g, '')}@s.whatsapp.net`;
            const message = q.message || q.msg;
            if (!message) return ctx.reply('❌ Could not read the replied message.');
            await ctx.sock.sendMessage(jid, { forward: message });
            return ctx.reply('✅ Forward request sent.');
        } catch {
            return ctx.reply('❌ Failed to forward message.');
        }
    }
});

// SEND TEXT TO STATUS
addCmd({
    name: 'tostatus',
    aliases: [],
    desc: 'Post text to WhatsApp status',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        const text = ctx.args?.join(' ');
        if (!text) return ctx.reply('Usage: .tostatus Your status text');
        try {
            await ctx.sock.sendMessage('status@broadcast', { text });
            return ctx.reply('✅ Status posted.');
        } catch {
            return ctx.reply('❌ Failed to post status.');
        }
    }
});

// JOIN GROUP USING INVITE LINK
addCmd({
    name: 'join',
    aliases: [],
    desc: 'Join a group using invite link',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        const link = ctx.args?.[0];
        const code = link?.match(/chat\.whatsapp\.com\/([0-9A-Za-z]+)/)?.[1];
        if (!code) return ctx.reply('Usage: .join https://chat.whatsapp.com/INVITECODE');
        try {
            const result = await ctx.sock.groupAcceptInvite(code);
            return ctx.reply(`✅ Joined group: ${result}`);
        } catch {
            return ctx.reply('❌ Could not join group. The link may be invalid or expired.');
        }
    }
});

// SHOW CHAT JID
addCmd({
    name: 'jid',
    aliases: ['getjid'],
    desc: 'Show current chat JID',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        return ctx.reply(`📌 Chat JID: ${ctx.from || ctx.m?.key?.remoteJid || 'Unknown'}`);
    }
});

// CACHED GROUP METADATA
addCmd({
    name: 'cachedmeta',
    aliases: [],
    desc: 'Show available group metadata',
    category: 'owner',
    ownerOnly: true,
    groupOnly: true,
    async handler(ctx) {
        try {
            const meta = ctx.groupMeta || await ctx.sock.groupMetadata(ctx.from);
            return ctx.reply(
                `Group: ${meta.subject || 'Unknown'}\nJID: ${meta.id || ctx.from}\nMembers: ${meta.participants?.length || 0}`
            );
        } catch {
            return ctx.reply('❌ Group metadata is unavailable.');
        }
    }
});

// GET LID
addCmd({
    name: 'getlid',
    aliases: [],
    desc: 'Show sender LID if available',
    category: 'owner',
    ownerOnly: true,
    async handler(ctx) {
        const sender = ctx.sender || ctx.m?.sender || '';
        const chat = ctx.from || '';
        return ctx.reply(`Sender: ${sender || 'Unknown'}\nChat: ${chat || 'Unknown'}\nLID conversion depends on the Baileys version and available LID mapping.`);
    }
});
