'use strict';

// ╭═══〘〘━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━〙〙═══╮
// ║  LUKA-XMD  ·  lukah/statusManager.js                                ║
// ║  Bridge/alias so plugins inside lukah/ can import:                          ║
// ║    require('../statusManager')                                              ║
// ║  and resolve to the real module at luka/handlers/statusManager.js           ║
// ║  Do NOT put business logic here — edit the real module instead.             ║
// ╰═══〘〘━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━〙〙═══╯
module.exports = require('../luka/handlers/statusManager');
