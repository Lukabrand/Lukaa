"use strict";

const { addCmd } = require("../../luka/handlers/loader");
const axios = require("axios");
const {
    gitRepoRegex,
    MAX_MEDIA_SIZE,
    getFileSize,
} = require("../../luka");

const FOOTER = "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ";

function toxicBox(title, lines, footer = FOOTER) {
    return [
        `*${title}*`,
        ...lines.filter(Boolean),
        "",
        `_${footer || FOOTER}_`
    ].join("\n");
}

function cleanName(name = "media") {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 100);
}

async function getJson(url, timeout = 30000) {
    const { data } = await axios.get(url, {
        timeout,
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    return data;
}

async function sendMedia(ctx, type, url, title, caption = "") {
    const size = await getFileSize(url).catch(() => 0);
    const quoted = ctx.mek ? { quoted: ctx.mek } : {};

    if (size > MAX_MEDIA_SIZE && type === "video") {
        return ctx.sock.sendMessage(ctx.from, {
            document: { url },
            fileName: `${cleanName(title)}.mp4`,
            mimetype: "video/mp4",
            caption
        }, quoted);
    }

    return ctx.sock.sendMessage(ctx.from, {
        [type]: { url },
        ...(type === "video" ? { mimetype: "video/mp4" } : {}),
        ...(type === "image" ? {} : {}),
        ...(caption ? { caption } : {})
    }, quoted);
}

// ─── GITCLONE ─────────────────────────────────────────

addCmd({
    name: "gitclone",
    aliases: ["gitdl", "github", "git", "repodl", "clone"],
    category: "downloader",
    description: "Download a GitHub repository as ZIP",

    handler: async (ctx) => {
        const q = (ctx.args || ctx.query || "").trim();

        if (!q) {
            return ctx.reply(
                "Provide a GitHub repository URL.\nExample: .gitclone https://github.com/user/repo"
            );
        }

        const match = q.match(
            /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/
        );

        if (!match) {
            return ctx.reply("Invalid GitHub repository URL.");
        }

        const user = match[1];
        const repo = match[2].replace(/\.git$/, "");

        try {
            await ctx.react("⌛");

            const { data } = await axios.get(
                `https://api.github.com/repos/${user}/${repo}`,
                { timeout: 20000 }
            );

            const branch = data.default_branch || "main";
            const zipUrl =
                `https://api.github.com/repos/${user}/${repo}/zipball/${branch}`;

            await ctx.sock.sendMessage(ctx.from, {
                document: { url: zipUrl },
                fileName: `${cleanName(user)}-${cleanName(repo)}.zip`,
                mimetype: "application/zip",
                caption: toxicBox("GITHUB CLONE", [
                    `📦 Repository: ${user}/${repo}`,
                    `🌿 Branch: ${branch}`
                ])
            }, ctx.mek ? { quoted: ctx.mek } : {});

            await ctx.react("✅");
        } catch (err) {
            console.error("[LUKA GITCLONE]", err.message);
            await ctx.react("❌");
            return ctx.reply(
                err.response?.status === 404
                    ? "Repository not found or it is private."
                    : "Failed to download the repository. Try again later."
            );
        }
    }
});

// ─── FACEBOOK ─────────────────────────────────────────

addCmd({
    name: "fb",
    aliases: ["fbdl", "facebookdl", "facebook"],
    category: "downloader",
    description: "Download Facebook videos",

    handler: async (ctx) => {
        const q = (ctx.args || ctx.query || "").trim();

        if (!q || !/facebook\.com|fb\.watch/i.test(q)) {
            return ctx.reply("Provide a valid Facebook video URL.");
        }

        await ctx.react("⌛");

        try {
            let result = null;

            try {
                const data = await getJson(
                    `https://api.nexray.web.id/downloader/facebook?url=${encodeURIComponent(q)}`
                );
                if (data?.result?.url) result = data.result;
            } catch {}

            if (!result) {
                const base = ctx.KoyotehApi;
                const key = ctx.GuruApiKey;

                if (base && key) {
                    const data = await getJson(
                        `${base}/api/download/facebook?apikey=${encodeURIComponent(key)}&url=${encodeURIComponent(q)}`
                    );
                    const d = data?.result;

                    if (d?.hd_video || d?.sd_video) {
                        result = {
                            url: d.hd_video || d.sd_video,
                            title: d.title || "Facebook Video"
                        };
                    }
                }
            }

            if (!result?.url) throw new Error("No download URL");

            await sendMedia(
                ctx,
                "video",
                result.url,
                result.title || "facebook_video",
                toxicBox("FACEBOOK", [`🎬 ${result.title || "Facebook Video"}`])
            );

            await ctx.react("✅");
        } catch (err) {
            console.error("[LUKA FACEBOOK]", err.message);
            await ctx.react("❌");
            return ctx.reply("Facebook download failed. Check that the video is public.");
        }
    }
});

// ─── TIKTOK ───────────────────────────────────────────

addCmd({
    name: "tiktok",
    aliases: ["tiktokdl", "ttdl", "tt"],
    category: "downloader",
    description: "Download TikTok videos and audio",

    handler: async (ctx) => {
        const q = (ctx.args || ctx.query || "").trim();

        if (!q || !/tiktok\.com/i.test(q)) {
            return ctx.reply("Provide a valid TikTok URL.");
        }

        await ctx.react("⌛");

        try {
            let result = null;

            try {
                const data = await getJson(
                    `https://api.nexray.web.id/downloader/tiktok?url=${encodeURIComponent(q)}`
                );
                const d = data?.result;

                if (d?.video) {
                    result = {
                        video: d.video,
                        music: d.music,
                        title: d.title || "TikTok Video",
                        author: d.author?.nickname || "Unknown"
                    };
                }
            } catch {}

            if (!result) {
                const data = await getJson(
                    `https://www.tikwm.com/api/?url=${encodeURIComponent(q)}`
                );
                const d = data?.data;

                if (data?.code === 0 && d) {
                    result = {
                        video: d.play || d.wmplay,
                        music: d.music,
                        title: d.title || "TikTok Video",
                        author: d.author?.nickname || "Unknown"
                    };
                }
            }

            if (!result?.video) throw new Error("No video URL");

            await sendMedia(
                ctx,
                "video",
                result.video,
                result.title,
                toxicBox("TIKTOK", [
                    `🎵 ${result.title}`,
                    `👤 ${result.author}`
                ])
            );

            if (result.music) {
                try {
                    await ctx.sock.sendMessage(ctx.from, {
                        audio: { url: result.music },
                        mimetype: "audio/mpeg",
                        ptt: false,
                        fileName: `${cleanName(result.title)}_music.mp3`
                    }, ctx.mek ? { quoted: ctx.mek } : {});
                } catch (err) {
                    console.log("[LUKA TIKTOK AUDIO]", err.message);
                }
            }

            await ctx.react("✅");
        } catch (err) {
            console.error("[LUKA TIKTOK]", err.message);
            await ctx.react("❌");
            return ctx.reply("TikTok download failed. Please try again.");
        }
    }
});

// ─── TWITTER / X ──────────────────────────────────────

addCmd({
    name: "twitter",
    aliases: ["twitterdl", "xdl", "xdownloader", "twitterdownloader", "x"],
    category: "downloader",
    description: "Download Twitter/X videos",

    handler: async (ctx) => {
        const q = (ctx.args || ctx.query || "").trim();

        if (!q || !/(twitter\.com|x\.com)/i.test(q)) {
            return ctx.reply("Provide a valid Twitter/X URL.");
        }

        await ctx.react("⌛");

        try {
            let videoUrl = null;

            try {
                const data = await getJson(
                    `https://api.nexray.web.id/downloader/twitter?url=${encodeURIComponent(q)}`
                );
                const d = data?.result;
                const item = d?.videoUrls?.[0] || d?.urls?.[0];

                videoUrl = item?.url || d?.url || null;
            } catch {}

            if (!videoUrl && ctx.KoyotehApi && ctx.GuruApiKey) {
                try {
                    const data = await getJson(
                        `${ctx.KoyotehApi}/api/download/twitter?apikey=${encodeURIComponent(ctx.GuruApiKey)}&url=${encodeURIComponent(q)}`
                    );
                    videoUrl = data?.result?.videoUrls?.[0]?.url || null;
                } catch {}
            }

            if (!videoUrl) throw new Error("No video found");

            await sendMedia(
                ctx,
                "video",
                videoUrl,
                "twitter_video",
                toxicBox("TWITTER / X", ["🐦 Video downloaded"])
            );

            await ctx.react("✅");
        } catch (err) {
            console.error("[LUKA TWITTER]", err.message);
            await ctx.react("❌");
            return ctx.reply("No video found. Ensure the post is public and contains a video.");
        }
    }
});

// ─── INSTAGRAM ────────────────────────────────────────

addCmd({
    name: "ig",
    aliases: ["insta", "instadl", "igdl", "instagram"],
    category: "downloader",
    description: "Download Instagram reels, videos and images",

    handler: async (ctx) => {
        const q = (ctx.args || ctx.query || "").trim();

        if (!q || !/instagram\.com/i.test(q)) {
            return ctx.reply("Provide a valid Instagram URL.");
        }

        await ctx.react("⌛");

        try {
            let media = null;
            let isVideo = true;
            let caption = "";

            try {
                const data = await getJson(
                    `https://api.nexray.web.id/downloader/v2/instagram?url=${encodeURIComponent(q)}`
                );

                const d = data?.result;

                if (Array.isArray(d) && d.length) {
                    const item = d[0];
                    media = item.url || item.video || item.image;
                    isVideo = !!(item.video || item.type === "video");
                } else if (d?.url) {
                    media = d.url;
                    isVideo = d.type !== "image";
                    caption = d.caption || "";
                }
            } catch {}

            if (!media) {
                try {
                    const data = await getJson(
                        `https://api.nexray.web.id/downloader/instagram?url=${encodeURIComponent(q)}`
                    );

                    const d = data?.result;
                    if (d?.url) {
                        media = d.url;
                        isVideo = d.type !== "image";
                        caption = d.caption || "";
                    }
                } catch {}
            }

            if (!media && ctx.KoyotehApi && ctx.GuruApiKey) {
                try {
                    const data = await getJson(
                        `${ctx.KoyotehApi}/api/download/instadl?apikey=${encodeURIComponent(ctx.GuruApiKey)}&url=${encodeURIComponent(q)}`
                    );
                    const d = data?.result;

                    if (d?.download_url) {
                        media = d.download_url;
                        isVideo = true;
                    }
                } catch {}
            }

            if (!media) throw new Error("No media found");

            const text = toxicBox("INSTAGRAM", [
                caption ? `📝 ${caption.slice(0, 100)}` : "📸 Instagram media"
            ]);

            if (isVideo) {
                await sendMedia(ctx, "video", media, "instagram_video", text);
            } else {
                await sendMedia(ctx, "image", media, "instagram_image", text);
            }

            await ctx.react("✅");
        } catch (err) {
            console.error("[LUKA INSTAGRAM]", err.message);
            await ctx.react("❌");
            return ctx.reply("Instagram download failed. The post may be private or unavailable.");
        }
    }
});

// ─── SNACK VIDEO ──────────────────────────────────────

addCmd({
    name: "snack",
    aliases: ["snackdl", "snackvideo"],
    category: "downloader",
    description: "Download Snack Video",

    handler: async (ctx) => {
        const q = (ctx.args || ctx.query || "").trim();

        if (!q || !/snackvideo\.com/i.test(q)) {
            return ctx.reply("Provide a valid Snack Video URL.");
        }

        if (!ctx.KoyotehApi || !ctx.GuruApiKey) {
            return ctx.reply("Snack Video API is not configured.");
        }

        await ctx.react("⌛");

        try {
            const data = await getJson(
                `${ctx.KoyotehApi}/api/download/snackdl?apikey=${encodeURIComponent(ctx.GuruApiKey)}&url=${encodeURIComponent(q)}`,
                60000
            );

            const result = data?.result;

            if (!data?.success || !result?.media) {
                throw new Error("No media returned");
            }

            const title = result.title || "Snack Video";

            await sendMedia(
                ctx,
                "video",
                result.media,
                title,
                toxicBox("SNACK VIDEO", [
                    `🎬 ${title}`,
                    `👤 ${result.author || "Unknown"}`,
                    result.like ? `❤️ ${result.like} likes` : null
                ])
            );

            await ctx.react("✅");
        } catch (err) {
            console.error("[LUKA SNACK]", err.message);
            await ctx.react("❌");
            return ctx.reply("Snack Video download failed. Please try again.");
        }
    }
});
