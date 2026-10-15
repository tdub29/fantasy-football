---
name: league-week
description: Use for fact-only weekly digests of Trevor's Sleeper leagues. Triggers on "recap the week", "write a recap for the group chat", "league recap", "who won this week", "how's my matchup", "am I winning", "where do I stand this week", "what moves happened", "who picked up who", "waiver results", "any trades", "league activity". Three modes: a group-chat recap of a finished week, Trevor's live matchup state, and a brief of recent adds, drops, bids and trades. Start/sit calls belong to /lineup-check; trade and waiver advice belong to the dynasty-* skills.
---

# League week

Adapted from the weekly-league-recap, analyze-matchup and activity-brief skills in
[Flaim Fantasy](https://github.com/jdguggs10/flaim-fantasy) (MIT), rebuilt on key-free Sleeper reads.

## Step 1: get the facts

Every score, record, name and bid in the write-up comes from this script's output. Never from memory.

```bash
PYTHONIOENCODING=utf-8 python projections/league_week.py recap   [--league taco] [--week 5]
PYTHONIOENCODING=utf-8 python projections/league_week.py matchup [--league taco]
PYTHONIOENCODING=utf-8 python projections/league_week.py moves   [--league yuH] [--days 2]
```

`--league` matches part of a league name; without it every Sleeper league prints. Recap defaults
to the last week whose NFL games are all final. The ESPN league prints as skipped: say so, do not guess it.

## Mode: recap (for the group chat)

Under about 250 words per league, warm and lightly teasing, written to be pasted.

1. **Headline**: one line on the story of the week.
2. **Results**: every game, winner first with both scores. Call out the closest game and the biggest blowout.
3. **Standings**: top three, any big mover, and the playoff line once the season is past its midpoint.
4. **Moves**: the two or three most interesting. A big FAAB bid or a trade beats a kicker swap.
5. **Sign-off**: one line pointing at next week.

Use team names, never owner names. Tease the result, never the person. When the script says the league
plays the weekly median, a record counts two results a week: a 9-1 team after five weeks lost once, to the median or an opponent.

## Mode: matchup (Trevor's live state)

1. Score line on top: Trevor's team vs the opponent, current points.
2. Remaining starters for both teams, grouped by when they play (playing now, then yet to play).
3. Outlook in one short paragraph: comfortable, tight or uphill, and the one or two players who swing it.

Analytical, not dramatic. No roster moves here: point start/sit questions to `/lineup-check`.
Sleeper's projection is a projection; say "Sleeper projects", never "will score".

## Mode: moves (activity brief)

1. One-sentence topline: how busy the league was and the single most notable move.
2. Bucket by time (overnight, yesterday, earlier), then by team.
3. One line per plain add or drop. A waiver claim says why the player appeals. A trade gets a few
   lines on what each side gains.
4. **Bold** each player's name on first mention.

Why a player appeals is a current fact: check fresh reporting on the web and name the source and date.
If nothing current turns up, say the reason is unknown rather than reaching back to memory.

## Honesty rules

- An empty or missing value is unknown, not zero.
- First place in the standings is not a title, and a playoff spot is not clinched until the math says so.
- A traded pick prints as "originally <team>": that team made the pick slot, the receiver owns it now.
  Never derive a draft slot from roster order or snake order.
- Never print internal IDs (roster, player or league ids) in the write-up.
- No em dashes or en dashes in anything written for the chat.
