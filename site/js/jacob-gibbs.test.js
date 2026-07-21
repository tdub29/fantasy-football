const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('site/data/jacob-gibbs.js', 'utf8'), context);
const data = context.window.JACOB_GIBBS_RANKINGS;

assert.equal(data.source, 'Jacob Gibbs via FantasyPros');
assert.equal(data.format, 'redraft_half_ppr');
assert.equal(data.updatedAt, '2026-07-20');
assert.equal(data.players[0].name, 'Jahmyr Gibbs');
assert.equal(data.players[0].rank, 1);
assert.equal(data.players[0].posRank, 1);
assert.equal(data.players.length, 315);
assert(data.players.every(player => ['QB', 'RB', 'WR', 'TE'].includes(player.pos)));
assert(data.players.every(player => player.sleeperId));
assert.equal(new Set(data.players.map(player => player.rank)).size, data.players.length);

const app = fs.readFileSync('site/js/app.js', 'utf8');
assert(app.includes('function jacobGibbsCell('));
assert(app.includes("'Gibbs ' + jacobGibbsDateLabel()"));
assert.equal((app.match(/^\s+jacobGibbsHeader\(\),$/gm) || []).length, 5);
assert.equal((app.match(/^\s+jacobGibbsCell\(/gm) || []).length, 6);
assert(app.includes("sortHdr('gibbs'"));
console.log(`ok: ${data.players.length} dated Jacob Gibbs half-PPR ranks loaded`);
