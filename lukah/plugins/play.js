"use strict";

const { addCmd } = require("../../luka/handlers/loader");
const axios = require("axios");
const config = require("../../luka/config/settings");

// ─── HELPERS ──────────────────────────────────────────

function isYtUrl(str = "") {
    return /(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|live\/)?)([A-Za-z0-9_-]{11})/.test(str);
}

function extractYtId(url = "") {
    const match = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/))([A-Za-z0-9_-]{11})/
    );
    return match ? match[1] : null;
}

function fmtDuration(secs) {
    const s = parseInt(secs, 10) || 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const FOOTER = "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ";

function fmt(title, lines, footer = FOOTER) {
    return [
        `*${title}*`,
        ...lines.filter(Boolean),
        "",
        `_${footer || FOOTER}_`
    ].join("\n");
}

function cleanFileName(name = "media") {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 100);
}

async function getJson(url, timeout = 60000) {
    const { data } = await axios.get(url, {
        timeout,
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    return data;
}

// ─── AUDIO RESOLVER ───────────────────────────────────

async function resolveAudio(query, isUrl) {
    const enc = encodeURIComponent(query);
    const id = isUrl ? extractYtId(query) : null;

    const providers = isUrl
        ? [
            async () => {
                const data = await getJson(
                    `https://api.sidycoders.xyz/api/ytdl?url=${enc}&format=mp3&apikey=memberdycoders`
                );

                if (!data?.cdn) throw new Error("Sidycoders unavailable");

                return {
                    url: data.cdn,
                    title: data.title || "Track"
                };
            },

            async () => {
                if (!id) throw new Error("Invalid YouTube URL");

                const data = await getJson(
                    `https://api.nexray.web.id/downloader/ytmp3?url=${encodeURIComponent(
                        `https://youtube.com/watch?v=${id}`
                    )}`
                );

                const result = data?.result;
                const url = result?.url || result?.downloadUrl;

                if (!url) throw new Error("Nexray unavailable");

                return {
                    url,
                    title: result?.title || "Track"
                };
            }
        ]
        : [
            async () => {
                const data = await getJson(
                    `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${enc}`
                );

                const result = data?.result;
                const url = result?.downloadUrl || result?.url;

                if (!url) throw new Error("Apiziaul unavailable");

                return {
                    url,
                    title: result?.title || query,
                    thumbnail: result?.thumbnail || "",
                    sourceUrl: result?.videoUrl || ""
                };
            }
        ];

    providers.push(
        ...[
            `https://api.giftedtech.web.id/api/download/ytmp3?apikey=free&url=${enc}`,
            `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${enc}`,
            `https://api.siputzx.my.id/api/d/ytmp3?url=${enc}`,
            `https://apiskeith.top/download/audio?url=${enc}`
        ].map(endpoint => async () => {
            const data = await getJson(endpoint);
            const result = data?.result;

            const url =
                (typeof result === "string" ? result : null) ||
                result?.url ||
                result?.download_url ||
                data?.download_url ||
                data?.url ||
                data?.link;

            if (typeof url !== "string" || !url.startsWith("http")) {
                throw new Error("No audio URL");
            }

            return {
                url,
                title: data?.title || result?.title || query
            };
        })
    );

    for (const provider of providers) {
        try {
            const result = await provider();
            if (result?.url) return result;
        } catch (error) {
            console.log("[LUKA-XMD AUDIO]", error.message);
        }
    }

    return null;
}

// ─── VIDEO RESOLVER ───────────────────────────────────

async function resolveVideo(query, isUrl) {
    const enc = encodeURIComponent(query);
    const id = isUrl ? extractYtId(query) : null;

    const providers = [
        async () => {
            const target = id
                ? `https://youtube.com/watch?v=${id}`
                : query;

            const data = await getJson(
                `https://api.nexray.web.id/downloader/ytmp4?url=${encodeURIComponent(target)}&resolusi=720`,
                90000
            );

            const result = data?.result;
            const url = result?.url || result?.downloadUrl;

            if (!url) throw new Error("Nexray unavailable");

            return {
                url,
                title: result?.title || "Video",
                duration: result?.duration || 0
            };
        },

        async () => {
            const data = await getJson(
                `https://api.sidycoders.xyz/api/ytdl?url=${enc}&format=mp4&apikey=memberdycoders`,
                90000
            );

            if (!data?.cdn) throw new Error("Sidycoders unavailable");

            return {
                url: data.cdn,
                title: data.title || "Video"
            };
        },

        ...[
            `https://api.giftedtech.web.id/api/download/ytmp4?apikey=free&url=${enc}`,
            `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${enc}`,
            `https://api.siputzx.my.id/api/d/ytmp4?url=${enc}`,
            `https://apiskeith.top/download/video?url=${enc}`
        ].map(endpoint => async () => {
            const data = await getJson(endpoint, 90000);
            const result = data?.result;

            const url =
                (typeof result === "string" ? result : null) ||
                result?.url ||
                result?.download_url ||
                data?.download_url ||
                data?.url ||
                data?.link;

            if (typeof url !== "string" || !url.startsWith("http")) {
                throw new Error("No video URL");
            }

            return {
                url,
                title: data?.title || result?.title || "Video"
            };
        })
    ];

    for (const provider of providers) {
        try {
            const result = await provider();
            if (result?.url) return result;
        } catch (error) {
            console.log("[LUKA-XMD VIDEO]", error.message);
        }
    }

    return null;
}

// ─── PLAY ─────────────────────────────────────────────

addCmd({
    name: "play",
    aliases: ["music", "song", "yta", "audio", "ply"],
    description: "Download audio from YouTube",
    category: "downloader",

    handler: async (ctx) => {
        const query = (ctx.args || ctx.query || "").trim();
        const reply = ctx.reply;
        const react = ctx.react;
        const from = ctx.from;
        const sock = ctx.sock;
        const mek = ctx.mek;

        if (!query) {
            return reply(fmt("PLAY", [
                "Enter a song name or YouTube link.",
                "Example: .play Diamond Platnumz"
            ]));
        }

        await react("⌛");
        await reply(fmt("PLAY", ["Searching for your song..."]));

        const result = await resolveAudio(query, isYtUrl(query));

        if (!result) {
            await react("❌");
            return reply(fmt("PLAY", [
                "Could not download this song.",
                "Try another name or a YouTube URL."
            ]));
        }

        try {
            const title = result.title || query;

            await sock.sendMessage(from, {
                audio: { url: result.url },
                mimetype: "audio/mpeg",
                ptt: false,
                fileName: `${cleanFileName(title)}.mp3`
            }, { quoted: mek });

            await react("✅");
        } catch (error) {
            console.log("[LUKA-XMD PLAY]", error.message);
            await react("❌");
            await reply(fmt("PLAY", ["Failed to send the audio."]));
        }
    }
});

// ─── YTMP3 ────────────────────────────────────────────

addCmd({
    name: "ytmp3",
    aliases: ["ymp3", "yt3", "ytaudio"],
    description: "Download audio using a YouTube URL",
    category: "downloader",

    handler: async (ctx) => {
        const query = (ctx.args || ctx.query || "").trim();

        if (!query || !isYtUrl(query)) {
            return ctx.reply(fmt("YTMP3", [
                "Provide a valid YouTube link.",
                "Example: .ytmp3 https://youtu.be/VIDEO_ID"
            ]));
        }

        await ctx.react("⌛");

        const result = await resolveAudio(query, true);

        if (!result) {
            await ctx.react("❌");
            return ctx.reply(fmt("YTMP3", ["Audio download failed."]));
        }

        try {
            await ctx.sock.sendMessage(ctx.from, {
                audio: { url: result.url },
                mimetype: "audio/mpeg",
                ptt: false,
                fileName: `${cleanFileName(result.title || "audio")}.mp3`
            }, { quoted: ctx.mek });

            await ctx.react("✅");
        } catch (error) {
            console.log("[LUKA-XMD YTMP3]", error.message);
            await ctx.react("❌");
            await ctx.reply(fmt("YTMP3", ["Failed to send the audio."]));
        }
    }
});

// ─── VIDEO ────────────────────────────────────────────

addCmd({
    name: "video",
    aliases: ["ytmp4", "mp4", "dlmp4", "ytv", "ytvideo"],
    description: "Download a YouTube video",
    category: "downloader",

    handler: async (ctx) => {
        const query = (ctx.args || ctx.query || "").trim();

        if (!query) {
            return ctx.reply(fmt("VIDEO", [
                "Enter a video title or YouTube link.",
                "Example: .video Fally Ipupa"
            ]));
        }

        await ctx.react("⌛");
        await ctx.reply(fmt("VIDEO", ["Downloading video..."]));

        const result = await resolveVideo(query, isYtUrl(query));

        if (!result) {
            await ctx.react("❌");
            return ctx.reply(fmt("VIDEO", [
                "Video download failed.",
                "Try another title or URL."
            ]));
        }

        try {
            await ctx.sock.sendMessage(ctx.from, {
                video: { url: result.url },
                mimetype: "video/mp4",
                caption: fmt("YOUTUBE VIDEO", [
                    `🎬 ${result.title || query}`,
                    result.duration ? `⏱ ${fmtDuration(result.duration)}` : null
                ])
            }, { quoted: ctx.mek });

            await ctx.react("✅");
        } catch (error) {
            console.log("[LUKA-XMD VIDEO]", error.message);
            await ctx.react("❌");
            await ctx.reply(fmt("VIDEO", ["Failed to send the video."]));
        }
    const
