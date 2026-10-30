'use strict';

const { addCmd, addTrigger } = require('../../luka/handlers/loader');

const { getStatusReport } = require('../../luka/utils/statusEngine');

const {
    addSudo,
    removeSudo,
    getSudoList,
    isSudo,
    setSetting,
    getSetting,
    getGroupSettings,
    setGroupSetting,
} = require('../../luka/db/database');

const { numberToJid, cleanJid } = require('../../luka/utils/helpers');

const config = require('../../luka/config/settings');

const { channelCtx, sendButtons } = require('../../luka/utils/gmdFunctions2');

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ═══════════════════════════════════════════════════════════════
// GITHUB UPDATE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const GH_REPO = 'Lukabrand/LUKA-XMD';
const GH_BRANCH = 'main';

const SHA_FILE = path.join(process.cwd(), '.local', 'last_sha.txt');

const REPO_IMAGE = 'https://i.imgur.com/YbnhBIV.png';

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

// ═══════════════════════════════════════════════════════════════
// GITHUB API HELPER
// ═══════════════════════════════════════════════════════════════

function ghRequest(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';

        const headers = {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'LUKA-XMD-Bot',
            'Content-Type': 'application/json',
        };

        if (token) {
            headers.Authorization = `token ${token}`;
        }

        const req = https.request({
            hostname: 'api.github.com',
            path: apiPath,
            method,
            headers,
        }, (res) => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return reject(
                            new Error(
                                parsed.message ||
                                `GitHub returned HTTP ${res.statusCode}`
                            )
                        );
                    }

                    resolve(parsed);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);

        req.setTimeout(30000, () => {
            req.destroy(new Error('GitHub API request timed out'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

function getLocalGitSha() {
    try {
        return execSync('git rev-parse HEAD', {
            cwd: process.cwd(),
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return null;
    }
}

function storesha(sha) {
    fs.mkdirSync(path.dirname(SHA_FILE), {
        recursive: true,
    });

    fs.writeFileSync(SHA_FILE, sha, 'utf8');
}

function readStoredSha() {
    try {
        const stored = fs.readFileSync(SHA_FILE, 'utf8').trim();

        if (stored) {
            return stored;
        }
    } catch {
        // SHA file does not exist yet.
    }

    const gitSha = getLocalGitSha();

    if (gitSha) {
        storesha(gitSha);
        return gitSha;
    }

    return null;
}

function safeConfig(key, fallback = '') {
    return config[key] || fallback;
}

function groupSetting(ctx, key) {
    try {
        const settings = getGroupSettings(ctx.from) || {};
        return Boolean(settings[key]);
    } catch {
        return false;
    }
}

function getQuotedParticipant(ctx) {
    return (
        ctx.m?.message?.extendedTextMessage?.contextInfo?.participant ||
        ctx.m?.message?.imageMessage?.contextInfo?.participant ||
        ctx.m?.message?.videoMessage?.contextInfo?.participant ||
        ''
    );
}

// ═══════════════════════════════════════════════════════════════
// ADD SUDO
// ═══════════════════════════════════════════════════════════════

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
                ? cleanJid(getQuotedParticipant(ctx))
                : null;

        if (!target) {
            return ctx.reply(
                '❌ Tag a user or provide their number.\n\n' +
                'Example: .addsudo 255712345678'
            );
        }

        if (isSudo(target)) {
            return ctx.reply('⚠️ That user is already a sudo user.');
        }

        addSudo(target);

        await ctx.reply(
            `✅ *@${target.split('@')[0]}* has been added as a sudo user.`,
            { mentions: [target] }
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// REMOVE SUDO
// ═══════════════════════════════════════════════════════════════

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
                ? cleanJid(getQuotedParticipant(ctx))
                : null;

        if (!target) {
            return ctx.reply(
                '❌ Tag a user or provide their number.'
            );
        }

        if (!isSudo(target)) {
            return ctx.reply('⚠️ That user is not a sudo user.');
        }

        removeSudo(target);

        await ctx.reply(
            `✅ *@${target.split('@')[0]}* has been removed from sudo users.`,
            { mentions: [target] }
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// SUDO LIST
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'sudolist',
    aliases: ['listsudo'],
    desc: 'List all sudo users',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const list = getSudoList() || [];

        if (!list.length) {
            return ctx.reply('📭 No sudo users have been added yet.');
        }

        const text =
            `👑 *Sudo Users* (${list.length})\n\n` +
            list.map((jid, index) =>
                `${index + 1}. @${jid.split('@')[0]}`
            ).join('\n') +
            `\n\n${FOOTER}`;

        await ctx.send({
            text,
            mentions: list,
        });
    },
});

// ═══════════════════════════════════════════════════════════════
// SET BOT MODE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'setmode',
    desc: 'Set bot mode',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const mode = ctx.args[0]?.toLowerCase();
        const valid = ['public', 'private', 'groups', 'dm'];

        if (!mode || !valid.includes(mode)) {
            return ctx.reply(
                `❌ Invalid mode.\n\n` +
                `Valid modes: ${valid.join(', ')}\n\n` +
                `Example: .setmode public`
            );
        }

        setSetting('MODE', mode);
        config.MODE = mode;

        await ctx.reply(`✅ Bot mode set to *${mode}*`);
    },
});

// ═══════════════════════════════════════════════════════════════
// SET PREFIX
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'setprefix',
    desc: 'Change the bot command prefix',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const prefix = ctx.args[0];

        if (!prefix) {
            return ctx.reply(
                '❌ Provide a new prefix.\n\nExample: .setprefix !'
            );
        }

        setSetting('BOT_PREFIX', prefix);
        config.BOT_PREFIX = prefix;

        await ctx.reply(`✅ Prefix changed to *${prefix}*`);
    },
});

// ═══════════════════════════════════════════════════════════════
// SET BOT NAME
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'setname',
    desc: 'Change the bot name',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const name = ctx.text?.trim();

        if (!name) {
            return ctx.reply('❌ Provide a new bot name.');
        }

        setSetting('BOT_NAME', name);
        config.BOT_NAME = name;

        await ctx.reply(`✅ Bot name updated to *${name}*`);
    },
});

// ═══════════════════════════════════════════════════════════════
// BROADCAST
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'broadcast',
    aliases: ['bc'],
    desc: 'Broadcast a message to all groups',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        if (!ctx.text) {
            return ctx.reply('❌ Provide a message to broadcast.');
        }

        const groups = await ctx.sock
            .groupFetchAllParticipating()
            .catch(() => ({}));

        const ids = Object.keys(groups);

        if (!ids.length) {
            return ctx.reply('⚠️ No groups found.');
        }

        await ctx.reply(
            `📡 Broadcasting to *${ids.length}* groups...`
        );

        let sent = 0;
        let failed = 0;

        for (const id of ids) {
            try {
                await ctx.sock.sendMessage(id, {
                    text:
                        `📢 *Broadcast from ${safeConfig('OWNER_NAME', 'Owner')}*\n\n` +
                        `${ctx.text}\n\n` +
                        `_${safeConfig('BOT_NAME', 'LUKA-XMD')}_`,
                });

                sent++;
            } catch {
                failed++;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await ctx.reply(
            `✅ *Broadcast completed*\n\n` +
            `📨 Sent: ${sent}\n` +
            `❌ Failed: ${failed}`
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// RESTART
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'restart',
    desc: 'Restart the bot',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        await ctx.reply(
            `♻️ Restarting *${safeConfig('BOT_NAME', 'LUKA-XMD')}*...`
        );

        setTimeout(() => process.exit(0), 2000);
    },
});

// ═══════════════════════════════════════════════════════════════
// SHUTDOWN
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'shutdown',
    aliases: ['stop'],
    desc: 'Shut down the bot',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        await ctx.reply(
            `🛑 *${safeConfig('BOT_NAME', 'LUKA-XMD')}* is shutting down. Goodbye!`
        );

        setTimeout(() => process.exit(1), 2000);
    },
});

// ═══════════════════════════════════════════════════════════════
// STATUS REPORT
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// UPDATE FROM GITHUB
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'update',
    aliases: ['upgrade', 'checkupdate'],
    desc: 'Check for and apply updates from GitHub',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        await ctx.react('🔄');

        const sep = '✦ ───────────── ✦';

        await ctx.reply(
            '🔍 *Checking for updates...*\n\n⏳ Contacting GitHub...'
        );

        let latestCommit;

        try {
            const refData = await ghRequest(
                'GET',
                `/repos/${GH_REPO}/git/ref/heads/${GH_BRANCH}`
            );

            if (!refData?.object?.sha) {
                throw new Error('Could not retrieve the latest commit SHA.');
            }

            const commitData = await ghRequest(
                'GET',
                `/repos/${GH_REPO}/git/commits/${refData.object.sha}`
            );

            latestCommit = {
                sha: refData.object.sha,
                shortSha: refData.object.sha.slice(0, 7),
                message: commitData?.message?.split('\n')[0] || '—',
                author: commitData?.author?.name || 'unknown',
                date: commitData?.author?.date
                    ? new Date(commitData.author.date).toLocaleDateString(
                        'en-GB',
                        {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                        }
                    )
                    : '—',
            };
        } catch (error) {
            await ctx.react('❌');

            return ctx.reply(
                `❌ *Could not reach GitHub*\n\n` +
                `${sep}\n\n` +
                `${error.message.slice(0, 200)}\n\n` +
                `Check your internet connection and repository access.`
            );
        }

        const storedSha = readStoredSha();

        if (storedSha === latestCommit.sha) {
            await ctx.react('✅');

            return ctx.reply(
                `✅ *${safeConfig('BOT_NAME', 'LUKA-XMD')} is up to date!*\n\n` +
                `${sep}\n\n` +
                `📌 Version: \`${latestCommit.shortSha}\`\n` +
                `🌿 Branch: ${GH_BRANCH}\n` +
                `👤 Author: ${latestCommit.author}\n` +
                `📅 Date: ${latestCommit.date}\n\n` +
                `_No new updates available._`
            );
        }

        let changedFiles = [];
        let commitLog = '';

        try {
            if (!storedSha) {
                throw new Error('No previous SHA available.');
            }

            const compare = await ghRequest(
                'GET',
                `/repos/${GH_REPO}/compare/${storedSha}...${latestCommit.sha}`
            );

            changedFiles = (compare.files || []).map(file => ({
                path: file.filename,
                status: file.status,
            }));

            commitLog = (compare.commits || [])
                .slice(-10)
                .reverse()
                .map(commit =>
                    `• ${commit.commit?.message?.split('\n')[0]?.slice(0, 60) || '—'}`
                )
                .join('\n');
        } catch {
            try {
                const treeData = await ghRequest(
                    'GET',
                    `/repos/${GH_REPO}/git/trees/${latestCommit.sha}?recursive=1`
                );

                changedFiles = (treeData.tree || [])
                    .filter(file => file.type === 'blob')
                    .map(file => ({
                        path: file.path,
                        status: 'modified',
                    }));
            } catch (error) {
                await ctx.react('❌');

                return ctx.reply(
                    `❌ Failed to retrieve repository files.\n${error.message}`
                );
            }
        }

        const totalFiles = changedFiles.length;
        const pkgChanged = changedFiles.some(
            file => file.path === 'package.json'
        );

        const toUpdate = changedFiles.filter(
            file => file.status !== 'removed'
        );

        const toRemove = changedFiles.filter(
            file => file.status === 'removed'
        );

        await ctx.reply(
            `🆕 *Update Available!*\n\n` +
            `${sep}\n\n` +
            `📦 Latest: \`${latestCommit.shortSha}\`\n` +
            `📅 Date: ${latestCommit.date}\n` +
            `👤 By: ${latestCommit.author}\n\n` +
            (commitLog ? `📝 *Recent changes:*\n${commitLog}\n\n` : '') +
            `${sep}\n\n` +
            `📁 ${totalFiles} file(s) found. Downloading...`
        );

        let written = 0;
        let failed = 0;

        for (const file of toUpdate) {
            try {
                const encodedPath = file.path
                    .split('/')
                    .map(encodeURIComponent)
                    .join('/');

                const raw = await ghRequest(
                    'GET',
                    `/repos/${GH_REPO}/contents/${encodedPath}?ref=${latestCommit.sha}`
                );

                if (!raw?.content || raw.encoding !== 'base64') {
                    failed++;
                    continue;
                }

                const content = Buffer.from(raw.content, 'base64');
                const dest = path.resolve(process.cwd(), file.path);
                const root = path.resolve(process.cwd());

                if (!dest.startsWith(root + path.sep) && dest !== root) {
                    failed++;
                    continue;
                }

                fs.mkdirSync(path.dirname(dest), {
                    recursive: true,
                });

                fs.writeFileSync(dest, content);
                written++;
            } catch {
                failed++;
            }
        }

        for (const file of toRemove) {
            try {
                const dest = path.resolve(process.cwd(), file.path);
                const root = path.resolve(process.cwd());

                if (
                    dest.startsWith(root + path.sep) &&
                    fs.existsSync(dest) &&
                    fs.statSync(dest).isFile()
                ) {
                    fs.unlinkSync(dest);
                }
            } catch {
                // Best effort.
            }
        }

        if (pkgChanged) {
            await ctx.reply(
                '📦 package.json changed. Reinstalling dependencies...'
            );

            try {
                execSync('npm install --legacy-peer-deps', {
                    cwd: process.cwd(),
                    encoding: 'utf8',
                    timeout: 120000,
                    stdio: 'pipe',
                });
            } catch (error) {
                await ctx.reply(
                    `⚠️ Dependency installation reported an issue:\n` +
                    `${String(error.message).slice(0, 200)}`
                );
            }
        }

        storesha(latestCommit.sha);

        await ctx.reply(
            `✅ *Update Applied!*\n\n` +
            `${sep}\n\n` +
            `📌 New version: \`${latestCommit.shortSha}\`\n` +
            `📁 Files written: ${written}\n` +
            `⚠️ Files failed: ${failed}\n` +
            `🔁 Dependencies changed: ${pkgChanged ? 'Yes' : 'No'}\n\n` +
            `♻️ Restarting ${safeConfig('BOT_NAME', 'LUKA-XMD')}...`
        );

        await ctx.react('✅');

        setTimeout(() => process.exit(0), 2500);
    },
});

// ═══════════════════════════════════════════════════════════════
// REPOSITORY
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'repo',
    aliases: ['github', 'source', 'sourcecode'],
    desc: 'Show the bot GitHub repository link',
    category: 'owner',

    handler: async (ctx) => {
        const sep = '✦ ───────────── ✦';

        const card =
            `🐾 *${safeConfig('BOT_NAME', 'LUKA-XMD')}* 🐾\n` +
            `✦ *Open-Source WhatsApp Bot* ✦\n` +
            `_Lukabrand · Built with ❤️_\n\n` +
            `${sep}\n\n` +
            `🌿 *Branch* · main\n` +
            `⚡ *Engine* · Node.js + Baileys\n` +
            `🔒 *License* · Open-Source\n\n` +
            `${sep}\n\n` +
            `✨ *FEATURES*\n\n` +
            `🤖 Commands and automation\n` +
            `🛡️ Group protection tools\n` +
            `🎵 Music, downloads and AI\n` +
            `🔄 Auto-Bio and Auto-Status\n` +
            `👑 Owner administration\n` +
            `🎭 Sticker and media tools\n\n` +
            `${sep}\n\n` +
            `👨‍💻 *DEVELOPER*\n\n` +
            `🏷️ ${safeConfig('OWNER_NAME', 'Owner')}\n` +
            `📞 +${safeConfig('OWNER_NUMBER')}\n\n` +
            `${sep}\n\n` +
            `⭐ Star it · Fork it · Build yours!\n\n` +
            `_${FOOTER}_`;

        await sendButtons(ctx.sock, ctx.from, {
            title: `🐾 ${safeConfig('BOT_NAME', 'LUKA-XMD')} — Source Code`,
            text: card,
            footer: FOOTER,
            image: { url: REPO_IMAGE },
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
                        url: `https://wa.me/${safeConfig('OWNER_NUMBER')}`,
                        merchant_url: `https://wa.me/${safeConfig('OWNER_NUMBER')}`,
                    }),
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📡 Join Channel',
                        url: safeConfig('CHANNEL_URL'),
                        merchant_url: safeConfig('CHANNEL_URL'),
                    }),
                },
            ],
        }, { quoted: ctx.m }).catch(async () => {
            await ctx.sock.sendMessage(ctx.from, {
                image: { url: REPO_IMAGE },
                caption: card,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m }).catch(async () => {
                await ctx.reply(card);
            });
        });

        await ctx.react('🐾');
    },
});

// ═══════════════════════════════════════════════════════════════
// OWNER INFORMATION
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'owner',
    aliases: ['developer', 'dev', 'creator', 'contact'],
    desc: 'Show bot owner contact information',
    category: 'general',

    handler: async (ctx) => {
        let ppUrl = null;

        try {
            ppUrl = await ctx.sock.profilePictureUrl(
                `${safeConfig('OWNER_NUMBER')}@s.whatsapp.net`,
                'image'
            );
        } catch {
            // Use the repository image as fallback.
        }

        const ownerCard =
            `👑 *OWNER INFORMATION* 👑\n` +
            `🐾 ${safeConfig('BOT_NAME', 'LUKA-XMD')}\n` +
            `_Your trusted WhatsApp assistant_\n\n` +
            `✦ ───────────── ✦\n\n` +
            `👨‍💻 *OWNER DETAILS*\n\n` +
            `🏷️ Name: ${safeConfig('OWNER_NAME', 'Owner')}\n` +
            `📞 Number: +${safeConfig('OWNER_NUMBER')}\n` +
            `💬 WhatsApp: wa.me/${safeConfig('OWNER_NUMBER')}\n\n` +
            `✦ ───────────── ✦\n\n` +
            `📡 *OFFICIAL CHANNEL*\n` +
            `${safeConfig('CHANNEL_URL')}\n\n` +
            `✦ ───────────── ✦\n\n` +
            `🌐 *GITHUB REPOSITORY*\n` +
            `github.com/Lukabrand/LUKA-XMD\n\n` +
            `⭐ Star the repository if you love the bot!\n\n` +
            `_${FOOTER}_`;

        const ownerImage = ppUrl
            ? { url: ppUrl }
            : { url: REPO_IMAGE };

        await sendButtons(ctx.sock, ctx.from, {
            title: `👑 ${safeConfig('OWNER_NAME', 'Owner')} — Owner Info`,
            text: ownerCard,
            footer: FOOTER,
            image: ownerImage,
            buttons: [
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '💬 Chat with Owner',
                        url: `https://wa.me/${safeConfig('OWNER_NUMBER')}`,
                        merchant_url: `https://wa.me/${safeConfig('OWNER_NUMBER')}`,
                    }),
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📡 Join Channel',
                        url: safeConfig('CHANNEL_URL'),
                        merchant_url: safeConfig('CHANNEL_URL'),
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
                await ctx.reply(ownerCard);
            });
        });

        await ctx.react('👑');
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-MENTION
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antimention',
    aliases: ['antitag'],
    desc: 'Block mass-mentions by non-admins',
    category: 'group',
    groupOnly: true,
    adminOnly: true,

    handler: async (ctx) => {
        const newVal = !groupSetting(ctx, 'antimention');

        setGroupSetting(ctx.from, 'antimention', newVal);

        await ctx.reply(
            newVal
                ? '🔕 *Anti-Mention ON*\n\nMass-mentions (5+ tags) by non-admins will be deleted.'
                : '🔔 *Anti-Mention OFF*\n\nMass-mention protection disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        if (!groupSetting(ctx, 'antimention')) return;
        if (ctx.isAdmin || ctx.isOwner || ctx.m?.fromMe) return;

        const mentionedJids =
            ctx.m?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
            ctx.m?.message?.contextInfo?.mentionedJid ||
            [];

        if (mentionedJids.length < 5) return;

        await ctx.deleteMsg().catch(() => {});

        await ctx.send({
            text:
                `🔕 *Anti-Mention*\n\n` +
                `@${(ctx.sender || '').split('@')[0]} you cannot mass-tag members!\n\n` +
                `_${safeConfig('BOT_NAME', 'LUKA-XMD')}_`,
            mentions: ctx.sender ? [ctx.sender] : [],
        }).catch(() => {});
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-VIEWONCE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antiviewonce',
    aliases: ['antiview', 'avo'],
    desc: 'Detect view-once media in groups',
    category: 'group',
    groupOnly: true,
    adminOnly: true,

    handler: async (ctx) => {
        const newVal = !groupSetting(ctx, 'antiviewonce');

        setGroupSetting(ctx.from, 'antiviewonce', newVal);

        await ctx.reply(
            newVal
                ? '👁️ *Anti-ViewOnce ON*\n\nView-once media detection is enabled.'
                : '👁️ *Anti-ViewOnce OFF*\n\nView-once media detection is disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        if (!groupSetting(ctx, 'antiviewonce')) return;
        if (ctx.m?.fromMe) return;

        const raw = ctx.m?.message || {};

        const inner =
            raw.viewOnceMessage?.message ||
            raw.viewOnceMessageV2?.message ||
            raw.viewOnceMessageV2Extension?.message;

        if (!inner) return;

        const caption =
            inner.imageMessage?.caption ||
            inner.videoMessage?.caption ||
            '';

        await ctx.reply(
            `👁️ *Anti-ViewOnce detected*\n\n` +
            `Sender: @${(ctx.sender || '').split('@')[0]}\n` +
            (caption ? `Caption: ${caption}\n` : '') +
            `\n_${safeConfig('BOT_NAME', 'LUKA-XMD')}_`,
            { mentions: ctx.sender ? [ctx.sender] : [] }
        ).catch(() => {});
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-STICKER
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antisticker',
    aliases: ['nosticker'],
    desc: 'Delete stickers sent by non-admins',
    category: 'group',
    groupOnly: true,
    adminOnly: true,

    handler: async (ctx) => {
        const newVal = !groupSetting(ctx, 'antisticker');

        setGroupSetting(ctx.from, 'antisticker', newVal);

        await ctx.reply(
            newVal
                ? '🚫 *Anti-Sticker ON*\n\nStickers from non-admins will be deleted.'
                : '✅ *Anti-Sticker OFF*\n\nSticker restriction disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        if (!groupSetting(ctx, 'antisticker')) return;
        if (ctx.isAdmin || ctx.isOwner || ctx.m?.fromMe) return;
        if (!ctx.m?.message?.stickerMessage) return;

        await ctx.deleteMsg().catch(() => {});

        await ctx.send({
            text:
                `🚫 *Anti-Sticker*\n\n` +
                `@${(ctx.sender || '').split('@')[0]} stickers are not allowed in this group!\n\n` +
                `_${safeConfig('BOT_NAME', 'LUKA-XMD')}_`,
            mentions: ctx.sender ? [ctx.sender] : [],
        }).catch(() => {});
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-FOREIGN
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antiforeign',
    aliases: ['noforeign'],
    desc: 'Remove foreign-number members when they join',
    category: 'group',
    groupOnly: true,
    adminOnly: true,

    handler: async (ctx) => {
        if (!ctx.isBotAdmin) {
            return ctx.reply('❌ I need to be an admin to remove members.');
        }

        const newVal = !groupSetting(ctx, 'antiforeign');

        setGroupSetting(ctx.from, 'antiforeign', newVal);

        await ctx.reply(
            newVal
                ? '🌍 *Anti-Foreign ON*\n\nForeign numbers will be removed automatically when they join.'
                : '🌍 *Anti-Foreign OFF*\n\nForeign number restriction disabled.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// FREEZE LAST SEEN
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'freezelastseen',
    aliases: ['freezels', 'fls'],
    desc: "Freeze or unfreeze the bot's last seen",
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const current = getSetting('FREEZE_LAST_SEEN', 'false') === 'true';
        const newVal = !current;

        setSetting('FREEZE_LAST_SEEN', String(newVal));

        try {
            if (newVal) {
                await ctx.sock.updateLastSeenPrivacy('none');
                await ctx.sock.updateOnlinePrivacy('match_last_seen');

                return ctx.reply(
                    `❄️ *Last Seen Frozen!*\n\n` +
                    `The bot's last seen is now hidden.\n\n` +
                    `Use .freezelastseen again to unfreeze.`
                );
            }

            await ctx.sock.updateLastSeenPrivacy('contacts');

            return ctx.reply(
                '✅ *Last Seen Unfrozen!*\n\n' +
                'The bot last seen is visible to contacts.'
            );
        } catch {
            return ctx.reply(
                '⚠️ Setting saved, but WhatsApp did not confirm the privacy change.'
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// GHOST MODE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'ghostmode',
    aliases: ['ghost'],
    desc: 'Toggle privacy settings',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const current = getSetting('GHOST_MODE', 'false') === 'true';
        const newVal = !current;

        setSetting('GHOST_MODE', String(newVal));

        try {
            if (newVal) {
                await Promise.all([
                    ctx.sock.updateLastSeenPrivacy('none'),
                    ctx.sock.updateOnlinePrivacy('match_last_seen'),
                    ctx.sock.updateProfilePicturePrivacy('none'),
                    ctx.sock.updateStatusPrivacy('none'),
                ]);

                return ctx.reply(
                    `👻 *Ghost Mode ON!*\n\n` +
                    `• Last Seen: Hidden\n` +
                    `• Profile Photo: Hidden\n` +
                    `• Status: Hidden\n\n` +
                    `Use .ghostmode again to turn it off.`
                );
            }

            await Promise.all([
                ctx.sock.updateLastSeenPrivacy('contacts'),
                ctx.sock.updateProfilePicturePrivacy('contacts'),
                ctx.sock.updateStatusPrivacy('contacts'),
            ]);

            return ctx.reply(
                '✅ *Ghost Mode OFF!*\n\nPrivacy settings restored to contacts-only.'
            );
        } catch {
            return ctx.reply(
                '⚠️ Some privacy settings could not be changed by this Baileys version.'
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-DELETE — CONFIG CONNECTED
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antidelete',
    aliases: ['antidel', 'adel'],
    desc: 'Toggle Anti-Delete in config',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            // Read the current config value directly.
            const current = config.ANTIDELETE === true;
            const newValue = !current;

            // Update the running config immediately.
            config.ANTIDELETE = newValue;

            // Persist the value in the database too.
            setSetting('ANTIDELETE', String(newValue));

            await ctx.reply(
                `${newValue ? '✅' : '❌'} *ANTI-DELETE ${newValue ? 'ON' : 'OFF'}*\n\n` +
                `Config: \`ANTIDELETE = ${newValue}\`\n` +
                `Reports: ${newValue ? 'Enabled' : 'Disabled'}\n\n` +
                `${FOOTER}`
            );
        } catch (error) {
            console.error('[ANTIDELETE]', error);

            await ctx.reply(
                `❌ Failed to update Anti-Delete.\n\n${FOOTER}`
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-DELETE STATUS
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antideletestatus',
    aliases: ['adelstatus', 'adstatus'],
    desc: 'Check global anti-delete status',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const enabled = getAntiDeleteStatus();

            await ctx.reply(
                `🛡️ *ANTI-DELETE STATUS*\n\n` +
                `Status: ${enabled ? '✅ ON' : '❌ OFF'}\n` +
                `Destination: Owner WhatsApp inbox\n` +
                `Coverage: Groups and private chats\n\n` +
                `${FOOTER}`
            );
        } catch (error) {
            console.error('[ANTIDELETE STATUS]', error);

            await ctx.reply(
                `❌ Could not read Anti-Delete status.\n\n${FOOTER}`
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// ANTI-EDIT
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'antiedit',
    aliases: ['antied'],
    desc: 'Toggle anti-edit message detection',
    category: 'group',
    groupOnly: true,
    adminOnly: true,

    handler: async (ctx) => {
        const newVal = !groupSetting(ctx, 'antiedit');

        setGroupSetting(ctx.from, 'antiedit', newVal);

        await ctx.sock.sendMessage(ctx.from, {
            text:
                `*ANTI-EDIT ${newVal ? 'ON' : 'OFF'}*\n` +
                `${safeConfig('BOT_NAME', 'LUKA-XMD')}\n\n` +
                (
                    newVal
                        ? 'Anti-edit setting enabled. Edited-message detection also requires a working message-update handler.'
                        : 'Anti-edit setting disabled.'
                ) +
                `\n\n◈ ${safeConfig('CHANNEL_NAME', safeConfig('CHANNEL_URL'))}`,
            contextInfo: channelCtx(),
        }, { quoted: ctx.m });
    },
});

// ═══════════════════════════════════════════════════════════════
// GET PROFILE PICTURE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'getpp',
    aliases: [],
    desc: 'Get a WhatsApp profile picture',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const jid =
                ctx.quoted?.sender ||
                ctx.m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                ctx.sender;

            if (!jid) {
                return ctx.reply('❌ Reply to or tag a user first.');
            }

            const url = await ctx.sock.profilePictureUrl(jid, 'image');

            await ctx.send({
                image: { url },
                caption: `Profile Picture\nJID: ${jid}`,
            });
        } catch {
            return ctx.reply('❌ Profile picture not available.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// GET GROUP PROFILE PICTURE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'getgcpp',
    aliases: [],
    desc: 'Get group profile picture',
    category: 'owner',
    ownerOnly: true,
    groupOnly: true,

    handler: async (ctx) => {
        try {
            const url = await ctx.sock.profilePictureUrl(ctx.from, 'image');

            await ctx.send({
                image: { url },
                caption: 'Group Profile Picture',
            });
        } catch {
            return ctx.reply('❌ Group profile picture not available.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// DISAPPEARING MESSAGES
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'disapp',
    aliases: [],
    desc: 'Set disappearing messages',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const value = (ctx.args?.[0] || '').toLowerCase();

        const times = {
            off: 0,
            '24h': 86400,
            '7d': 604800,
            '90d': 7776000,
        };

        if (!Object.prototype.hasOwnProperty.call(times, value)) {
            return ctx.reply('Usage: .disapp off/24h/7d/90d');
        }

        try {
            await ctx.sock.sendMessage(ctx.from, {
                disappearingMessagesInChat: times[value],
            });

            return ctx.reply(
                `✅ Disappearing messages setting requested: ${value}`
            );
        } catch {
            return ctx.reply(
                '❌ Failed to update disappearing messages. Check your Baileys version.'
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// DELETE REPLIED MESSAGE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'del',
    aliases: ['delete'],
    desc: 'Delete a replied message',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const quoted = ctx.quoted;

            if (!quoted) {
                return ctx.reply('Reply to a message to delete it.');
            }

            const key = quoted.key || quoted;

            const remoteJid = key.remoteJid || ctx.from;

            if (!key.id) {
                return ctx.reply(
                    '❌ Could not identify the replied message.'
                );
            }

            await ctx.sock.sendMessage(remoteJid, {
                delete: {
                    remoteJid,
                    fromMe: Boolean(key.fromMe),
                    id: key.id,
                    participant: key.participant,
                },
            });
        } catch {
            return ctx.reply(
                '❌ Could not delete that message. Check the quoted message key.'
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// LIST GROUPS
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'mygroups',
    aliases: [],
    desc: 'List groups the bot belongs to',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const groups = await ctx.sock.groupFetchAllParticipating();

            const list = Object.entries(groups).map(([jid, group], index) =>
                `${index + 1}. ${group.subject || 'Unnamed Group'}\n${jid}`
            );

            return ctx.reply(
                list.length ? list.join('\n\n') : 'No groups found.'
            );
        } catch {
            return ctx.reply('❌ Failed to fetch groups.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// FORWARD REPLIED MESSAGE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'forward',
    aliases: [],
    desc: 'Forward a replied message',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const target = ctx.args?.[0];
        const quoted = ctx.quoted;

        if (!target || !quoted) {
            return ctx.reply(
                'Reply to a message and use: .forward 255712345678'
            );
        }

        try {
            const jid = target.includes('@')
                ? target
                : `${target.replace(/\D/g, '')}@s.whatsapp.net`;

            const message = quoted.message || quoted.msg;

            if (!message) {
                return ctx.reply(
                    '❌ Could not read the replied message.'
                );
            }

            await ctx.sock.sendMessage(jid, {
                forward: message,
            });

            return ctx.reply('✅ Forward request sent.');
        } catch {
            return ctx.reply('❌ Failed to forward message.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// SEND TEXT TO STATUS
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'tostatus',
    aliases: [],
    desc: 'Post text to WhatsApp status',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const text = ctx.args?.join(' ').trim();

        if (!text) {
            return ctx.reply(
                'Usage: .tostatus Your status text'
            );
        }

        try {
            await ctx.sock.sendMessage('status@broadcast', {
                text,
            });

            return ctx.reply('✅ Status posting request sent.');
        } catch {
            return ctx.reply('❌ Failed to post status.');
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// JOIN GROUP
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'join',
    aliases: [],
    desc: 'Join a group using invite link',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const link = ctx.args?.[0];

        const code = link?.match(
            /chat\.whatsapp\.com\/([0-9A-Za-z]+)/i
        )?.[1];

        if (!code) {
            return ctx.reply(
                'Usage: .join https://chat.whatsapp.com/INVITECODE'
            );
        }

        try {
            const result = await ctx.sock.groupAcceptInvite(code);

            return ctx.reply(`✅ Joined group: ${result}`);
        } catch {
            return ctx.reply(
                '❌ Could not join group. The link may be invalid or expired.'
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// SHOW CHAT JID
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'jid',
    aliases: ['getjid'],
    desc: 'Show current chat JID',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        return ctx.reply(
            `📌 Chat JID: ${ctx.from || ctx.m?.key?.remoteJid || 'Unknown'}`
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// CACHED GROUP METADATA
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'cachedmeta',
    aliases: [],
    desc: 'Show available group metadata',
    category: 'owner',
    ownerOnly: true,
    groupOnly: true,

    handler: async (ctx) => {
        try {
            const meta =
                ctx.groupMeta ||
                await ctx.sock.groupMetadata(ctx.from);

            return ctx.reply(
                `Group: ${meta.subject || 'Unknown'}\n` +
                `JID: ${meta.id || ctx.from}\n` +
                `Members: ${meta.participants?.length || 0}`
            );
        } catch {
            return ctx.reply(
                '❌ Group metadata is unavailable.'
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// GET LID
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'getlid',
    aliases: [],
    desc: 'Show sender LID if available',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sender = ctx.sender || ctx.m?.sender || '';
        const chat = ctx.from || '';

        return ctx.reply(
            `Sender: ${sender || 'Unknown'}\n` +
            `Chat: ${chat || 'Unknown'}\n\n` +
            `LID conversion depends on your Baileys version and available LID mapping.`
        );
    },
});

console.log(
    `✅ Owner and group commands loaded — ${safeConfig('BOT_NAME', 'LUKA-XMD')}`
);
