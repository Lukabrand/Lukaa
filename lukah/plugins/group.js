'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');

// ── HELPERS ──────────────────────────────────────────────────

const isGroup = ctx => ctx.from?.endsWith('@g.us');

async function groupOnly(ctx) {
    if (!isGroup(ctx)) {
        await ctx.reply('❌ This command can only be used in groups.');
        return false;
    }
    return true;
}

async function adminOnly(ctx) {
    if (!ctx.isAdmin && !ctx.isOwner) {
        await ctx.reply('❌ Only group admins can use this command.');
        return false;
    }
    return true;
}

async function botAdmin(ctx) {
    const metadata = await ctx.sock.groupMetadata(ctx.from);
    const botJid = ctx.sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const bot = metadata.participants.find(p =>
        p.id === botJid || p.id.split(':')[0] === botJid.split('@')[0]
    );

    if (!bot?.admin) {
        await ctx.reply('❌ The bot must be a group admin.');
        return false;
    }
    return true;
}

function getTarget(ctx) {
    const quoted = ctx.m.message?.extendedTextMessage?.contextInfo?.participant;
    const mentioned = ctx.m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const number = ctx.args?.[0]?.replace(/\D/g, '');
    return quoted || mentioned || (number ? `${number}@s.whatsapp.net` : null);
}

async function updateMembers(ctx, action, target) {
    if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
    if (!target) return ctx.reply('❌ Reply to a member or mention them.');

    try {
        await ctx.sock.groupParticipantsUpdate(ctx.from, [target], action);
        await ctx.reply(
            `✅ Successfully ${action === 'remove' ? 'removed' : action === 'promote' ? 'promoted' : 'demoted'} @${target.split('@')[0]}`,
            { mentions: [target] }
        );
    } catch (e) {
        console.error('[GROUP ACTION]', e.message);
        await ctx.reply('❌ Action failed. Check the member and bot permissions.');
    }
}

async function getMembers(ctx) {
    const metadata = await ctx.sock.groupMetadata(ctx.from);
    return metadata.participants || [];
}

async function sendTags(ctx, title, members) {
    if (!members.length) return ctx.reply('❌ No members found.');

    const mentions = members.map(m => m.id);
    const text = `${title}\n\n` +
        members.map(m => `👤 @${m.id.split('@')[0]}`).join('\n');

    await ctx.sock.sendMessage(ctx.from, {
        text,
        mentions,
        contextInfo: channelCtx()
    }, { quoted: ctx.m });
}

// ── 1. MUTE ──────────────────────────────────────────────────
addCmd({
    name: 'mute',
    desc: 'Restrict group messages to admins',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            await ctx.sock.groupSettingUpdate(ctx.from, 'announcement');
            await ctx.reply('🔇 Group muted. Only admins can send messages.');
        } catch {
            await ctx.reply('❌ Failed to mute the group.');
        }
    }
});

// ── 2. UNMUTE ────────────────────────────────────────────────
addCmd({
    name: 'unmute',
    desc: 'Allow all members to send messages',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            await ctx.sock.groupSettingUpdate(ctx.from, 'not_announcement');
            await ctx.reply('🔊 Group unmuted. Everyone can send messages.');
        } catch {
            await ctx.reply('❌ Failed to unmute the group.');
        }
    }
});

// ── 3. PROMOTE ───────────────────────────────────────────────
addCmd({
    name: 'promote',
    desc: 'Promote a member to admin',
    category: 'group',
    handler: ctx => updateMembers(ctx, 'promote', getTarget(ctx))
});

// ── 4. DEMOTE ────────────────────────────────────────────────
addCmd({
    name: 'demote',
    desc: 'Remove admin privileges',
    category: 'group',
    handler: ctx => updateMembers(ctx, 'demote', getTarget(ctx))
});

// ── 5. KICK ──────────────────────────────────────────────────
addCmd({
    name: 'kick',
    aliases: ['remove'],
    desc: 'Remove a member from the group',
    category: 'group',
    handler: ctx => updateMembers(ctx, 'remove', getTarget(ctx))
});

// ── 6. ADD ───────────────────────────────────────────────────
addCmd({
    name: 'add',
    desc: 'Add a member using their phone number',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        const number = ctx.args[0]?.replace(/\D/g, '');
        if (!number) return ctx.reply('Usage: .add 255712345678');

        try {
            const result = await ctx.sock.groupParticipantsUpdate(
                ctx.from, [`${number}@s.whatsapp.net`], 'add'
            );
            await ctx.reply(`📩 Add request processed:\n${JSON.stringify(result)}`);
        } catch {
            await ctx.reply('❌ Could not add this member. They may need an invite link.');
        }
    }
});

// ── 7. LINK ──────────────────────────────────────────────────
addCmd({
    name: 'link',
    aliases: ['grouplink'],
    desc: 'Get the group invite link',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            const code = await ctx.sock.groupInviteCode(ctx.from);
            await ctx.reply(`🔗 *GROUP INVITE LINK*\n\nhttps://chat.whatsapp.com/${code}`);
        } catch {
            await ctx.reply('❌ Could not retrieve the invite link.');
        }
    }
});

// ── 8. NEWGROUP ──────────────────────────────────────────────
addCmd({
    name: 'newgroup',
    desc: 'Create a new WhatsApp group',
    category: 'group',
    handler: async ctx => {
        const name = ctx.args.join(' ').trim();
        if (!name) return ctx.reply('Usage: .newgroup Group Name');
        try {
            const group = await ctx.sock.groupCreate(name, [ctx.sender]);
            await ctx.reply(`✅ Group created!\n📛 Name: ${name}\n🆔 ID: ${group.id}`);
        } catch {
            await ctx.reply('❌ Could not create the group.');
        }
    }
});

// ── 9. ACCEPT ────────────────────────────────────────────────
addCmd({
    name: 'accept',
    desc: 'Approve a join request',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        const target = getTarget(ctx);
        if (!target) return ctx.reply('Usage: .accept 255712345678');
        try {
            await ctx.sock.groupRequestParticipantsUpdate(ctx.from, [target], 'approve');
            await ctx.reply('✅ Join request approved.');
        } catch {
            await ctx.reply('❌ Could not approve the request.');
        }
    }
});

// ── 10. REJECT ───────────────────────────────────────────────
addCmd({
    name: 'reject',
    desc: 'Reject a join request',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        const target = getTarget(ctx);
        if (!target) return ctx.reply('Usage: .reject 255712345678');
        try {
            await ctx.sock.groupRequestParticipantsUpdate(ctx.from, [target], 'reject');
            await ctx.reply('❌ Join request rejected.');
        } catch {
            await ctx.reply('❌ Could not reject the request.');
        }
    }
});

// ── 11. ACCEPTALL ────────────────────────────────────────────
addCmd({
    name: 'acceptall',
    desc: 'Approve all pending join requests',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            const requests = await ctx.sock.groupRequestParticipantsList(ctx.from);
            const ids = (requests || []).map(r => r.jid).filter(Boolean);
            if (!ids.length) return ctx.reply('ℹ️ No pending requests.');
            await ctx.sock.groupRequestParticipantsUpdate(ctx.from, ids, 'approve');
            await ctx.reply(`✅ Approved ${ids.length} request(s).`);
        } catch {
            await ctx.reply('❌ Could not approve requests.');
        }
    }
});

// ── 12. REJECTALL ────────────────────────────────────────────
addCmd({
    name: 'rejectall',
    desc: 'Reject all pending join requests',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            const requests = await ctx.sock.groupRequestParticipantsList(ctx.from);
            const ids = (requests || []).map(r => r.jid).filter(Boolean);
            if (!ids.length) return ctx.reply('ℹ️ No pending requests.');
            await ctx.sock.groupRequestParticipantsUpdate(ctx.from, ids, 'reject');
            await ctx.reply(`✅ Rejected ${ids.length} request(s).`);
        } catch {
            await ctx.reply('❌ Could not reject requests.');
        }
    }
});

// ── 13. ONLINE ───────────────────────────────────────────────
addCmd({
    name: 'online',
    desc: 'List group members',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx)) return;
        try {
            await sendTags(ctx, '🟢 *GROUP MEMBERS*', await getMembers(ctx));
        } catch {
            await ctx.reply('❌ Could not retrieve members.');
        }
    }
});

// ── 14. RESETLINK ────────────────────────────────────────────
addCmd({
    name: 'resetlink',
    desc: 'Reset the group invite link',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            await ctx.sock.groupRevokeInvite(ctx.from);
            const code = await ctx.sock.groupInviteCode(ctx.from);
            await ctx.reply(`✅ Invite link reset.\n\nhttps://chat.whatsapp.com/${code}`);
        } catch {
            await ctx.reply('❌ Could not reset the invite link.');
        }
    }
});

// ── 15. LEFT ─────────────────────────────────────────────────
addCmd({
    name: 'left',
    aliases: ['leave'],
    desc: 'Make the bot leave the group',
    category: 'group',
    ownerOnly: true,
    handler: async ctx => {
        if (!await groupOnly(ctx)) return;
        try {
            await ctx.reply('👋 Goodbye, everyone!');
            await ctx.sock.groupLeave(ctx.from);
        } catch {
            await ctx.reply('❌ Could not leave the group.');
        }
    }
});

// ── 16. LISTREQUESTS ─────────────────────────────────────────
addCmd({
    name: 'listrequests',
    aliases: ['requests'],
    desc: 'List pending join requests',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        try {
            const requests = await ctx.sock.groupRequestParticipantsList(ctx.from);
            if (!requests?.length) return ctx.reply('ℹ️ No pending requests.');
            await sendTags(ctx, '📋 *PENDING JOIN REQUESTS*',
                requests.map(r => ({ id: r.jid })));
        } catch {
            await ctx.reply('❌ Could not retrieve join requests.');
        }
    }
});

// ── 17. TOGROUPSTATUS ────────────────────────────────────────
addCmd({
    name: 'togroupstatus',
    aliases: ['groupstatus'],
    desc: 'Show group information',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx)) return;
        try {
            const m = await ctx.sock.groupMetadata(ctx.from);
            await ctx.reply(
                `📊 *GROUP INFORMATION*\n\n` +
                `📛 Name: ${m.subject}\n` +
                `🆔 ID: ${m.id}\n` +
                `👥 Members: ${m.participants.length}\n` +
                `👑 Admins: ${m.participants.filter(p => p.admin).length}\n` +
                `📝 Description: ${m.desc || 'No description'}\n\n` +
                `_${config.BOT_NAME}_`
            );
        } catch {
            await ctx.reply('❌ Could not retrieve group information.');
        }
    }
});

// ── 18. GROUPNAME ────────────────────────────────────────────
addCmd({
    name: 'groupname',
    aliases: ['gname'],
    desc: 'Change the group name',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx) || !await botAdmin(ctx)) return;
        const name = ctx.args.join(' ').trim();
        if (!name) return ctx.reply('Usage: .groupname New Name');
        try {
            await ctx.sock.groupUpdateSubject(ctx.from, name);
            await ctx.reply(`✅ Group name changed to *${name}*`);
        } catch {
            await ctx.reply('❌ Could not change group name.');
        }
    }
});

// ── 19. EVERYONE ─────────────────────────────────────────────
addCmd({
    name: 'everyone',
    aliases: ['tagall'],
    desc: 'Mention all group members',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx)) return;
        const members = await getMembers(ctx);
        const message = ctx.args.join(' ') || 'Attention everyone!';
        const mentions = members.map(m => m.id);
        await ctx.sock.sendMessage(ctx.from, {
            text: `📢 *EVERYONE*\n${message}\n\n` +
                mentions.map(j => `@${j.split('@')[0]}`).join(' '),
            mentions,
            contextInfo: channelCtx()
        }, { quoted: ctx.m });
    }
});

// ── 20. TAGGALL ──────────────────────────────────────────────
addCmd({
    name: 'taggall',
    aliases: ['tageveryone'],
    desc: 'Tag every member with a message',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx)) return;
        const members = await getMembers(ctx);
        const mentions = members.map(m => m.id);
        await ctx.sock.sendMessage(ctx.from, {
            text: `🔔 *ATTENTION MEMBERS*\n${ctx.args.join(' ') || 'Please pay attention.'}\n\n` +
                mentions.map(j => `@${j.split('@')[0]}`).join(' '),
            mentions,
            contextInfo: channelCtx()
        }, { quoted: ctx.m });
    }
});

// ── 21. HIDETAG ──────────────────────────────────────────────
addCmd({
    name: 'hidetag',
    aliases: ['ht'],
    desc: 'Mention all members without displaying their tags',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx)) return;
        const members = await getMembers(ctx);
        const mentions = members.map(m => m.id);
        await ctx.sock.sendMessage(ctx.from, {
            text: ctx.args.join(' ') || '📢 Attention everyone!',
            mentions,
            contextInfo: channelCtx()
        }, { quoted: ctx.m });
    }
});

// ── 22. ANTIGROUPMENTION ─────────────────────────────────────
addCmd({
    name: 'antigroupmention',
    aliases: ['antitagall'],
    desc: 'Toggle protection against mass mentions',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx) || !await adminOnly(ctx)) return;
        const mode = (ctx.args[0] || '').toLowerCase();
        if (!['on', 'off'].includes(mode)) {
            return ctx.reply('Usage: .antigroupmention on/off');
        }

        if (!ctx.db) {
            return ctx.reply('❌ Database integration is required to save this setting.');
        }

        try {
            if (typeof ctx.db.set === 'function') {
                await ctx.db.set(`antigroupmention_${ctx.from}`, mode === 'on');
            } else {
                return ctx.reply('❌ Your database does not support this setting.');
            }

            await ctx.reply(`✅ Anti-group-mention setting: *${mode.toUpperCase()}*`);
        } catch {
            await ctx.reply('❌ Could not save the setting.');
        }
    }
});

// ── 23. TAGADMINS ────────────────────────────────────────────
addCmd({
    name: 'tagadmins',
    aliases: ['admins'],
    desc: 'Mention all group admins',
    category: 'group',
    handler: async ctx => {
        if (!await groupOnly(ctx)) return;
        const members = await getMembers(ctx);
        const admins = members.filter(m => m.admin);
        if (!admins.length) return ctx.reply('ℹ️ No admins found.');

        const mentions = admins.map(m => m.id);
        await ctx.sock.sendMessage(ctx.from, {
            text: `👑 *GROUP ADMINS*\n\n${ctx.args.join(' ') || 'Attention admins!'}\n\n` +
                mentions.map(j => `👑 @${j.split('@')[0]}`).join('\n'),
            mentions,
            contextInfo: channelCtx()
        }, { quoted: ctx.m });
    }
});
