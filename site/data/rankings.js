// Rankings data — each "source" is a YouTuber/analyst's ranking set.
// Categories: cornerstone, foundational, upside_premier, mainstay, productive_vet, short_term
// Tiers within each category: S, A, B, C, D (S = highest)
// Notes captured from the source for each player.

window.RANKINGS_SOURCES = [
  {
    id: "domain-dynasty",
    name: "Domain Dynasty",
    handle: "@thedynastydomain",
    url: "https://www.youtube.com/@thedynastydomain",
    color: "#0d9488",
    description: "Created the player-category system (Cornerstone / Foundational / Upside Premier). Hosts: Nathan + co.",
    rankings: [
      {
        id: "domain-cornerstones-2026-05",
        title: "NEW Dynasty Cornerstone + Foundational Rankings (w/2026 Rookies)",
        url: "https://www.youtube.com/watch?v=-HGAWo8v8dY",
        publishedAt: "2026-05",
        format: "dynasty_1qb",
        defaultEnabled: true,
        players: [
          // ===== CORNERSTONE =====
          // S Tier
          {name:"Josh Allen", pos:"QB", team:"BUF", age:29, category:"cornerstone", tier:"S", note:"QB1 last yr, 17 GP each of last 5 yrs, head and shoulders above the rest"},
          {name:"Drake Maye", pos:"QB", team:"NE", age:23, category:"cornerstone", tier:"S", note:"359 pts, 15 behind Allen; one MVP vote shy. Rushing upside + 4400/31 passing"},
          {name:"Ja'Marr Chase", pos:"WR", team:"CIN", age:26, category:"cornerstone", tier:"S", note:"Elite upside; needs Burrow healthy"},
          {name:"Jaxon Smith-Njigba", pos:"WR", team:"SEA", age:23, category:"cornerstone", tier:"S", note:"WR2 overall last yr; 1800 yds, 10 TD; efficiency may regress but still S-tier"},
          {name:"Puka Nacua", pos:"WR", team:"LAR", age:24, category:"cornerstone", tier:"S", note:"Off-field + health are only knocks; could be 1.01 without them"},
          {name:"Bijan Robinson", pos:"RB", team:"ATL", age:24, category:"cornerstone", tier:"S", note:"Going 1.01 in most startups; CMC profile at 24"},
          {name:"Jahmyr Gibbs", pos:"RB", team:"DET", age:24, category:"cornerstone", tier:"S", note:"Top-3 RB last 2 yrs; Montgomery gone now"},

          // A Tier
          {name:"Justin Jefferson", pos:"WR", team:"MIN", age:27, category:"cornerstone", tier:"A", note:"Bounce-back year w/ Kyler Murray"},
          {name:"Malik Nabers", pos:"WR", team:"NYG", age:22, category:"cornerstone", tier:"A", note:"ACL+meniscus rehab; tied to Jaxson Dart, only 22"},
          {name:"Jeremiyah Love", pos:"RB", team:"ARI", age:22, category:"cornerstone", tier:"A", note:"2026 rookie, 3rd overall. Jeanty/Bijan/Saquon-tier prospect profile", rookie:true},
          {name:"Lamar Jackson", pos:"QB", team:"BAL", age:29, category:"cornerstone", tier:"A", note:"Long sample of elite production"},
          {name:"Jayden Daniels", pos:"QB", team:"WAS", age:25, category:"cornerstone", tier:"A", note:"Outside S only because of injury-driven regression"},
          {name:"Ashton Jeanty", pos:"RB", team:"LV", age:22, category:"cornerstone", tier:"A", note:"Neck-and-neck w/ Love; new playcaller Clint Kubiak"},
          {name:"Amon-Ra St. Brown", pos:"WR", team:"DET", age:26, category:"cornerstone", tier:"A", note:"Most consistent WR in dynasty; top-3 last 4 yrs"},

          // B Tier
          {name:"Brock Bowers", pos:"TE", team:"LV", age:23, category:"cornerstone", tier:"B", note:"TE1 in his own tier; Mendoza/Cousins is QB upgrade"},
          {name:"CeeDee Lamb", pos:"WR", team:"DAL", age:27, category:"cornerstone", tier:"B", note:"Slid because Pickens is taking TDs"},
          {name:"Drake London", pos:"WR", team:"ATL", age:24, category:"cornerstone", tier:"B", note:"Top-10 capital, 24 yo; WR2 per game in 12 GP last yr"},
          {name:"De'Von Achane", pos:"RB", team:"MIA", age:24, category:"cornerstone", tier:"B", note:"Bet on situation-proof post-McDaniel/Tua"},
          {name:"Omarion Hampton", pos:"RB", team:"LAC", age:22, category:"cornerstone", tier:"B", note:"Full-season upside if Chargers commit to volume"},

          // C Tier
          {name:"Trey McBride", pos:"TE", team:"ARI", age:26, category:"cornerstone", tier:"C", note:"League-breaking TE-prem upside; below Bowers due to age + offense competition"},
          {name:"Joe Burrow", pos:"QB", team:"CIN", age:29, category:"cornerstone", tier:"C", note:"Must stay healthy or drops to Foundational"},
          {name:"Caleb Williams", pos:"QB", team:"CHI", age:24, category:"cornerstone", tier:"C", note:"Mid-1st is too high; Daniels-style fall risk"},
          {name:"Patrick Mahomes", pos:"QB", team:"KC", age:30, category:"cornerstone", tier:"C", note:"Borderline foundational; less fantasy-friendly offense recently"},

          // ===== FOUNDATIONAL =====
          // S Tier
          {name:"Tetairoa McMillan", pos:"WR", team:"CAR", age:22, category:"foundational", tier:"S", note:"Loved as a talent; one more productive year gets him to Cornerstone, but the big breakout may be a year-3 story tied to Bryce Young's efficiency and volume"},

          // A Tier
          {name:"Carnell Tate", pos:"WR", team:"TEN", age:21, category:"foundational", tier:"A", note:"2026 rookie, top-5 capital, paired with Cam Ward. Could be Cornerstone next yr", rookie:true},
          {name:"George Pickens", pos:"WR", team:"DAL", age:25, category:"foundational", tier:"A", note:"WR5 last yr; long-term value depends on staying in DAL (franchise-tagged)"},
          {name:"Jaxson Dart", pos:"QB", team:"NYG", age:22, category:"foundational", tier:"A", note:"Favorite QB in Foundational; rushing profile mirrors Maye's"},

          // B Tier
          {name:"Jordan Tyson", pos:"WR", team:"NO", age:22, category:"foundational", tier:"B", note:"2026 rookie. Saints invested heavily in WR room around Shough", rookie:true},
          {name:"Garrett Wilson", pos:"WR", team:"NYJ", age:25, category:"foundational", tier:"B", note:"Perfect Foundational definition; consistent floor through bad QB play"},
          {name:"Rashee Rice", pos:"WR", team:"KC", age:25, category:"foundational", tier:"B", note:"Fell from cornerstones; settled around startup 3rd"},
          {name:"James Cook", pos:"RB", team:"BUF", age:26, category:"foundational", tier:"B", subtype:"depreciating_pillar", note:"Depreciating pillar; turning 27, system unchanged under Joe Brady"},

          // C Tier
          {name:"Jonathan Taylor", pos:"RB", team:"IND", age:27, category:"foundational", tier:"C", subtype:"depreciating_pillar", note:"Final third of career; turning 28"},
          {name:"Bo Nix", pos:"QB", team:"DEN", age:25, category:"foundational", tier:"C", note:"QB7 each of last 2 yrs; already 26 going on 27"},
          {name:"Justin Herbert", pos:"QB", team:"LAC", age:27, category:"foundational", tier:"C", note:"Promising 2-3 yr window w/ Mike McDaniel as OC + new weapons"},
          {name:"Colston Loveland", pos:"TE", team:"CHI", age:22, category:"foundational", tier:"C", note:"Most unproven Foundational; finished last yr strong. DD's most-confident Chicago pass-catcher to 'go baller' in year two, near-lock to produce"},

          // D Tier
          {name:"Jalen Hurts", pos:"QB", team:"PHI", age:27, category:"foundational", tier:"D", subtype:"depreciating_pillar", note:"Depreciating pillar; passing regressed but rushing floor keeps QB1 finishes"},
          {name:"Nico Collins", pos:"WR", team:"HOU", age:26, category:"foundational", tier:"D", subtype:"depreciating_pillar", note:"Depreciating pillar; chronic hamstring issues; contender-only hold"},
          {name:"Brock Purdy", pos:"QB", team:"SF", age:26, category:"foundational", tier:"D", note:"Shanahan offense + CMC + KD returning; just needs health"},
          {name:"Trevor Lawrence", pos:"QB", team:"JAX", age:26, category:"foundational", tier:"D", note:"Liam Coen offense, rebuilt receiving corps, rushing floor"},

          // ===== UPSIDE PREMIER =====
          // S Tier (most likely to move up to Foundational)
          {name:"Ladd McConkey", pos:"WR", team:"LAC", age:24, category:"upside_premier", tier:"S"},
          {name:"Quinshon Judkins", pos:"RB", team:"CLE", age:22, category:"upside_premier", tier:"S"},
          {name:"TreVeyon Henderson", pos:"RB", team:"NE", age:22, category:"upside_premier", tier:"S"},
          {name:"Emeka Egbuka", pos:"WR", team:"TB", age:23, category:"upside_premier", tier:"S", note:"Breakout likely (Evans gone, more Z, target bump), but value already priced in — DeVonta Smith comp, capped-ceiling 'maintain' guy. Contender hold, not a rebuild value-grower"},

          // Mid Tier (alphabetical within tier; intra-tier order from transcript was unclear past these)
          {name:"Rome Odunze", pos:"WR", team:"CHI", age:23, category:"upside_premier", tier:"A", note:"Good year expected, but ceiling capped by a crowded Chicago room (Burden, Loveland, Caleb). Not dead — was hurt and poorly used in year one"},
          {name:"Marvin Harrison Jr.", pos:"WR", team:"ARI", age:23, category:"upside_premier", tier:"A", note:"DeVonta-Smith-style production jump almost certainly coming, but value is capped — already ~WR10 on KTC with little room to grow. Believe in the player, not the price"},
          {name:"Luther Burden III", pos:"WR", team:"CHI", age:22, category:"upside_premier", tier:"A", note:"DD's favorite sophomore breakout — better positioned to jump than McMillan, and price has finally settled to a buy (~5th-rd ADP). Tier-2 WR ceiling (not Amon-Ra/Puka); Ben Johnson fit, plays inside and out"},
          {name:"Fernando Mendoza", pos:"QB", team:"LV", age:22, category:"upside_premier", tier:"A", note:"2026 rookie QB, Raiders. Bowers' new QB.", rookie:true},
          {name:"Tyler Warren", pos:"TE", team:"IND", age:23, category:"upside_premier", tier:"A"},
          {name:"Bucky Irving", pos:"RB", team:"TB", age:23, category:"upside_premier", tier:"A"},
          {name:"Cam Skattebo", pos:"RB", team:"NYG", age:24, category:"upside_premier", tier:"A"},
          {name:"Brian Thomas Jr.", pos:"WR", team:"JAX", age:23, category:"upside_premier", tier:"A"},
          // Surfaced in the May '26 "These WRs Are About To Break Dynasty Leagues" video (Ve5iZKAjn4Y)
          {name:"Travis Hunter", pos:"WR", team:"JAX", age:23, category:"upside_premier", tier:"A", note:"Smash buy at ~9th-round price. Best reception-perception of his rookie class; ascending before injury (24 PPR pts, 100 yds in his final game). Two-way role caps the ceiling and confidence, but he can still play ~80% of WR snaps — high-ceiling rebuild/reload shot"},
          {name:"Matthew Golden", pos:"WR", team:"GB", age:22, category:"upside_premier", tier:"B", note:"Traitsy first-round project, but Green Bay spreads targets ('gross simple') and a year-two breakout is unlikely — more a year-three bet. Cheap reload/future stash that should at least maintain"}
        ]
      },
      // ===== Rookie-only set, post-NFL-draft. Folded into main aggregation =====
      // (toggle off in #sources if rookie-list ranks bias the main view too much).
      {
        id: "domain-rookies-2026-postdraft",
        title: "2026 Rookie Rankings (Post NFL Draft)",
        url: "https://www.youtube.com/watch?v=CwBKU26DVQY",
        publishedAt: "2026-05",
        format: "rookie_only",
        defaultEnabled: true,
        players: [
          // S
          {name:"Jeremiyah Love", pos:"RB", team:"ARI", age:22, category:"cornerstone", tier:"A", note:"1.01 in rookie drafts. Top-3 NFL pick. Bakery-elite RB profile.", rookie:true},
          // A (top 3 WRs)
          {name:"Carnell Tate", pos:"WR", team:"TEN", age:21, category:"foundational", tier:"A", note:"1.02. WR1 future for Cam Ward in Brian Callahan offense.", rookie:true},
          {name:"Jordyn Tyson", pos:"WR", team:"NO", age:21, category:"foundational", tier:"B", note:"WR2 in NO behind Olave for now. Tyler Shough + Kellen Moore offense.", rookie:true},
          {name:"Makai Lemon", pos:"WR", team:"PHI", age:21, category:"foundational", tier:"B", note:"Eagles 1st-round pick. Long-term WR1 if AJ Brown moves.", rookie:true},
          // B
          {name:"Fernando Mendoza", pos:"QB", team:"LV", age:22, category:"upside_premier", tier:"A", note:"105 to 108 fair price. Goff/Lawrence/Love archetype, capped passing upside.", rookie:true},
          {name:"KC Concepcion", pos:"WR", team:"CLE", age:21, category:"upside_premier", tier:"A", note:"Top-25 NFL capital. Elite separator. Mid-of-field threat in Cleveland.", rookie:true},
          {name:"Jadarian Price", pos:"RB", team:"SEA", age:22, category:"upside_premier", tier:"A", note:"32nd overall to SEA. New coaching staff, no Charbonnet/Walker continuity.", rookie:true},
          // C (Jets pair)
          {name:"Omar Cooper Jr.", pos:"WR", team:"NYJ", age:22, category:"upside_premier", tier:"B", note:"Jets traded up. Targets split with Wilson + Sadiq.", rookie:true},
          {name:"Kenyon Sadiq", pos:"TE", team:"NYJ", age:21, category:"upside_premier", tier:"B", note:"Jets 1st-round TE. Take-your-medicine pick. Better situation possible w/ next-year QB.", rookie:true},
          // D
          {name:"Ty Simpson", pos:"QB", team:"LAR", age:23, category:"upside_premier", tier:"B", note:"Stuck behind Stafford. Hard-rebuild stash, +50% on takeover.", rookie:true},
          {name:"Eli Stowers", pos:"TE", team:"PHI", age:22, category:"upside_premier", tier:"B", note:"Goedert succession plan. Floor pick, value gain on Goedert exit.", rookie:true},
          // F
          {name:"Denzel Boston", pos:"WR", team:"CLE", age:22, category:"mainstay", tier:"S", note:"Easy start over Tillman in CLE. Outside-X profile.", rookie:true},
          {name:"Max Klare", pos:"TE", team:"LAR", age:22, category:"mainstay", tier:"S", note:"2.11. Floor TE pick in a tight-end-thin class.", rookie:true},
          // G (deeper picks worth flagging)
          {name:"Germie Bernard", pos:"WR", team:"PIT", age:22, category:"mainstay", tier:"A", note:"2nd-round capital. Most dynamic weapon in PIT room.", rookie:true},
          {name:"Jonah Coleman", pos:"RB", team:"DEN", age:22, category:"mainstay", tier:"A", note:"4th round to DEN. JK Dobbins healthy = hold; injured = ascending.", rookie:true},
          {name:"Nicholas Singleton", pos:"RB", team:"WAS", age:22, category:"mainstay", tier:"A", note:"Receiving back behind Pollard/Spears. Athletic profile, vision concerns.", rookie:true},
          {name:"Drew Allar", pos:"QB", team:"PIT", age:22, category:"mainstay", tier:"B", note:"3rd-round QB in QB-room limbo. Sell on training-camp buzz.", rookie:true},
          {name:"Carson Beck", pos:"QB", team:"ARI", age:23, category:"mainstay", tier:"B", note:"3rd-round QB behind Brissett. Stash, sell on a chance.", rookie:true},
          // Late flier
          {name:"Kaytron Allen", pos:"RB", team:"WAS", age:22, category:"productive_vet", tier:"S", note:"6th round to WAS. Worst-version-of-Brian-Robinson type.", rookie:true},
          // ----- Bakery deep WRs (from rookie WR rankings video) -----
          {name:"Chris Bell", pos:"WR", team:"MIA", age:22, category:"mainstay", tier:"B", note:"3rd round to MIA, fell on medicals. Best WR in DOL room day one.", rookie:true},
          {name:"Antonio Williams", pos:"WR", team:"WAS", age:22, category:"mainstay", tier:"B", note:"4th round to WAS. Slot role next to Terry McLaurin.", rookie:true},
          {name:"Elijah Sarratt", pos:"WR", team:"BAL", age:22, category:"mainstay", tier:"B", note:"4th round to BAL. Big-slot / red-zone fit. Domain my-guy.", rookie:true},
          {name:"Chris Brazzell II", pos:"WR", team:"CAR", age:22, category:"productive_vet", tier:"S", note:"Highest-rated 4th round WR in bakery. Behind McMillan / Coker / Legette.", rookie:true},
          {name:"Zachariah Branch", pos:"WR", team:"ATL", age:22, category:"productive_vet", tier:"S", note:"Slot role in ATL. Immediate snaps possible.", rookie:true},
          {name:"De'Zhaun Stribling", pos:"WR", team:"SF", age:23, category:"productive_vet", tier:"A", note:"33rd overall pick, but worst analytics in tier per Bakery. Reach.", rookie:true},
          // ----- Bakery deep RBs (from rookie RB rankings video) -----
          {name:"Kaelon Black", pos:"RB", team:"SF", age:25, category:"productive_vet", tier:"S", note:"3rd round to SF, CMC handcuff. Pure insurance value.", rookie:true},
          {name:"DJ Giddens", pos:"RB", team:"IND", age:22, category:"mainstay", tier:"A", note:"Bakery elite analytics. Behind Jonathan Taylor.", rookie:true},
          {name:"Bhayshul Tuten", pos:"RB", team:"JAX", age:23, category:"mainstay", tier:"A", note:"Behind Travis Etienne and Tank Bigsby.", rookie:true},
          {name:"Cam Skattebo", pos:"RB", team:"NYG", age:24, category:"upside_premier", tier:"A", note:"4th rounder to NYG. Skattebo-style violent runner.", rookie:true},
          {name:"RJ Harvey", pos:"RB", team:"DEN", age:25, category:"mainstay", tier:"A", note:"DEN rotation w/ Coleman + Dobbins. Receiving back.", rookie:true},
          {name:"Kaleb Johnson", pos:"RB", team:"PIT", age:22, category:"mainstay", tier:"A", note:"PIT rotation w/ Najee. Power back fit.", rookie:true},
          // ----- Bakery TE rookies -----
          {name:"Tyler Warren", pos:"TE", team:"IND", age:23, category:"upside_premier", tier:"A", note:"1st round TE. Could compete with Loveland for TE1 rookie production.", rookie:true},
          {name:"Eli Heidenreich", pos:"RB", team:"PIT", age:22, category:"productive_vet", tier:"B", note:"7th round to PIT, drafted as RB. Late flier my-guy.", rookie:true}
        ]
      }
    ]
  }
];

// Tier value table — used for team strength calculation.
// Higher = more valuable. Calibrated so a roster of cornerstones easily clears foundational rosters.
window.TIER_VALUES = {
  cornerstone:    { S: 100, A: 85, B: 72, C: 60 },
  foundational:   { S: 55,  A: 50, B: 44, C: 38, D: 33 },
  upside_premier: { S: 28,  A: 22, B: 17 },
  mainstay:       { S: 18,  A: 14, B: 10 },
  productive_vet: { S: 12,  A: 9,  B: 6 },
  short_term:     { S: 8,   A: 5,  B: 3 }
};

// Position multipliers for SUPERFLEX leagues — QBs get a major bump.
window.SUPERFLEX_POS_MULT = { QB: 1.40, RB: 1.0, WR: 1.0, TE: 1.0, K: 0.9, DEF: 0.9 };

// Position multipliers for IDP leagues — defensive players matter, but offensive players still drive most scoring.
window.IDP_POS_MULT = { QB: 1.0, RB: 1.0, WR: 1.0, TE: 1.0, LB: 1.1, DB: 1.0, DL: 1.0 };

// Category labels for UI
window.CATEGORY_LABELS = {
  cornerstone: "Cornerstone",
  foundational: "Foundational",
  upside_premier: "Upside Premier",
  mainstay: "Mainstay",
  productive_vet: "Productive Vet",
  short_term: "Short-Term League Winner"
};

window.CATEGORY_COLORS = {
  cornerstone: "#2dd4bf",      // purple
  foundational: "#60a5fa",     // blue
  upside_premier: "#34d399",   // green
  mainstay: "#fbbf24",         // amber
  productive_vet: "#fb923c",   // orange
  short_term: "#f87171"        // red
};

window.TIER_COLORS = {
  S: "#fbbf24",  // gold
  A: "#2dd4bf",  // purple
  B: "#60a5fa",  // blue
  C: "#34d399",  // green
  D: "#9ca3af"   // gray
};
