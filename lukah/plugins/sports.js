'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const config = require('../../luka/config/settings');

const API_KEY = process.env.FOOTBALL_API_KEY;
const API_BASE = 'https://v3.football.api-sports.io';

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

async function footballRequest(endpoint, params = {}) {
    if (!API_KEY) {
        throw new Error(
            'Football API key is missing. Set FOOTBALL_API_KEY in your environment.'
        );
    }

    const { data } = await axios.get(`${API_BASE}/${endpoint}`, {
        params,
        headers: {
            'x-apisports-key': API_KEY
        },
        timeout: 20000
    });

    if (data.errors && Object.keys(data.errors).length) {
        throw new Error(JSON.stringify(data.errors));
    }

    return data.response || [];
}

function formatDate(date) {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString('en-GB', {
        timeZone: 'Africa/Dar_es_Salaam',
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function formatMatch(match) {
    const home = match.teams?.home?.name || 'Home';
    const away = match.teams?.away?.name || 'Away';
    const goals = match.goals || {};
    const status = match.fixture?.status?.short || 'NS';
    const score = goals.home == null || goals.away == null
        ? 'vs'
        : `${goals.home} - ${goals.away}`;

    return `⚽ ${home} ${score} ${away}\n📅 ${formatDate(match.fixture?.date)}\n🔴 Status: ${status}`;
}

async function replyList(ctx, title, items, formatter) {
    if (!items.length) {
        return ctx.reply(`No information found.\n\n${FOOTER}`);
    }

    const body = items.slice(0, 10).map(formatter).join('\n\n');

    return ctx.reply(
        `╭━━〔 ${title} 〕━━╮\n\n${body}\n\n╰━━━━━━━━━━━━━━╯\n${FOOTER}`
    );
}

function register(name, aliases, desc, handler) {
    addCmd({
        name,
        aliases,
        desc,
        category: 'sports',
        async handler(ctx) {
            try {
                await handler(ctx);
            } catch (error) {
                console.error(`[sports:${name}]`, error.message);
                await ctx.reply(
                    `❌ Unable to retrieve sports data.\n${error.message}\n\n${FOOTER}`
                );
            }
        }
    });
}

// 1. Live Football Scores
register('livescore', ['livefootball', 'livescores'], 'Get live football scores', async (ctx) => {
    const matches = await footballRequest('fixtures', {
        live: 'all'
    });

    await replyList(ctx, 'LIVE FOOTBALL SCORES', matches, formatMatch);
});

// 2. Upcoming Fixtures
register('fixtures', ['matches', 'upcoming'], 'Get upcoming football fixtures', async (ctx) => {
    const args = ctx.args || [];
    const league = args[0];
    const params = {
        next: 10
    };

    if (league && /^\d+$/.test(league)) {
        params.league = league;
    }

    const matches = await footballRequest('fixtures', params);

    await replyList(ctx, 'UPCOMING FIXTURES', matches, formatMatch);
});

// 3. Recent Results
register('results', ['recentresults', 'footballresults'], 'Get recent football results', async (ctx) => {
    const matches = await footballRequest('fixtures', {
        last: 10
    });

    await replyList(ctx, 'RECENT RESULTS', matches, formatMatch);
});

// 4. League Standings
register('standings', ['table', 'leaguetable'], 'Get league standings by league ID and season', async (ctx) => {
    const args = ctx.args || [];
    const leagueId = args[0];
    const season = args[1] || new Date().getFullYear();

    if (!leagueId || !/^\d+$/.test(leagueId)) {
        return ctx.reply(
            'Usage: .standings <league_id> [season]\nExample: .standings 39 2026\n\nFind the correct league ID from your football API provider.'
        );
    }

    const data = await footballRequest('standings', {
        league: leagueId,
        season
    });

    const league = data[0]?.league;
    const table = league?.standings?.[0] || [];

    const body = table.slice(0, 20).map((team) =>
        `${team.rank}. ${team.team.name} — ${team.points} pts | Played: ${team.all.played} | GD: ${team.goalsDiff}`
    ).join('\n');

    await ctx.reply(
        `🏆 *${league?.name || 'LEAGUE STANDINGS'}*\n\n${body || 'No standings found.'}\n\n${FOOTER}`
    );
});

// 5. Football News
register('footballnews', ['soccernews', 'sportsnews'], 'Get recent football news', async (ctx) => {
    const { data } = await axios.get('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news', {
        timeout: 20000
    });

    const articles = data.articles || [];

    if (!articles.length) {
        return ctx.reply(`No football news available right now.\n\n${FOOTER}`);
    }

    const body = articles.slice(0, 7).map((article, index) =>
        `${index + 1}. ${article.headline}\n${article.links?.web?.href || ''}`
    ).join('\n\n');

    await ctx.reply(`📰 *FOOTBALL NEWS*\n\n${body}\n\n${FOOTER}`);
});

// 6. Search a Team
register('team', ['footballteam', 'club'], 'Search for a football team', async (ctx) => {
    const name = (ctx.args || []).join(' ').trim();

    if (!name) {
        return ctx.reply('Usage: .team <team name>\nExample: .team Arsenal');
    }

    const teams = await footballRequest('teams', {
        search: name
    });

    await replyList(ctx, 'TEAM SEARCH', teams, (item) =>
        `🏟️ ${item.team.name}\n🌍 Country: ${item.team.country || 'Unknown'}\n🏆 Founded: ${item.team.founded || 'Unknown'}\n🏟️ Venue: ${item.venue?.name || 'Unknown'}`
    );
});

// 7. Search a Player
register('player', ['footballplayer', 'players'], 'Search for a football player', async (ctx) => {
    const name = (ctx.args || []).join(' ').trim();

    if (!name) {
        return ctx.reply('Usage: .player <player name>\nExample: .player Lionel Messi');
    }

    const players = await footballRequest('players', {
        search: name,
        season: new Date().getFullYear()
    });

    await replyList(ctx, 'PLAYER SEARCH', players, (item) => {
        const player = item.player || {};
        const stats = item.statistics?.[0] || {};

        return `👤 ${player.name || 'Unknown'}\n🌍 Nationality: ${player.nationality || 'Unknown'}\n🎂 Age: ${player.age || 'Unknown'}\n🏟️ Club: ${stats.team?.name || 'Unknown'}\n⚽ Goals: ${stats.goals?.total ?? 0}`;
    });
});
