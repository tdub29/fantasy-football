# Can you rebuild routes/alignment/personnel with CV on game film? A cost model

Bottom line up front: the blocker is not compute, it is footage. Every legal way to get the film either
gives you the wrong angle (broadcast), the wrong volume (a handful of sampled weeks), or the wrong price
(NFL Films licensing). The one footage-shaped surprise: the exact data you think is gone (participation,
personnel, routes) is coming back for free, just delayed to season's end, via FTN Data through nflverse.
That single fact should be checked before spending a dollar on this.

---

## 0. The premise needs a correction first

`nflreadr::load_participation()` was not killed, it was delayed. The NFL cut off in-season scraping
(participation used to be visible for every game; as of 2025 the league restricts what's scrapeable to
primetime games only, in-season). But FTN Data still manually charts every play of every game -
including personnel, routes run, and coverage - and nflverse now loads that FTN charting as
`load_participation()` once each season ends. 2023 and 2024 are already back in nflreadr; 2025 lands
after the 2025 season concludes, for free, no CV required.

- [John Edwards (nflverse) on X, confirming FTN-sourced participation restore](https://x.com/John_B_Edwards/status/1962930039126950101)
- [nflreadr `load_participation()` reference](https://nflreadr.nflverse.com/reference/load_participation.html)
- [nflreadr data availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)

If the only problem is "I want this data in-season, not after the season," CV cannot fix that either -
your own pipeline would also lag by however long it takes you to process film, which is worse than
FTN's post-season turnaround unless you also solve live broadcast ingestion (a separate, harder problem).
The realistic problem CV would solve is: full historical depth across many seasons, on your own schedule,
without paying anyone. Keep that framing in mind for the bottom-line table.

---

## 1. FOOTAGE: what's legally obtainable, what it costs, what angle it gives you

This is the actual cost driver. Nothing below is a recommendation to pirate anything; where the legal
line is fuzzy, that's stated plainly rather than glossed over.

### 1a. NFL+ Premium (the only individual-subscriber path to All-22)

- **Price:** $14.99/month or $99.99/season. (Base NFL+ without Premium is $6.99/mo or $49.99/yr and does
  NOT include Coaches Film.)
  [How much does NFL+ cost - NFL Support](https://support.nfl.com/hc/en-us/articles/35869739723028-How-much-does-NFL-cost)
- **What you get:** "Coaches Film" = All-22 plus a second "High End Zone" angle, for every preseason,
  regular season, and postseason game, available 24-36 hours after the game ends.
  [How do I watch Coaches Film - NFL Support](https://support.nfl.com/hc/en-us/articles/35869780989332-How-do-I-watch-Coaches-Film)
- **Stream only, no download, ever:** "NFL+ has no offline download option. Every live game, replay and
  on-demand clip requires an internet connection." 3 concurrent streams allowed, but that's for personal
  multi-device viewing, not automation.
  [Concurrent streams - NFL Support](https://support.nfl.com/hc/en-us/articles/35869677228820-How-many-concurrent-streams-can-I-have-with-NFL-or-NFL-Premium)
- **ToS is explicit and stacks two separate prohibitions on top of the no-download rule:**
  - Recording/reproducing: "You are expressly prohibited from archiving, republishing, retransmitting,
    and/or reproducing the content... You are also expressly prohibited from downloading the content
    accessible via NFL+, NFL+ Premium and/or the Add-On Product(s)."
  - Automation/scraping: "You agree that you will not attempt to... bypass any robot exclusion headers...
    use any software, technology, or device to send content or messages, scrape, spider or crawl the
    Products... or harvest or manipulate data on or from the Products." Plus a separate systematic-
    retrieval clause aimed at exactly what a CV pipeline does: building a compiled dataset from the
    content.
  [NFL.com Terms and Conditions](https://www.nfl.com/legal/subscriptions_terms)
- **What this means practically:** to get frames out of NFL+ Premium for CV, you'd have to screen-record
  the stream. That is a ToS breach even done manually and once (the no-download/no-reproduction clause),
  and becomes a second, independent breach (the anti-automation clause) the moment you script it across
  a season. Realistic consequence for a hobbyist who never redistributes footage: account termination,
  not a lawsuit. But NFL Films/the NFL asserts broad copyright over all game footage, so if any extracted
  frames or clips leave your machine (posted, shared, sold, or embedded in a public site), you're in
  actual copyright-infringement territory, not just contract breach.
  [NFL copyright claims discussion - Nebraska Law Review](https://lawreview.unl.edu/warning-nfl-claims-copyright-ownership-everything/)
- **Angle coverage:** 100% of games, All-22 + one end zone angle. This is the best angle you can legally
  buy as an individual - broadcast and YouTube condensed cannot match it for alignment/route work.

### 1b. NFL Game Pass International (DAZN): not a cheaper or freer alternative

- Priced for non-US markets, roughly $150-200/season equivalent (a "Travel Pass" for US-based travelers
  is $179.99/season, $17.99/week).
  [DAZN NFL Game Pass pricing](https://www.dazn.com/en-US/news/american-football/nfl-gamepass-cost-dazn-country-price-subscription-instalment-watch-season/1wru1kpuqwhol1uk8av5mu4p78)
- Same Coaches Film / All-22 content as NFL+ Premium, same 24-36hr delay.
- For a US resident this requires geo-evasion (VPN) on top of DAZN's own ToS, which almost certainly
  carries the same no-recording/no-scraping language. Net effect: costlier or equal to NFL+ Premium, adds
  a geo-fraud problem, no new legal room to automate. Not worth pursuing over 1a.

### 1c. NFL Films licensing: wrong product, and priced for TV production not data mining

- NFL Films is "the exclusive holder of all rights... in and to all NFL footage" and licensing is quote-
  only, submitted per-project through a request form.
  [NFL Films Footage Licensing](https://www.nflfilms.com/licensing/)
- No public price list exists because rights-managed sports stock footage is priced per clip, per minute,
  by audience size/distribution/exclusivity - industry-typical rates run from several hundred to several
  thousand dollars per clip for commercial use, and that's for producing video content (highlight reels,
  documentaries), not for bulk raw coaches-film access to run a CV pipeline against. This route is
  realistically a non-starter on both price and product fit for a hobbyist stats site.

### 1d. Broadcast recordings (DVR/cable) and YouTube condensed games

- **DVR/home recording of broadcast TV:** legally the most defensible option (personal time-shifting has
  long-standing fair-use grounding in the US), but you only get the broadcast angle - camera cuts, zooms,
  and replays - not All-22. Broadcast angle loses backside route detail and most alignment/personnel
  information at the snap due to framing; it's usable for QB/skill-position highlight-level tracking, not
  for rebuilding full route-participation data across 22 players. Also limited to your local market's
  broadcast games unless you pay for out-of-market packages (Sunday Ticket, etc.), which have their own
  ToS restrictions on recording.
- **YouTube condensed games (official NFL channel):** free, but current-season full games are not posted
  in full due to broadcast rights; condensed cuts run ~10-15 minutes and skip most non-scoring, non-key
  plays - you cannot rebuild full per-play participation from these, only a curated highlight subset.
  Automated downloading (yt-dlp) of YouTube content is itself against YouTube's ToS, though enforcement
  against personal-use downloading is essentially never pursued; the bigger problem here is coverage, not
  legal risk - condensed games structurally omit most plays.
  [NFL Condensed Games playlist](https://www.youtube.com/playlist?list=PLX73TIk0qeOevub6L2ErQVb5cNPS1ZI2C)

### 1e. College All-22 equivalents

- There is no consumer-facing product that sells bulk college All-22 the way NFL+ Premium sells NFL
  All-22. Hudl is the near-universal college/high-school film platform, but it's B2B software each
  program pays for directly (~$1,400/yr per team) and access is restricted to that program's own account,
  not resold to the public.
  [Hudl college solutions](https://www.hudl.com/solutions/college)
- Synergy Sports covers NCAA basketball far more than football, and is again a coaching/scouting tool
  sold to programs, not a public film archive.
- Net: college All-22 is, if anything, harder to obtain legally than NFL All-22. Not a cheaper testbed.

### 1f. Free datasets that already give you player positions - no CV needed

This is the biggest single finding in this section, because it partly obsoletes the CV project.

- **NFL Big Data Bowl (Kaggle, free):** every year the NFL/Next Gen Stats releases real player-tracking
  data - x/y position, speed, acceleration, direction, orientation, at 10 Hz - for every player on the
  field, already resolved to player identity. No video, no CV, no jersey OCR: it's already the numeric
  output you're trying to reconstruct.
  [NFL Big Data Bowl 2025 (Kaggle)](https://www.kaggle.com/c/nfl-big-data-bowl-2025/data)
  [NFL Big Data Bowl 2026 - Prediction (Kaggle)](https://www.kaggle.com/competitions/nfl-big-data-bowl-2026-prediction)
  - Real limits: each release covers roughly 9 weeks of one or two seasons (2025's release: 2023 & 2024
    tracking data, evaluated against 2025 outcomes), tied to that year's specific theme (pass rush,
    tackling, pre-snap-to-post-snap, etc.), so it is not "every play, every player, every season" - it's a
    themed sample with roughly a 1-2 season lag.
  - Legal status is genuinely gray outside the competition: the NFL's contest terms state the data is
    provided "solely for purposes of participation in the Contest" and grants no ownership or license for
    outside use. In practice, thousands of public Kaggle notebooks and analytics blog posts reuse it after
    each competition closes with zero enforcement history against small/non-commercial reuse - but folding
    it into a public fantasy site as a permanent data source is not something the terms actually authorize.
    [Kaggle NFL Big Data Bowl 2023 rules](https://www.kaggle.com/competitions/nfl-big-data-bowl-2023/rules)
- **statrankings.com Routes Run / Route Participation:** full-season, per-player Routes Run and Route
  Participation totals appear to be free; only week-level splits, home/away splits, and deeper cuts sit
  behind their paid "+" tier.
  [Routes Run - statrankings.com](https://statrankings.com/nfl/advanced/players/usage/routes-run)
  This may directly answer the "routes run per player" half of the original question for $0, no film
  required - worth checking before building anything.

---

## 2. VOLUME (for context on any DIY pipeline)

Assumptions stated plainly, since these drive every downstream number:

- Combined offensive snaps per game (both teams): **~130** (league average per-team is low-to-mid 60s,
  so ~125-135 combined is the standard estimate).
  [NFL plays-per-game - TeamRankings](https://www.teamrankings.com/nfl/stat/plays-per-game)
- "Useful" analysis window per play: pre-snap alignment (~2s) + snap-to-throw/whistle (~6s, matching your
  own framing) = **~8 seconds** per play for route/alignment work.
- Regular season games: **272** (32 teams x 17 games / 2).

| Setting | Frames/play | Frames/game (130 plays) | Frames/season (272 games) |
|---|---|---|---|
| Full 30 fps, 8s window | 240 | 31,200 | 8,486,400 (~8.5M) |
| Sampled 10 fps, 6s snap-to-throw only | 60 | 7,800 | 2,121,600 (~2.1M) |

Five seasons of history (a reasonable "rebuild what nflverse used to give me" target): ~42.4M frames at
full 30fps, ~10.6M frames sampled - and, per section 1a, you'd have had to screen-record all 1,360 games
yourself in violation of the NFL+ ToS to get the raw material.

---

## 3. PIPELINE: what the CV actually has to do, and where it breaks

Five stages, each with existing open-source starting points:

1. **Player detection + tracking** - YOLOv8/YOLOv11 for per-frame boxes, ByteTrack or BoT-SORT to hold
   identity across frames. `roboflow/sports` packages exactly this (detection, tracking, homography,
   team classification) as reusable pieces, demoed on soccer broadcast footage.
   [roboflow/sports (GitHub)](https://github.com/roboflow/sports)
   [Roboflow: Track Football Players with Computer Vision](https://blog.roboflow.com/track-football-players/)
2. **Field registration / homography** - a keypoint model detects field markings, then a homography
   matrix projects pixel coordinates to yard coordinates. Roboflow's camera-calibration writeup covers the
   method.
   [Roboflow: Camera Calibration in Sports with Keypoints](https://blog.roboflow.com/camera-calibration-sports-computer-vision/)
3. **Jersey number OCR / re-ID** (the hard part) - academic results on broadcast **soccer** footage report
   ~92% whole-number accuracy, ~94% digit-wise, with tracking MOTA around 94.5% for the detection+tracking
   stage.
   [Automated player identification, two-stage deep network (Nature Sci Reports)](https://www.nature.com/articles/s41598-023-36657-5)
   [Jersey number detection with synthetic data (Frontiers AI)](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2022.988113/full)
   Two caveats that matter a lot for NFL specifically: (a) essentially all of this published work and all
   of the roboflow/sports tooling targets **soccer**, which is one continuous wide shot with no camera
   cuts - NFL broadcast has constant cuts, zooms, and replays, and even All-22 has players crowding and
   occluding each other in the box at the snap, which is exactly the failure mode the papers flag
   ("crowded settings, distorted objects, changing camera angles, low resolution, transient posture
   changes"). (b) there is no public NFL-specific labeled dataset comparable to the soccer sets on
   Roboflow Universe (those are all soccer: goalkeeper/player/referee/ball classes) - you'd be
   fine-tuning from a soccer-tuned starting point into a harder occlusion regime, not dropping in a
   ready-made NFL model.
4. **Play segmentation** - detecting play start (snap) and end (whistle) from a continuous reel; not
   solved by any of the above and would need its own heuristic or model (motion/optical-flow change
   detection is the standard cheap approach, not benchmarked here).
5. **Route/alignment/personnel classification** - the actual deliverable, built on top of stages 1-4;
   no existing open-source project does this for American football specifically. This is where most of
   your own engineering time goes, not stages 1-3.

---

## 4. COMPUTE COST (kept short - this is not the bottleneck)

Throughput is an engineering estimate, not a single benchmark: published YOLOv8n numbers are detection-
only; a full pipeline (detection + tracking + homography + jersey OCR) runs meaningfully slower. Anchor
points: YOLOv8n hits roughly 65-75 fps on an RTX 4070 and 200+ fps on an RTX 4090 for detection alone.
[YOLO model performance comparison - LearnOpenCV](https://learnopencv.com/performance-comparison-of-yolo-models/)
Assume a full pipeline runs at roughly 20-40% of that (20 fps on RTX 4070-class, ~22 fps on an AWS A10G,
~40 fps on an A100).

Cloud on-demand rates used: T4 ~$0.50/hr, L4 ~$0.60-0.75/hr, A10G (AWS g5.xlarge) $1.006/hr, A100
~$0.79-2.79/hr depending on provider (RunPod low end, Lambda high end).
[EC2 g5.xlarge pricing](https://www.devzero.io/instances/aws/g5.xlarge)
[GCP GPU pricing 2026](https://www.usage.ai/blogs/gcp/ai-ml-cost/vertex-ai/google-cloud-nvidia-enterprise-ai/)
[Lambda Labs GPU pricing 2026](https://www.synpixcloud.com/blog/lambda-labs-gpu-pricing-2026)
[Vast.ai vs RunPod pricing 2026](https://medium.com/@velinxs/vast-ai-vs-runpod-pricing-in-2026-which-gpu-cloud-is-cheaper-bd4104aa591b)

| GPU | $/hr | Full 30fps: $/season, hrs/season | Sampled 10fps/6s: $/season, hrs/season |
|---|---|---|---|
| T4 (cloud) | ~$0.50 | ~$117, ~236 hrs | ~$29, ~59 hrs |
| L4 (cloud) | ~$0.60 | ~$95, ~157 hrs | ~$24, ~39 hrs |
| A10G (AWS g5) | ~$1.01 | ~$109, ~107 hrs | ~$28, ~27 hrs |
| A100 (cheap cloud) | ~$1.00 | ~$59, ~59 hrs | ~$14, ~15 hrs |
| RTX 4070 (own box, $0 marginal $) | - | ~$0, ~118 hrs | ~$0, ~29 hrs |
| Laptop, CPU-only (~1.5 fps estimate) | - | ~$0, ~1,572 hrs (65 days continuous) | ~$0, ~392 hrs (16 days continuous) |

Takeaway: compute is $15-120/season on rented GPUs, or free-but-slow on your own hardware. A gaming GPU
you already own finishes a season in about a week of overnight runs at the sampled setting. A CPU-only
laptop cannot practically keep up at full 30fps but can grind through the sampled 10fps window over a
season if left running most nights. **Compute was never the blocker - see section 1.**

---

## 5. LABELING / DEV COST

- Roboflow's outsourced annotation is priced per-annotation: **$0.10/bounding box, $0.05/classification**.
  [Roboflow Credits / usage-based pricing](https://roboflow.com/credits)
- Realistic fine-tune targets: you don't need to hand-label full 22-player frames from scratch, because a
  COCO-pretrained detector already finds "person" reliably - the actual fine-tuning need is (a) a jersey-
  number classifier trained on cropped player boxes and (b) a small keypoint set for field-line homography.
  - Jersey OCR starter set: ~1,000-2,000 labeled crops. At $0.05/classification outsourced, that's
    **$50-100**; self-labeled at ~10-15 sec/crop, that's **~4-8 hours** of your own time.
  - Full from-scratch frame labeling (all 22 boxes/frame, if you skip the pretrained-detector shortcut):
    ~22 boxes x $0.10 = ~$2.20/frame outsourced; a 3,000-frame starter set would run **~$6,600**
    outsourced or **~125-200 hours** self-labeled - avoid this path.
- Real dev cost is engineering time, not labeling spend: building and gluing stages 1-5 from section 3
  (especially play segmentation and route classification, which have no existing open-source base) is
  realistically **80-150 hours** of solo build time even leaning hard on roboflow/sports and Ultralytics.
  That dwarfs both the footage subscription and the compute bill.

---

## 6. BOTTOM LINE

| Option | Footage cost/season | Compute cost/season | Dev effort | Expected accuracy | Legal risk |
|---|---|---|---|---|---|
| DIY CV on screen-recorded NFL+ Premium All-22 | $99.99 (subscription) | $15-120 (cloud) or ~$0 (own GPU) | 80-150 hrs + ongoing maintenance | Detection/tracking solid (~90%+); jersey ID ~90-94%; route/alignment classifier unproven, no existing base | Real: ToS explicitly bans recording, downloading, and automated harvesting; account-ban risk is concrete, redistribution risk is copyright-level |
| NFL Big Data Bowl (Kaggle, free) | $0 | $0 (no CV needed - it's already positions) | Hours, not months, to reshape into your schema | High (it's the NFL's own tracking data) | Gray outside the contest; no license for outside/commercial reuse, but widely reused informally with no enforcement history |
| Buy FTN Data directly | $69.99/yr individual | $0 | Minimal (it's delivered as data) | High (this is the same charting that used to feed nflverse) | Low - normal commercial data purchase |
| Wait for nflverse + FTN post-season restore | $0 | $0 | None | High | None |
| PFF+ / PFF Pro | $119.99-$199.99/yr | $0 | Low (API/CLI available at Pro tier) | High, broader stat set than routes/alignment alone | Low |
| NFL Films commercial license | Quote-only, likely 4-5 figures | N/A (wrong product) | High (paperwork, not pipeline) | N/A | Low if properly licensed, but wrong tool for data extraction |

**Recommendation:** don't build the CV pipeline. The footage math kills it before the compute math even
matters: the only individual path to full-season All-22 (NFL+ Premium, $99.99/season) explicitly forbids
the one thing you need to do with it (record/download/automate), which converts "cheap subscription" into
"real ToS and copyright exposure" the moment you screen-rip it at scale - and even if you accepted that
risk, you'd spend 80-150 hours building route/alignment/personnel classifiers that no one has open-
sourced for American football, to reproduce data FTN Data already charts by hand and will hand you for
$69.99/year, or that nflverse will hand you for free a few months after each season ends. Check
statrankings.com's free Routes Run/Route Participation numbers and the free Big Data Bowl tracking data
first - between those two, plus a $70-200/year FTN or PFF+ subscription, you likely get everything the CV
project would have produced, without touching a GPU or the NFL's terms of service.


## Correction, 2026-09-24

statrankings.com's Routes Run table is NOT free: it shows the top five rows and then "Subscribe for Access". The five free rows were still useful as a spot check of the site's route estimate (mean ratio 1.03, see beyond-the-box-score-metrics.md).
