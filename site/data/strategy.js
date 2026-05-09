// Dynasty trade-strategy playbook. Curated rules from public dynasty content
// (FantasyPros startup strategy 2026, Apex Fantasy peak-age studies, Dynasty
// Nerds 2-3-year window, Belichick "year too early" principle). Each rule has
// a "when" predicate the site can evaluate against a roster's classification
// and a short narrative the UI can surface contextually.
//
// Sources (kept here for the About page):
//   - https://www.fantasypros.com/2026/04/dynasty-fantasy-football-startup-draft-strategy-expert-tips-to-build-a-long-term-contender-2026/
//   - https://www.fantasypros.com/2026/05/fantasy-football-rankings-dynasty-trade-value-chart-may-2026-update/
//   - https://apexfantasyleagues.com/peak-age-nfl-running-back/
//   - https://apexfantasyleagues.com/peak-age-for-nfl-wide-receiver/
//   - https://www.dynastynerds.com/strategy/dynasty-trade-secrets-2-3-year-window/

window.STRATEGY = {
  // Position age-curve thresholds, derived from Apex Fantasy peak-age studies.
  // peak_avg = empirical average peak age across the modern era.
  // sell_age = the "trade a year too early" age. Once a player crosses this
  //   age and is NOT a Cornerstone, they belong on the sell list.
  // hard_sell_age = age past which value typically collapses; sell at any cost.
  age_curve: {
    QB:  { peak_avg: 28, sell_age: 31, hard_sell_age: 35 },   // QBs age slowest
    RB:  { peak_avg: 25, sell_age: 26, hard_sell_age: 28 },   // RB cliff is steep
    WR:  { peak_avg: 26, sell_age: 28, hard_sell_age: 31 },   // WR decline is gradual
    TE:  { peak_avg: 27, sell_age: 30, hard_sell_age: 32 },   // TE breakouts late
  },

  // Pick valuations (1QB), distilled from FantasyPros Trade Value Chart May 2026.
  // Use these to evaluate trades that include picks. Numbers are in our 0-100ish
  // tier-value scale, calibrated so 1.01 ~= a Cornerstone-A asset.
  pick_values_1qb: {
    "1.01": 90, "1.02": 80, "1.03": 70,
    "1.04": 58, "1.05": 53, "1.06": 48,
    "1.07": 46, "1.08": 42, "1.09": 38, "1.10": 36, "1.11": 35, "1.12": 34,
    "2.01": 32, "2.02": 30, "2.03": 28, "2.04": 27, "2.05": 26,
    "2.06": 25, "2.07": 24, "2.08": 23, "2.09": 22, "2.10": 22, "2.11": 21, "2.12": 21,
    "3.early": 16, "3.mid": 13, "3.late": 10,
    "4.early": 8, "4.mid": 6, "4.late": 4,
    "future_1.early": 65, "future_1.mid": 45, "future_1.late": 30,
    "future_2.early": 22, "future_2.mid": 18, "future_2.late": 14,
  },

  // Superflex bumps on QB-eligible picks (from FantasyPros chart). Apply
  // these to early-round picks where SF leagues spike pricing.
  pick_sf_premium: {
    "1.01": 4, "1.02": 4, "1.03": 4, "1.04": 3, "1.05": 3, "1.06": 3,
    "1.07": 2, "1.08": 2, "1.09": 2, "1.10": 1, "1.11": 1, "1.12": 1,
  },

  // Coaching tips. Surfaced based on roster stance / state. Each rule has
  // `id`, `when({ stance, archetype, valueTier, surplus, depreciating, league })`,
  // and `text` to render. Order in the list = display priority.
  coaching_tips: [
    {
      id: "year-too-early",
      when: (ctx) => ctx.depreciating?.length >= 1,
      text: (ctx) => `Belichick rule: trade a year too early, not too late. ${ctx.depreciating[0].name} (age ${ctx.depreciating[0].age}) is past the curve and will lose value YoY. Move now.`
    },
    {
      id: "rb-sell-window",
      when: (ctx) => ctx.aging_rb?.length >= 1,
      text: (ctx) => {
        const rb = ctx.aging_rb[0];
        return `RB peak ages 22-28; sell window is 25-26. ${rb.name} is ${rb.age}. Empirically, only 19% of RBs sustain peak for 5+ seasons.`;
      }
    },
    {
      id: "wr-sell-window",
      when: (ctx) => ctx.aging_wr?.length >= 1,
      text: (ctx) => {
        const wr = ctx.aging_wr[0];
        return `WR value peaks BEFORE production drops. ${wr.name} is ${wr.age}; the 2010+ data says 5.7% of peak seasons are post-32. Sell ahead of consensus.`;
      }
    },
    {
      id: "contender-window",
      when: (ctx) => ctx.stance === 'contend',
      text: () => `2-3 year contention window. Trade futures (picks, age <23 stashes) for proven starters who fit the window. Value rookies at the lowest premium they will hit all year (post-draft hangover).`
    },
    {
      id: "rebuild-buying",
      when: (ctx) => ctx.stance === 'rebuild',
      text: () => `Pick value peaks just BEFORE rookie drafts (May). Stack 2027 1sts now. Avoid aging vets even on discount; they decay before your window opens.`
    },
    {
      id: "reload-pivot",
      when: (ctx) => ctx.stance === 'reload',
      text: () => `Reload roster: pick a direction. Either consolidate two startable mids into one elite (uptier toward contend), or sell aging vets for picks (pivot toward rebuild). Sitting middle is the worst seat.`
    },
    {
      id: "rb-heavy-warning",
      when: (ctx) => ctx.archetype === 'RB HEAVY',
      text: () => `RB-heavy rosters age fastest. RB cliff hits at 28; you have a narrower championship window than your raw value implies. Spend RB surplus on locking up a young WR.`
    },
    {
      id: "stars-and-scrubs",
      when: (ctx) => ctx.archetype === 'STARS & SCRUBS',
      text: () => `Stars & scrubs is fragile to one injury. Move a depth pick or two for a 4th startable piece. Top-3 carrying 55%+ of value means a single injury breaks the lineup.`
    },
    {
      id: "superflex-qb-priority",
      when: (ctx) => ctx.league?.is_superflex && ctx.surplus?.QB?.surplus < 0,
      text: () => `Superflex QB shortage is the most painful hole in dynasty. Top-12 QBs are scarce and almost never traded; expect to overpay relative to a 1QB league.`
    },
    {
      id: "te-premium-window",
      when: (ctx) => ctx.te_breakout?.length >= 1,
      text: (ctx) => `TE breakouts often come at age 25-27 (Kelce, Kittle, McBride). ${ctx.te_breakout[0].name} (${ctx.te_breakout[0].age}) is in that band; treat this as a hold-not-sell window.`
    },
    {
      id: "contender-no-rookies",
      when: (ctx) => ctx.stance === 'contend' && ctx.rookie_count >= 3,
      text: (ctx) => `${ctx.rookie_count} rookies on a contending roster is ammo, not roster fit. Bundle 2-3 rookies + a future 1st for one proven starter who plays now.`
    },
    {
      id: "rebuild-no-old-vets",
      when: (ctx) => ctx.stance === 'rebuild' && ctx.aging_count >= 2,
      text: (ctx) => `${ctx.aging_count} players past their position curve on a rebuild. Each declining vet still has trade value to a contender; don't roster-rot, sell.`
    },
  ],

  // Asset hierarchy (FantasyPros startup): "walk away with the most valuable
  // assets, not the best lineup." Used in About / Strategy explainer.
  principles: [
    "Walk away from a startup with the most valuable assets, not the best Week-1 lineup.",
    "Trade down in early rounds when same-tier players remain.",
    "Anchor on young elite talent at premium positions; build depth at WR/TE/QB.",
    "Avoid loading exclusively at RB early. The cliff is real.",
    "Belichick rule: trade a year too early, not too late.",
    "Pick value peaks just before rookie drafts. Buy Sept-Dec, sell April-May.",
    "RB sell window: 25-26. WR sell window: before 30. TE: before 31.",
    "2-3 year contention windows beat infinite-window thinking.",
    "Cornerstones are the exception to every age rule. Hold them.",
    "In Superflex, top-12 QBs are the most illiquid asset in the game.",
  ],
};
