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

  // Dynasty Domain "Jeremiah Smith is RUINING Dynasty Leagues" — May 2026.
  // Source: https://www.youtube.com/watch?v=ZK5VpWQQveE
  // The 2027 class is being priced at peak-value LEVELS a year before the
  // draft (driven by Jeremiah Smith hype). Compared to where 2026 firsts
  // sat at the same point last year, 2027 firsts are well above the
  // historical "future 1st" baseline. That removes most of the upside
  // that future firsts normally carry for rebuilders.
  pick_class_premium: {
    "2027": {
      early: 0.385,   // +38.5% over historical baseline (KTC 7107 vs 5124)
      mid:   0.175,   // +17.5% over baseline (5628 vs 4790)
      late:  0.11,    // +11% over baseline (4905 vs 4420)
      note:  "Jeremiah Smith hype has pulled 27 first prices toward their ceiling a year early. Holding gets you mostly value maintenance, not gains. Sells should target contenders pre-deadline.",
      sourceVideo: "ZK5VpWQQveE",
      sourceTitle: "Jeremiah Smith is RUINING Dynasty Leagues",
    },
  },

  // Rookie pick hit-rate framework (also Dynasty Domain). "Hit" = sustains
  // dynasty-startable value for 2+ years. Use these to discount the expected
  // value of pick stockpiles when warning about over-concentration.
  pick_hit_rates: {
    // Round 1
    "early_1st_rb":    0.80,  // Top-3 RB takes (Jeremiah Love, Bijan, etc.)
    "early_1st_non_rb":0.65,  // Top-3 non-RB; ~65% sustain Cornerstone value
    "mid_1st":         0.50,  // 50-50 in the 1.04-1.08 range
    "late_1st":        0.35,  // Late 1sts are throwins as often as not
    "2nd":             0.20,
    "3rd_plus":        0.08,
  },

  // Value-share / production-share framework (Dynasty Domain). In a 12-team
  // league, average value share = 8.33%. A top cornerstone alone = ~2.5%
  // value share. Thresholds for classifying rebuild urgency / contender lock.
  share_framework: {
    league_avg: 1 / 12,                  // 8.33%
    cornerstone_share: 0.025,            // ~2.5% per elite asset
    contender_lock:   1 / 12 * 1.24,     // ~10.3% (top-2 expected)
    rebuild_floor:    1 / 12 * 0.72,     // ~6.0% (bottom-third)
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
    {
      id: "consolidation-candidate",
      when: (ctx) => ctx.same_tier_glut?.length >= 3,
      text: (ctx) => `You have ${ctx.same_tier_glut.length} same-tier ${ctx.same_tier_glut[0].pos}s blocking each other's snaps. Package 2-3 into one elite (consolidation premium ~10-15%, lineup gain greater). Targeting the counterparty's positional need closes faster.`
    },
    {
      id: "calendar-pre-rookie",
      when: (ctx) => {
        const m = new Date().getMonth();
        return m === 3 || m === 4; // April or May
      },
      text: () => `April-May = pick prices PEAK. Sellers' window. If you're contending, this is the most expensive month to acquire picks; sell now, buy back in Sept.`
    },
    {
      id: "calendar-summer-buy-low",
      when: (ctx) => {
        const m = new Date().getMonth();
        return m >= 5 && m <= 7; // Jun-Aug
      },
      text: () => `Jun-Aug = camp-injury / depth-chart anxiety creates buy-low windows. Hunt for owners panicking on news; their loss is your discount.`
    },
    {
      id: "rookie-draft-class-warning",
      when: (ctx) => ctx.weak_class_warning,
      text: () => `2026 rookie class is shallow past 1.07 per Domain. Past 1.06, picks are throwins. Don't pay 1QB-A prices for late 1sts.`
    },
    {
      id: "qb-wr-stack",
      when: (ctx) => ctx.stack_pairs?.length >= 1,
      text: (ctx) => {
        const s = ctx.stack_pairs[0];
        return `QB-${s.skill_pos} stack on roster: ${s.qb} + ${s.skill}. Stacks lift ceiling but raise variance. In head-to-head dynasty, this hurts your floor; consider trading one side for diversification unless you're ELITE-tier.`;
      }
    },

    // ---- Dynasty Domain "27 pick strategy" tips (May 2026) ----
    {
      id: "27-pick-overconcentration",
      when: (ctx) => (ctx.future_first_count_27 || 0) >= 3,
      text: (ctx) => `${ctx.future_first_count_27} × 2027 firsts on this roster. Per Dynasty Domain: 27s are already 38% above the historical "future 1st" baseline (Jeremiah Smith hype). Holding all of them is value-maintenance, not value-building. Shop 1-2 to contenders before season for max return.`
    },
    {
      id: "27-late-1st-sell-window-contender",
      when: (ctx) => ctx.stance === 'contend' && (ctx.late_first_count_27 || 0) >= 1,
      text: () => `You're contending and own a 27 late 1st. Late 27s are near their value ceiling (only +11% vs prior class at same point). Cash now for a proven WR/RB who plays this season; the late 1st won't gain meaningful value before your window closes.`
    },
    {
      id: "rebuild-pick-ceiling-warning",
      when: (ctx) => ctx.stance === 'rebuild' && (ctx.future_first_count_27 || 0) >= 2 && (ctx.upside_premier_count || 0) <= 2,
      text: () => `Hard rebuild + heavy 27 firsts + few Upside Premier holdings. Per Dynasty Domain: rebuilds need value GROWTH, not value maintenance. 27s are near peak; redirect 1-2 firsts toward injured cornerstones (Nabers-type) or young Upside Premier where ceiling is uncapped.`
    },
    {
      id: "pick-liquidity-warning",
      when: (ctx) => (ctx.pick_value_share || 0) > 0.35,
      text: (ctx) => `${Math.round((ctx.pick_value_share || 0) * 100)}% of your dynasty value sits in future picks. Per Dynasty Domain: tank teams who load up on 27s have zero in-season liquidity. You can't make a move that changes your roster until rookie season. Convert one pick to a player NOW.`
    },
    {
      id: "value-share-contender-lock",
      when: (ctx) => (ctx.value_share || 0) >= 0.103 && ctx.stance !== 'contend',
      text: (ctx) => `Your value share is ${(ctx.value_share * 100).toFixed(1)}% (top-2 in league). Per Dynasty Domain framework: you should be contending now, not reloading. Production share lagging value share means you're sitting on assets instead of fielding them.`
    },
  ],

  // Rebuild timeline (RotoWire 3-year arc applied + author's actual results).
  // Each phase has a recommended posture and a trigger to advance.
  rebuild_phases: {
    "phase_1_teardown": {
      label: "Phase I, Teardown",
      year: 1,
      posture: "Sell every veteran with trade value for picks and youth.",
      trigger_in: "Just finished a championship run with aging core, OR mid-season collapse revealed depth issues.",
      trigger_out: "Roster contains 4+ Cornerstone-A or Foundational players under 24, AND 4+ first-round picks across the next 2 cycles.",
    },
    "phase_2_restock": {
      label: "Phase II, Restock",
      year: 2,
      posture: "Use accumulated picks aggressively. Avoid 3rd+ round picks (obsolete by Phase IV).",
      trigger_in: "Phase I exit, OR strong young core developing.",
      trigger_out: "2+ Cornerstones healthy + 1+ Foundational starter at every position.",
    },
    "phase_3_reassess": {
      label: "Phase III, Reassess",
      year: 3,
      posture: "If pieces align, pivot toward contention. If not, run Phase II again with refreshed picks.",
      trigger_in: "Phase II exit.",
      trigger_out: "Top-3 league-strength rank achievable with one consolidation trade.",
    },
    "phase_4_just_win": {
      label: "Phase IV, Just Win",
      year: 4,
      posture: "Aggressive contention. Trade 2027+ picks for proven starters. Cash in.",
      trigger_in: "Phase III exit confirmed contention window.",
      trigger_out: "Champions, OR core ages out and you start the cycle over.",
    },
  },

  // Consolidation rules. 2-for-1 trades (or 3-for-1) are justified by
  // positional scarcity + the consolidation premium: one elite > 2-3 mids
  // because lineups have finite slots and depth past the bench rarely starts.
  consolidation: {
    when_to_consolidate: [
      "Have 3+ same-tier players at a single position (RB or WR specifically).",
      "Sitting on multiple late-1st or 2nd-round picks during a contention window.",
      "Have depth pieces blocking each other's starting opportunities.",
      "Your starting lineup has a clear hole an elite would fill.",
    ],
    when_to_decline: [
      "The single elite returning is aging past their position-curve sell-window.",
      "You're paying premium for someone with multi-year injury history.",
      "The 2-for-1 weakens an already-thin position to fill a less-needed slot.",
      "The 'elite' is propped up by an unsustainable touchdown rate (40%+ of points from TDs).",
    ],
    premium_rule_of_thumb: "Pay roughly 110-115% of the ledger-value sum to receive a single tier-up player. The extra 10-15% is the consolidation premium.",
  },

  // Trade execution tactics. Research-counterparty principle scoped tightly.
  execution: [
    "Research counterparty's roster BEFORE making an offer. Address THEIR need, not your surplus.",
    "Don't propose lopsided trades. Resentment + league rule changes are real costs.",
    "Wait for the right offer; impatience is the most expensive mistake in dynasty.",
    "Evaluate the upcoming draft class before trading future picks. Strong class = hold; weak class = sell early.",
    "Don't auto-sell a breakout player at peak value mid-season if you're contending. Hold for the run.",
    "Avoid players whose recent fantasy output is 40%+ touchdowns. Touchdown variance kills trade value next year.",
  ],

  // Calendar awareness. Pick liquidity peaks just before rookie drafts.
  calendar: {
    "Apr-May": "Pick prices PEAK. Sellers maximum, buyers underwater. Ideal window to sell 2026 picks for proven players.",
    "Jun-Aug": "Trade frenzy slows. Use this window for buy-low on perceived risk (training-camp injury, depth-chart concern).",
    "Sep-Dec": "In-season buy-low window. Contenders buy starters at premiums; rebuilders dump aging vets for picks.",
    "Jan-Mar": "Winners cash in by selling Year-N starters; losers begin pick-accumulation.",
  },

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
    "Consolidate same-tier depth into one elite. The premium is 10-15%; the lineup gain is more.",
    "Address the counterparty's need, not your surplus, when proposing a trade.",
    "Don't pay for fantasy production that's 40%+ touchdown-derived. Variance will eat the gain.",
    "Once a rebuild starts, sell aggressively in Year 1, restock in Year 2, reassess Year 3.",
    "Most fantasy managers try to make one last run after the one last run. Don't.",
    "QB-WR same-team stacks raise ceiling but increase variance. In head-to-head dynasty, prefer diversification unless your roster is ELITE-tier.",
    "Top-4 QB performance has 40% probability of top-4 WR1 performance. Useful in best-ball; risky in head-to-head.",
  ],
};
