# Washington DST position filter

Trevor explicitly asks Claude to fix missing DST option in position filter for
The Washington Football League. No app code changed by Codex.

Read project/site context and relevant skills. Verify actual Washington league
settings and route; do not hardcode league name. In site/js/app.js, leagueHasDef
around 3073 tests roster_positions.includes('DEF'); DEF option around 3075 and
row eligibility around 3159 are restricted to Weekly view. Redraft lineup already
supports K/DEF; normalization helpers around 7869 map DST to DEF.

Fix position options and matching rows consistently, with user-facing DST label,
DEF/DST alias support and appropriate real data/sort. Preserve dynasty asset-only
exclusions, leagues without defense slots and IDP distinction. Trace callers and
reuse existing UI. Preserve unrelated app.js/data changes and active prospect
model research session f522bb8d. Isolate worktree and safely integrate local fix.
Add minimal meaningful regression check, run relevant tests/node --check plus
scoped verify-app.py/browser check. No redesign, push, deployment or external sends.
Finish concrete local fix and concise outcome.

Claude launcher was missing after an incomplete global 2.1.289 update: npm shim
absent and bin/claude.exe contained installer placeholder because optional native
package was missing. Rebuild restored shim but not native binary. Reinstalling
same version with optional dependencies to repair existing tool, not change model.
