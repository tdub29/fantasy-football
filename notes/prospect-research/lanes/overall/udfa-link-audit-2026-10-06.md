# UDFA identity-link audit (2026-10-06)

Read-only diagnosis on a separate store copy (job tmp/lane-overall2). No scoring run.

**Finding: the Ekeler miss is a source-coverage gap, not a linker bug.** His college, Western State (D-II), has no rows in the ESPN CFB play-by-play source behind `load_college`; his ESPN id 3068267 appears in no college season.

**Scale.** 1,767 UDFA candidates (QB/RB/WR/TE/FB, rookie seasons 2008-2023); 1,197 linked, 570 unlinked and dropped. Only 15 of the 570 have any F1 VOR3, but they include large values: Victor Cruz 254.5, Ekeler 193.2, James Robinson 134.1, Tyrell Williams 69.2, Green-Ellis 58.1, Crowell 57.6, Tolbert 40.9, Meredith 31.2, Brate 23.2, Woodhead 21.4, Inman 14.7, Joique Bell 14.5, Donnell 9.1, Armstrong 7.9, Shaheed 1.3.

**Two causes.**
1. Coverage (12 of 15): FCS / D-II / Ivy schools absent from the source (UMass 2009, Western State, Illinois State, Western Oregon, Coastal Carolina, Harvard, Chadron State, Wayne State, Grambling, West Texas A&M, Weber State).
2. Linker (3 of 15):
   - Green-Ellis: `college_name` "Mississippi; Indiana" (final school first) never matches "Ole Miss".
   - Inman (Virginia through 2010, rookie 2014) and Crowell (Georgia 2011, then Alabama State, rookie 2014) fall outside the final-season window of season-2..season-1.

**Design defect this exposes.** `udfas()` drops every unlinked row from the population, including for C0, the capital-only baseline, which needs no college features. The UDFA slot (pick 262) therefore learns its outcome from a pool missing the small-school producers. That is selection bias on exactly the tail an overall rating cares about.

**Fix plan (to be preregistered before any rescoring):**
- (a) Keep every UDFA candidate in the target population. College features stay missing when unlinked, and models that need them treat them as missing, never as dropped.
- (b) Split a multi-school `college_name` and match its first, final school. Add a Mississippi/Ole Miss alias if `school_sim` lacks one.
- (c) Gap-window fallback only on exact name, matching school and a unique id. Reject on ambiguity (the earlier namesake failures: Josh Johnson, Isaiah Davis).
- (d) Report the count of linked rows by method and the unlinked count by cause.

Do not tune on the panel. Ekeler stays a coverage case unless a lawful D-II source is added.
