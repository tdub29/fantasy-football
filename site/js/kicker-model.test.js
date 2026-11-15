const assert = require('node:assert/strict');
const K = require('./kicker-model.js');
const settings = {fgm_0_19:3,fgm_20_29:3,fgm_30_39:3,fgm_40_49:4,fgm_50p:5,xpm:1,fgmiss:-1,xpmiss:-1};
const board = {schemaVersion:2,boardId:'one',season:2026,week:10,scoring:K.scoring(settings),kickers:[{name:'A.Kicker',team:'LA',exp:8.2}]};
const request = {season:2026,week:10,settings,pid:'100',playerTeam:'LAR',resolveId:()=>'100'};
assert.equal(K.lookup(board,request).exp,8.2);
for (const change of [{week:9},{season:2025},{playerTeam:'KC'},{settings:{...settings,fgmiss:0}},{settings:{...settings,fgm_yds_over_30:.1}}]) {
  assert.equal(K.lookup(board,{...request,...change}),null);
}
assert.equal(K.lookup({...board,schemaVersion:1},request),null);
assert.equal(K.lookup({...board,kickers:[...board.kickers,...board.kickers]},request),null);
assert.equal(K.lookup({...board,kickers:[{...board.kickers[0],exp:null}]},request),null);
assert.equal(K.lookup({...board,week:11},{...request,week:11}).exp,8.2); // no stale cache
console.log('kicker identity/scoring guards passed');
