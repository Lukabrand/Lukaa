import { sendInteractive } from '../../lib/sendInteractive.js';

export default async (context) => {
    const { client, m, text, fetchJson } = context;

    await client.sendMessage(m.chat, {
        react: { text: '⌛', key: m.reactKey }
    });

    try {
        if (!text?.trim()) {
            await client.sendMessage(m.chat, {
                react: { text: '❌', key: m.reactKey }
            }).catch(() => {});

            return sendInteractive(client, m, `📦 *APK — LUKA-XMD*\n\n▢ Enter an app name.\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`);
        }

        const data = await fetchJson(
            `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(text.trim())}`
        );

        const app = data?.datalist?.list?.[0];
        const apkUrl = app?.file?.path;

        if (!apkUrl) {
            await client.sendMessage(m.chat, {
                react: { text: '❌', key: m.reactKey }
            }).catch(() => {});

            return sendInteractive(client, m, `❌ App or APK not found.\n\nLUKA-XMD`);
        }

        await client.sendMessage(m.chat, {
            document: { url: apkUrl },
            fileName: `${app.name.replace(/[<>:"/\\|?*]/g, '_')}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption: `📦 ${app.name}\n\nLUKA-XMD`
        });

        await client.sendMessage(m.chat, {
            react: { text: '✅', key: m.reactKey }
        });

    } catch (error) {
        console.error('APK error:', error);

        await client.sendMessage(m.chat, {
            react: { text: '❌', key: m.reactKey }
        }).catch(() => {});

        await sendInteractive(client, m, `❌ APK download failed.\n\nLUKA-XMD`);
    }
};
