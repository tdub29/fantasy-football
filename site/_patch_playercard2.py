"""Rewire playerModal onto the number band and the three-tab shell.

Five text-anchored edits, each asserted unique before it is applied, because a
concurrent writer is shifting app.js line numbers during this session.
"""
import io
import sys

P = 'js/app.js'

# 1. age moves into band cell 6, so drop it from the identity row.
OLD_AGE = """          (() => { const a = ageOf(sleeper?.id, ranked?.age ?? sleeper?.age); return a != null ? h('span', { class:'muted' }, `age ${fmt.decimal(a, 1)}`) : null; })(),
"""
NEW_AGE = ""

# 2. the whole value/tier/category chip row is now band cells 1-4.
OLD_CHIPS = """        ranked ? h('div', { class:'row gap-4', style:{ marginBottom:'12px', alignItems:'baseline' } },
          (ourCatChip(sleeper?.id) || pillCategory(ranked.category)), (ourTierChip(sleeper?.id) || tierChip(ranked.tier, ranked.category)),
          (() => { const mp = mispricingIndex().get(String(sleeper?.id || ranked._sleeperId));
            const val = tierValue(ranked, primaryLeague() || {});
            return h('span', { class:'price-line',
              title: `Dynasty value on the site's 0-110 scale (KTC market ${ranked.ktcValue != null ? ranked.ktcValue : Math.round(val * 100)} ÷ 100). Same scale as every Value column, PV/FV, and the trade calculator.` },
              h('strong', { class:'tnum' }, `Value ${fmt.decimal(val, 0)}`),
              mp ? h('span', { class:'tip', style:{ marginLeft:'6px' } }, `· ${ranked.pos}${mp.valRank} value · ${ranked.pos}${mp.projRank} proj` ) : null,
            ); })(),
        ) : null,
"""
NEW_CHIPS = ""

# 3. band goes directly under the verdict banner, and Source notes leaves this
#    position for the Value tab.
OLD_AFTER_VERDICT = """          ); })(),
        ranked?.note ? h('div', { class:'card', style:{ background:'var(--bg-2)', marginBottom:'12px' } },
          h('div', { class:'card-title' }, 'Source notes'),
          h('div', null, ranked.note),
          h('div', { class:'tip', style:{ marginTop:'6px' } }, `from ${ranked._src} / ${ranked._ranking}`)
        ) : null,
        thisWeekBlock(sleeper),
"""
NEW_AFTER_VERDICT = """          ); })(),
        // The six numbers, directly under the verdict they justify.
        numberBand(ranked, sleeper),
        thisWeekBlock(sleeper),
"""

# 4. the reference blocks go behind three tabs. thisWeekBlock and the exposure
#    table stay above it: they are the live answer, not reference.
OLD_BLOCKS = """        // Live numbers, then the season-long reference, then the dated tail.
        projectionBlock(sleeper, close),
        envInfoLine(sleeper),
        scheduleStrip(sleeper),
        historyBlock(sleeper),
        contextBlock(sleeper),
        playerInfoBlock(name, sleeper),
"""
NEW_BLOCKS = """        // Everything below is reference, so it goes behind three tabs. Value is
        // what he is worth, Production is what he scores, Context is why. An
        // empty group drops its own tab, so an unmatched player does not get a
        // tab bar leading to three blank panels.
        modalTabs([
          { key:'value', label:'Value', nodes: [
            ktcValueChart(sleeper),
            ranked?.note ? h('div', { class:'card', style:{ background:'var(--bg-2)', marginBottom:'12px' } },
              h('div', { class:'card-title' }, 'Source notes'),
              h('div', null, ranked.note),
              h('div', { class:'tip', style:{ marginTop:'6px' } }, `from ${ranked._src} / ${ranked._ranking}`)
            ) : null,
          ] },
          { key:'production', label:'Production', nodes: [
            projectionBlock(sleeper, close),
            historyBlock(sleeper),
          ] },
          { key:'context', label:'Context', nodes: [
            envInfoLine(sleeper),
            scheduleStrip(sleeper),
            contextBlock(sleeper),
            playerInfoBlock(name, sleeper),
          ] },
        ]),
"""

# 5. ktcRangeSlice filters on a real date, so the series has to carry one. The
#    label stays as it was, so careerChartOne's axis is unchanged.
OLD_SERIES = """      return vals.map((v, i) => ({ y: `20${dates[i].slice(0,2)}-${dates[i].slice(2,4)}`, v }));"""
NEW_SERIES = """      // `d` is the raw YYMMDD, carried so ktcRangeSlice can cut on a real date
      // instead of assuming a fixed sample interval. `y` stays the axis label.
      return vals.map((v, i) => ({ y: `20${dates[i].slice(0,2)}-${dates[i].slice(2,4)}`, v, d: dates[i] }));"""

# 6. KTC is its own chart at the top of the Value tab now, so historyBlock's
#    chart is points-per-game only and loses its tab strip.
OLD_CCHART = """      careerChart([
        { key:'ppg', label:'PPG', unit:`${fpLabel} per game`,
          pts:(hist.spark || []).map(d => ({ y:String(d.y), v:d.v })) },
        // KTC is dynasty market value, so it only earns a tab in a dynasty league.
        // It is also absent until build_ktc_history.py has run, and careerChart drops
        // any series under two points, so both cases fall back to PPG alone.
        { key:'ktc', label:'KTC value', unit:'KTC dynasty value',
          pts: ktcValueSeries(sleeper.name, histLeague) || [] },
      ]),"""
NEW_CCHART = """      // KTC value was the second tab here. It is now ktcValueChart() opening the
      // Value tab with its own range control, so this chart is production only
      // and careerChart renders it with no tab strip at all.
      careerChart([
        { key:'ppg', label:'PPG', unit:`${fpLabel} per game`,
          pts:(hist.spark || []).map(d => ({ y:String(d.y), v:d.v })) },
      ]),"""

EDITS = [
    ('drop duplicate age', OLD_AGE, NEW_AGE),
    ('drop value/tier chip row', OLD_CHIPS, NEW_CHIPS),
    ('insert numberBand under verdict', OLD_AFTER_VERDICT, NEW_AFTER_VERDICT),
    ('wrap reference blocks in tabs', OLD_BLOCKS, NEW_BLOCKS),
    ('carry raw date on ktc series', OLD_SERIES, NEW_SERIES),
    ('historyBlock chart is PPG only', OLD_CCHART, NEW_CCHART),
]


def main() -> int:
    s = io.open(P, encoding='utf-8').read()
    if 'numberBand(ranked, sleeper),' in s:
        print('already rewired, nothing to do')
        return 0
    for label, old, new in EDITS:
        n = s.count(old)
        if n != 1:
            print('ABORT on "%s": anchor found %d times, expected 1' % (label, n))
            return 1
    for label, old, new in EDITS:
        s = s.replace(old, new, 1)
        print('  ok  %s' % label)
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('playerModal rewired')
    return 0


if __name__ == '__main__':
    sys.exit(main())
