'use strict';
require('dotenv').config();

const bool = (key, def = true) => {
    const v = process.env[key];
    return v == null || v === '' ? def : v.toLowerCase() === 'true';
};
const env = (key, def = '') => process.env[key] || def;

const config = {
    // 🤖 BOT IDENTITY
    BOT_NAME: env('BOT_NAME', 'LUKA-XMD'),
    OWNER_NAME: env('OWNER_NAME', 'Lukabrand'),
    OWNER_NUMBER: env('OWNER_NUMBER', '255768619068'),
    BOT_PREFIX: env('BOT_PREFIX', '.'),
    BOT_VERSION: '5.0.0',
    PACK_NAME: env('BOT_NAME', 'LUKA-XMD'),
    PACK_AUTHOR: env('OWNER_NAME', 'Lukabrand'),

    // 📡 CHANNEL
    CHANNEL_URL: env('CHANNEL_URL', 'https://whatsapp.com/channel/0029l2UX3rZZilMSvxN1e'),
    CHANNEL_NAME: env('CHANNEL_NAME', 'LUKA-XMD Channel'),
    CHANNEL_JID: env('CHANNEL_JID', '120363427012090993@newsletter'),
    CHANNEL_NEWSLETTER_NAME: env('CHANNEL_NEWSLETTER_NAME', '『 LUKA-XMD 』'),

    // 🔐 CONNECTION
    SESSION_ID: env('SESSION_ID'),
    MODE: env('MODE', 'public'),
    TIME_ZONE: env('TIME_ZONE', 'Africa/Nairobi'),

    // ⚙️ AUTO FEATURES
    AUTO_READ_STATUS: bool('AUTO_READ_STATUS', true),
    AUTO_LIKE_STATUS: bool('AUTO_LIKE_STATUS', true),
    AUTO_REACT: bool('AUTO_REACT', false),
    AUTO_BIO: bool('AUTO_BIO', true),
    AUTO_TYPING: bool('AUTO_TYPING', false),
    AUTO_RECORDING: bool('AUTO_RECORDING', false),
    GHOST_MODE: bool('GHOST_MODE', false),
    FREEZE_LAST_SEEN: bool('FREEZE_LAST_SEEN', false),
    STATUS_REPLY: bool('STATUS_REPLY', false),
    AUTO_STICKER: bool('AUTO_STICKER', false),

    // 👁️ STATUS MANAGER
    AUTO_STATUS_SEEN: env('AUTO_STATUS_SEEN', String(bool('AUTO_READ_STATUS', true))),
    AUTO_STATUS_REACT: env('AUTO_STATUS_REACT', String(bool('AUTO_LIKE_STATUS', true))),
    AUTO_STATUS_MSG: env('AUTO_STATUS_MSG'),
    Status_Saver: env('Status_Saver', 'false'),
    Status_Saver_Owner_Notify: env('Status_Saver_Owner_Notify', 'false'),
    STATUS_MSG: env('STATUS_MSG'),
    CUSTOM_REACT_EMOJIS: env('CUSTOM_REACT_EMOJIS', '🪾,🌴,🪻,🌿,🌲,🌵,🍂,☄️,🪽,🪶,🚀,🍖'),

    // 🗄️ DATABASE & SERVER
    DATABASE_URL: process.env.DATABASE_URL || null,
    PORT: parseInt(process.env.PORT, 10) || 5000,

    // 🛡️ SECURITY & AUTOMATION
    ANTI_VV: bool('ANTI_VV', true),
    AUTO_FOLLOW_CHANNEL: bool('AUTO_FOLLOW_CHANNEL', true),
    AUTO_JOIN_GROUPS: env('AUTO_JOIN_GROUPS'),
    AUTO_UPDATE: bool('AUTO_UPDATE', true),

    // 📅 LICENSE
    EXPIRY_DATE: env('EXPIRY_DATE')
};

module.exports = config;

// ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ
