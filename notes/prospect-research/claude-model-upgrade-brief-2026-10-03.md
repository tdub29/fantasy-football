# Prospect model research mandate, 2026-10-03

## Additional user mandate: data acquisition packages, 2026-10-04

Trevor explicitly requests taking advantage of known packages for pulling data. Audit installed dependencies and the relevant ecosystem before writing custom downloaders or parsers. Scout candidates such as nflreadpy/nfl_data_py/nflreadr, sportsdataverse Python/R, cfbfastR, CollegeFootballData clients and cfbreadr, plus appropriate NCAA/ESPN adapters. These are search candidates, not verified recommendations: check current official repositories/docs, actual functions, supported years/divisions/fields, maintenance, dependencies, authentication and data licenses. Prefer maintained existing loaders for available public data; do not add libraries merely for their names.

Record a package/source matrix: loader/version, upstream source, coverage, IDs and join quality, historical availability, reproducibility, license/terms, key/paywall requirements, and tested/rejected disposition. Test usable loaders against existing raw counts and records before replacing ingestion. A package license does not automatically license upstream data. Packages may share the same upstream source, so do not count redundant adapters as independent coverage. Preserve timestamps, raw provenance, missingness and SQLite ownership. Do not change shared ingestion concurrently with lane workers. If a key/payment is required, document the blocked coverage and use authorized public alternatives; no credential purchase or bypass. Apply package discovery to remaining FCS, recruiting, birthdate, roster, stats, testing and outcome gaps, checkpoint results, and integrate only verified improvements.

Trevor explicitly asks Claude to make the model as useful and accurate as possible,
scout skills until it has the strongest applicable data-science guidance, and explore
all possible features. He rejects stopping at identical draft-capital probabilities.
This authorizes substantive research, data acquisition from public sources, experiments,
implementation, checks and independent review. It does not authorize inventing predictive
signal, hiding failed validation, paid services, credentials, external sends or deployment.

## User scope expansion: full data, database, usage-limit loop

Trevor's latest explicit instruction: "make sure theres full data and we really should have some
sort of db for all this data ... make claude loop until usage limit". This replaces the earlier
12-cycle/two-dry-cycle stop condition. Run a usage-bounded loop until Claude reports its actual
usage limit, user stops it, or a concrete non-recoverable external blocker prevents useful work.
Do not interpret lack of one candidate's gain or completion of card work as task completion.
No invented token/dollar allowance. Do not bypass account limits, switch accounts or buy credits.
At usage limit, preserve checkpoint and report limit; do not auto-resume after reset without further
authorization. All gains must remain validated and independently reviewed.

Full data means verified completeness against a stated, source-supported population, time window
and field registry, not the assertion that every imaginable field exists. Inventory available
college/NFL raw and generated data first; audit all positions/classes, historical undrafted players,
identity joins, teams/seasons, outcomes, birth dates, production and candidate feature availability.
Distinguish missing, unknown, inapplicable, not-yet-observable and zero. Fill feasible gaps from
reliable public historical sources and preserve provenance. Never impute a fact and report it observed.
Document unavailable fields and coverage limits rather than falsely claiming full data.

Implement a local database for reusable football data, using an existing adequate database if one
already exists; otherwise Python stdlib SQLite is the default. Store normalized player identities,
source records, season observations, timestamps/availability, versioned outcome/feature datasets,
and source provenance where justified by actual ingestion. Use explicit keys, repeatable/idempotent
ingestion, transactions, quality constraints and a minimal reproducible schema/migration path.
Keep raw provenance recoverable. No speculative enterprise platform or new hosted service.
Integrate database into prospect dataset/model builders and export current static JS format for
the browser; do not make static site depend on a live SQL server. Establish authoritative data
ownership and update path, avoiding divergent JSON/SQL truths. Preserve existing data and unrelated
builders; migrate applicable sources in layers with verified row counts, joins and export parity.
Exclude local database binaries from Git if existing repo conventions warrant it; ship repeatable
ingestion/schema tooling and coverage reports. Do not delete original data before recovery and parity
are proven. Database is part of authorized implementation, not a recommendation-only deliverable.

Continue FULL-scope cycles across skill gaps, sourcing/coverage, database quality, candidate features,
models/targets, independent validation and app integration until actual usage wall. Checkpoint before
costly phases and after every cycle. If search saturates, move to remaining coverage, reproducibility,
calibration, robustness and integration work; avoid rerunning identical searches or experiments.
Keep final state resumable with exact next command and unresolved issues. Do not claim globally best.

## Public reuse and measured improvement, Trevor clarification

Trevor additionally instructs: "copies as much as possible from what's public and ensures
improvement". Prefer established public datasets, research methods, feature definitions,
baseline implementations and evaluation tooling over rebuilding them. Scout primary-source
papers, official dataset documentation and public repositories, not just installed skill names.
Review promising complete implementations and their experiments. Copy/adapt reusable code and
data where their licenses and access terms permit; preserve required attribution, notices,
source URLs, versions and retrieval dates. Public visibility alone is not redistribution
permission. Record reuse decisions and unavailable/restricted sources rather than inventing
coverage. Do not copy credentials, private data, published prose wholesale, or proprietary
artifacts into this project. Import skill bundles completely per workspace policy.

For each reused method or feature family, identify which measured weakness it addresses,
replicate its reported setup where feasible, then evaluate on THIS project's population,
prediction-time availability and locked validation. A public leaderboard win does not prove
improvement here. Check source availability across history and today so train-serving
differences cannot create false gains. Do not feed post-draft or NFL outcomes into pre-draft
predictions. Inspect source code for leakage rather than trusting README claims.

Before promotion, compare frozen baseline and candidate on identical data cuts/folds/seeds,
with primary proper scoring metric, calibration, class/position stability and uncertainty.
Require independently reviewed evidence of practical improvement without unacceptable regression.
Include ranking/decision usefulness as a separately declared goal, and data-completeness/join
improvements as separate measured outcomes. No guaranteed statistical gain can be promised;
if candidate loses or evidence is inconclusive, reject it, preserve baseline and continue
investigating other justified candidates until actual usage wall. Never change target, folds,
baseline strength or acceptance criteria after seeing results just to manufacture a win.
Keep registry and checkpoint current so later continuation knows every public source examined,
what was reused, its license, what changed, and exact commands proving improvement or rejection.

## Outcome and completion

Produce the strongest defensible available prospect model for QB/RB/WR/TE and useful
individual prospect profiles before and after the NFL draft. Separate pre-draft predictions
from post-draft predictions and descriptive talent profiles. Promote improvements only on
predeclared leakage-safe validation, calibration and stability evidence. If college-feature
models cannot beat strong baselines, retain honest forecasts and identify exactly what
data or target limitations prevent improvement. Do not stop after the first failed model,
one skill search or a cosmetic copy change. No guarantee of global optimality is possible.

## Skills, sources and candidate universe

Use scout-skills immediately, exhaustively by sub-question, including bodies and references.
Find-local-skill.py description searches and --grep are mandatory; confirm Claude invocability.
Cover validation-design, feature-engineering, sports-modeling, temporal leakage, missingness,
calibration, small samples, hierarchical models, model selection, experiment-log, target design,
distribution shift, data quality and results reporting. Read contributing rules, not just names.
If real gaps remain, use find-skills and import complete applicable bundles, with provenance.
Follow workspace orchestration policy with workers per independent research/data shard and
fresh never-self reviewers; state model plus effort and cost shape before spawning.

Create a feature registry with source, coverage by draft class, measurement/availability time,
join quality, missingness, estimated-versus-observed status, leakage risk and usable phase.
Include at least these families, expanding from literature and actual source discovery:

- Age, real birth dates versus estimated ages, breakout age, seasons played, declaration timing,
  COVID/extra eligibility and redshirt/transfer history with correct historical timestamps.
- Position-specific multi-season production, progression, dominance/market share, receiving
  and rushing efficiency, workload, routes, targets, usage/role, team opportunity and pace.
- Opponent/conference strength, schedule, team/QB effects and competition for opportunities.
- Size, verified combine/pro-day athletic testing and recruiting traits available at prediction time.
- Public film/scouting grades with historically timestamped coverage and provenance.
- Draft-capital scenarios for pre-draft players; actual capital, team/landing spot, depth chart
  and opportunity for post-draft players. Future capital is not known pre-draft.
- Availability/injury history only from reliable dated sources; interactions, trajectories,
  normalization and transformations with plausible mechanisms and controlled complexity.

Every discoverable candidate family gets an explicit disposition: tested, redundant, unavailable,
too sparse, leakage, failed quality, or deferred with a concrete closure route. "All possible"
means broad documented search of the feasible feature universe, not blindly adding columns.
Never drop undrafted players from a pre-draft population without explaining selection bias.

## Validation and experiment contract

Start with current code and notes/prospect-research/model-card.md. The WR early-declare shift,
estimated-age error, imputed athleticism and small outcome samples are hypotheses to investigate,
not established causal explanations. Audit labels, joins, cohort drift, maturity/censoring and
feature availability before optimizing. Distinguish failure of the current feature specification
from a blanket claim that college data lacks signal.

Existing 2020-2023 holdout has already been viewed; do not tune repeatedly on it and call it untouched.
Lock temporal/nested selection protocol with all preprocessing inside folds, outcome-maturation gaps,
class-grouped uncertainty and feature/tuning decisions made only in training/development folds.
Use genuinely new mature evaluation data if available; never treat immature classes as misses.
Otherwise disclose absence of fresh final holdout and use honest nested temporal evaluation.
Keep strong draft-capital baselines and practical simple models. Investigate robust age/declaration
handling, missingness, regularized nonlinear models, hierarchical/partial-pooling and ensembles
where supported. Predeclare metrics: proper scoring loss, calibration, uncertainty, ranking utility
and decision-relevant targets, not accuracy alone. Avoid trying until a lucky p-value wins.
Log every trial, data cut, folds, hypotheses, commands, metrics and reject/keep decisions.
Compare feature-family ablations and position-specific stability. Calibration/sensitivity and
independent review must be able to reject the candidate and restore the baseline.

## Execution loop and handoffs

Work in an isolated managed worktree. Check active claims before shared writes. Existing prospect-card
session 11284ffb is separate; reuse its card work where relevant without clobbering it. Main app/data
working tree contains unrelated changes. Generated model data must be built, not hand-invented.

Checkpoint after every research/experiment cycle: registry coverage, trials run, accepted/rejected
results, artifacts, next falsifiable experiments and exact resume command. Loop the FULL scope
through scout, acquire/audit, experiment, independent judge and integrate. Hard stop is the actual
Claude usage limit under Trevor's expanded instruction above, not a cycle count or first dry pass.
At limit, write resumable unfinished work and report honestly; do not mark task complete for stopping.
No budget cap was specified by Trevor; do not invent a dollar/token budget. Resource limits or missing
access are blockers to record and resume, not reasons to discard completed work.

Completion requires registry dispositions, reproducible comparisons, independent review of leakage
and claims, implementation of accepted improvements, relevant tests plus generated-data consistency,
and clear prospect-card outputs. Give Trevor concrete model changes and remaining limits, not a
skill-installation journal. If no model passes, report evidence-backed baseline retention and the
specific next data needed; do not sell a weak model as accurate to satisfy frustration.
