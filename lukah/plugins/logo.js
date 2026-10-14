"use strict";

const sharp = require("sharp");
const { addCmd } = require("../../guru/handlers/loader");

const FOOTER = "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ";

const STYLES = {
    galaxy:    ["#08051d", "#8b5cf6", "#ffffff"],
    neon:      ["#020b16", "#00f5ff", "#ffffff"],
    gold:      ["#171006", "#ffc83d", "#fff0b0"],
    fire:      ["#240500", "#ff4500", "#ffffff"],
    "3d":      ["#111122", "#8294ff", "#ffffff"],
    silver:    ["#151515", "#c0c0c0", "#ffffff"],
    dragon:    ["#180404", "#ff2222", "#ffffff"],
    lion:      ["#241500", "#ffbd35", "#ffffff"],
    wolf:      ["#101820", "#8da9c4", "#ffffff"],
    cyberpunk: ["#16001f", "#ff00c8", "#00f5ff"],
    hacker:    ["#001000", "#00ff41", "#ffffff"],
    diamond:   ["#061c35", "#66e6ff", "#ffffff"],
    royal:     ["#16052e", "#d4af37", "#ffffff"],
    esport:    ["#100b29", "#ff3c78", "#ffffff"],
    mascot:    ["#171717", "#ff8a00", "#ffffff"],
    anime:     ["#200a30", "#ff6bd6", "#ffffff"],
    water:     ["#001d38", "#00c8ff", "#ffffff"],
    ice:       ["#061b32", "#b8f3ff", "#ffffff"],
    electric:  ["#171000", "#ffe600", "#ffffff"],
    nature:    ["#031b0b", "#4dff88", "#ffffff"],
    vintage:   ["#24180f", "#d7b98e", "#fff4dc"],
    minimal:   ["#111111", "#ffffff", "#ffffff"],
    abstract:  ["#180d2c", "#ff5f9e", "#ffffff"],
    chrome:    ["#111827", "#dce7f5", "#ffffff"],
    hologram:  ["#10052d", "#00f5ff", "#ff62d5"]
};

function escapeXml(text) {
    return text.replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
    })[char]);
}

function makeDecorations(style, accent) {
    let shapes = "";

    for (let i = 0; i < 45; i++) {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 600);
        const r = Math.random() * 2.5 + 0.5;

        shapes += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}"
            fill="${accent}" opacity="${(Math.random() * 0.7 + 0.2).toFixed(2)}"/>`;
    }

    if (style === "galaxy" || style === "hologram") {
        shapes += `
        <ellipse cx="500" cy="270" rx="350" ry="120"
            fill="none" stroke="${accent}" stroke-width="3"
            opacity=".65" transform="rotate(-15 500 270)"/>`;
    } else if (style === "fire" || style === "dragon") {
        for (let i = 0; i < 12; i++) {
            const x = 100 + i * 70;
            const y = 100 + Math.random() * 120;
            shapes += `<path d="M ${x} ${y + 80} L ${x + 20} ${y}
                L ${x + 40} ${y + 80}" fill="none"
                stroke="${accent}" stroke-width="3" opacity=".5"/>`;
        }
    } else if (style === "electric" || style === "cyberpunk") {
        shapes += `
        <path d="M100 150 L250 150 L210 210 L370 210
                 M630 390 L790 390 L750 450 L900 450"
            fill="none" stroke="${accent}" stroke-width="4"/>`;
    } else if (style === "diamond" || style === "ice") {
        shapes += `
        <path d="M500 80 L700 260 L500 440 L300 260 Z"
            fill="none" stroke="${accent}" stroke-width="3" opacity=".6"/>`;
    } else if (style === "nature") {
        shapes += `
        <path d="M120 420 Q200 250 330 300
                 Q250 430 120 420 M880 180 Q800 350 670 300
                 Q750 170 880 180"
            fill="none" stroke="${accent}" stroke-width="5"/>`;
    } else {
        shapes += `
        <path d="M100 160 L250 160 M750 440 L900 440"
            stroke="${accent}" stroke-width="3" opacity=".6"/>`;
    }

    return shapes;
}

function createLogo(name, style) {
    const [bg, accent, textColor] = STYLES[style];
    const title = escapeXml(name.toUpperCase());

    const fontSize = Math.min(
        100,
        Math.max(25, Math.floor(780 / Math.max(name.length, 1)))
    );

    const decorations = makeDecorations(style, accent);

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="1000" height="600" viewBox="0 0 1000 600">

      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="#050505"/>
        </linearGradient>

        <linearGradient id="textGradient">
          <stop offset="0%" stop-color="${textColor}"/>
          <stop offset="50%" stop-color="${accent}"/>
          <stop offset="100%" stop-color="${textColor}"/>
        </linearGradient>

        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <rect width="1000" height="600" fill="url(#background)"/>

      ${decorations}

      <text x="500" y="285" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="900"
        fill="url(#textGradient)" filter="url(#glow)"
        stroke="${accent}" stroke-width=".5">${title}</text>

      <line x1="250" y1="335" x2="750" y2="335"
        stroke="${accent}" stroke-width="3"/>

      <text x="500" y="390" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="bold"
        letter-spacing="6" fill="${textColor}">
        ${style.toUpperCase()} LOGO
      </text>

      <text x="500" y="550" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="19" fill="${accent}">
        ${FOOTER}
      </text>
    </svg>`;

    return Buffer.from(svg);
}

addCmd({
    name: "logo",
    aliases: ["makelogo", "textlogo"],
    desc: "Generate logos in 25 different styles",
    category: "tools",

    handler: async (ctx) => {
        const { args, reply } = ctx;

        if (!args || args.length < 2) {
            return reply(
                "LOGO GENERATOR\n\n" +
                "Usage: .logo <style> <name>\n\n" +
                "Available styles:\n" +
                Object.keys(STYLES).join(", ") +
                "\n\nExamples:\n" +
                ".logo galaxy LUKABRAND\n" +
                ".logo neon LUKA-XMD\n" +
                ".logo gold LUKA iT"
            );
        }

        const style = String(args[0]).toLowerCase();
        const name = args.slice(1).join(" ").trim();

        if (!STYLES[style]) {
            return reply(
                "Invalid logo style.\n\nAvailable styles:\n" +
                Object.keys(STYLES).join(", ")
            );
        }

        if (!name || name.length > 30) {
            return reply("Logo name must be between 1 and 30 characters.");
        }

        try {
            const socket =
                ctx.sock ||
                ctx.conn ||
                ctx.client ||
                global.sock ||
                global.conn;

            const chat =
                ctx.from ||
                ctx.chat ||
                ctx.jid;

            if (!socket || typeof socket.sendMessage !== "function" || !chat) {
                return reply(
                    "WhatsApp connection not found. Check your command loader's socket and chat fields."
                );
            }

            await reply("Generating your logo...");

            const image = await sharp(createLogo(name, style))
                .png()
                .toBuffer();

            await socket.sendMessage(chat, {
                image,
                caption:
                    `${name.toUpperCase()} LOGO\n` +
                    `Style: ${style.toUpperCase()}\n\n` +
                    FOOTER
            });
        } catch (error) {
            console.error("[LOGO ERROR]", error);
            await reply("Failed to generate logo. Check the server logs.");
        }
    }
});
