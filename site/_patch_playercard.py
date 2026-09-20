"""One-shot patch: insert numberBand / ktcValueChart / modalTabs into app.js.

Kept as a file rather than a heredoc because app.js is being rewritten by a
concurrent writer, so the insertion is anchored on matched TEXT and asserts the
anchor is unique before touching anything.
"""
import io
import sys

P = 'js/app.js'
ANCHOR = "  function playerModal(name, ranked, sleeper) {"

NEW = r'''  // ============================================================
  // Player card: the six numbers, the value chart, the tab shell
  // ============================================================

  // VOR needs the projection record, which projectionBlock looks up inline. The
  // number band needs the same figure, so the lookup lives here rather than
  // being copied, because the offense/defense fallback order is the part that
  // would drift.
  function vorForSleeper(sleeper) {
    const O = window.OFFENSE_PROJ;
    if (!sleeper || !O) return null;
    for (const unit of ['offense', 'defense']) {
      const rec = (O[unit]?.players || []).find(pl => pl.id === sleeper.id);
      if (!rec) continue;
      const lg = primaryLeague();
      if (!lg) return null;
      const v = vorForPlayer(rec, lg, unit, O[unit].default);
      return v == null ? null : { v, unit, league: lg };
    }
    return null;
  }

  // Every figure here was already computed and already on the card. It was
  // printed as two stacked rows of loose chips, so answering "is he worth more
  // than he scores" meant hunting two rows for two numbers that were never
  // adjacent. Six cells, one scroll rail, same order on every player. The old
  // rows are gone, so nothing is printed twice.
  function numberBand(ranked, sleeper) {
    const pid = String(sleeper?.id || ranked?._sleeperId || '');
    const lg = primaryLeague() || {};
    const mp = pid ? mispricingIndex().get(pid) : null;
    const pos = String(ranked?.pos || sleeper?.pos || '').toUpperCase();
    const cells = [];

    const cell = (label, value, sub, opts = {}) => h('div', {
      class: 'num-cell', title: opts.title || '',
    },
      h('div', { class: 'num-cell-label' }, label),
      h('div', { class: 'num-cell-value tnum', style: opts.color ? { color: opts.color } : null }, value),
      h('div', { class: 'num-cell-sub' }, sub == null ? '·' : sub),
    );

    // 1. Dynasty value on the site's 0-110 scale, with the raw KTC market
    //    number under it so the scale is never mistaken for the market.
    if (ranked) {
      const val = tierValue(ranked, lg);
      const mkt = ranked.ktcValue != null ? ranked.ktcValue : Math.round(val * 100);
      cells.push(cell('Value', fmt.decimal(val, 0),
        ranked.ktcValue != null ? 'KTC ' + ranked.ktcValue : 'derived',
        { title: 'Dynasty value on the 0-110 scale (KTC market ' + mkt + ' / 100). '
          + 'Same scale as every Value column, PV/FV and the trade calculator.' }));
    }

    // 2. Where that value sits inside his own position.
    if (mp && mp.valRank) {
      cells.push(cell('Value rank', mp.pos + mp.valRank, 'by dynasty value',
        { title: mp.pos + ' rank by dynasty value, across every projected ' + mp.pos + '.' }));
    }

    // 3. Tier and category. Chips rather than a number, because these two
    //    labels are what the whole framework branches on.
    if (ranked) {
      cells.push(h('div', { class: 'num-cell num-cell-chips' },
        h('div', { class: 'num-cell-label' }, 'Tier'),
        h('div', { class: 'num-cell-chiprow' },
          (ourTierChip(sleeper && sleeper.id) || tierChip(ranked.tier, ranked.category))),
        h('div', { class: 'num-cell-chiprow num-cell-sub' },
          (ourCatChip(sleeper && sleeper.id) || pillCategory(ranked.category))),
      ));
    }

    // 4. Projected points and their positional rank. This is the SEASON blended
    //    projection, which is what mispricingIndex ranks on. It is deliberately
    //    not labelled rest-of-season: no rest-of-season figure is computed
    //    anywhere in this file, and a wrong label on a right number is still
    //    wrong.
    if (mp && mp.pts != null) {
      cells.push(cell('Proj pts', fmt.decimal(mp.pts, 0),
        mp.projRank ? mp.pos + mp.projRank + ' by points' : null,
        { title: 'Blended season projection, and his ' + mp.pos + ' rank by those points. '
          + 'Paired with Value rank this is the mispricing: a value rank well below '
          + 'the points rank is the buy case.' }));
    }

    // 5. VOR, the only cell that answers "above what".
    const vor = vorForSleeper(sleeper);
    if (vor) {
      const lbl = vor.league.short_name || vor.league.name;
      const color = vor.v >= 30 ? 'var(--green)' : vor.v >= 0 ? 'var(--fg-1)' : 'var(--red)';
      cells.push(cell('VOR', (vor.v > 0 ? '+' : '') + fmt.decimal(vor.v, 0), lbl,
        { color, title: 'Value over replacement: projected points above the last '
          + 'startable player at this position in ' + lbl + '.' }));
    }

    // 6. Age against this position's sell age, the one cell that turns a number
    //    into a deadline.
    const age = ageOf(sleeper && sleeper.id, (ranked && ranked.age) != null ? ranked.age : (sleeper && sleeper.age));
    const curve = window.STRATEGY && window.STRATEGY.age_curve && window.STRATEGY.age_curve[pos];
    if (age != null) {
      const sell = curve && curve.sell_age;
      const hard = curve && curve.hard_sell_age;
      const color = sell == null ? null
        : age >= hard ? 'var(--red)' : age >= sell ? 'var(--amber)' : 'var(--green)';
      cells.push(cell('Age', fmt.decimal(age, 1),
        sell != null ? pos + ' sell ' + sell : 'no curve',
        { color, title: sell == null ? 'No age curve for this position.'
          : pos + ' peak ' + curve.peak_avg + ', sell window opens ' + sell + ', hard sell '
            + hard + '. Amber means the sell window is open, red means past hard sell.' }));
    }

    if (!cells.length) return null;
    return h('div', { class: 'num-band', role: 'group', 'aria-label': 'Key numbers' }, ...cells);
  }

  // Slice a KTC series to the last N months. The series carries its own raw
  // "YYMMDD" stamp precisely so this can filter on a real date rather than
  // assume a fixed sample interval, which is not fixed.
  function ktcRangeSlice(pts, months) {
    if (!months || !pts || !pts.length) return pts || [];
    const last = pts[pts.length - 1].d;
    if (!last) return pts;
    let yy = 2000 + Number(last.slice(0, 2));
    let mm = Number(last.slice(2, 4)) - months;
    while (mm <= 0) { mm += 12; yy -= 1; }
    const cut = String(yy % 100).padStart(2, '0') + String(mm).padStart(2, '0') + last.slice(4, 6);
    const kept = pts.filter(pt => pt.d >= cut);
    // A one-point window draws nothing, so fall back rather than render an
    // empty plot that reads as missing data.
    return kept.length >= 2 ? kept : pts;
  }

  // The KTC value chart, promoted out of historyBlock to open the VALUE tab. In
  // historyBlock it was the second tab of a chart whose first tab was points per
  // game, so the dynasty value history, the single most decision-relevant series
  // on the card, sat one click behind a production stat.
  function ktcValueChart(sleeper) {
    if (!sleeper) return null;
    const lg = routeLeague();
    const all = ktcValueSeries(sleeper.name, lg);
    if (!all || all.length < 2) return null;

    const RANGES = [
      { key: '3mo', label: '3 mo', months: 3 },
      { key: '1yr', label: '1 yr', months: 12 },
      { key: 'all', label: 'All', months: 0 },
    ];
    // 1 yr opens: three months of a dynasty value series is usually noise, and
    // the full history is often several years that flatten the last six months.
    let active = '1yr';
    const host = h('div', { class: 'ktcv-host' });
    const callout = h('div', { class: 'ktcv-callout' });
    const tabs = h('div', { class: 'cchart-tabs ktcv-tabs', role: 'tablist',
                            'aria-label': 'Value chart range' });

    const draw = () => {
      const r = RANGES.find(x => x.key === active) || RANGES[1];
      const pts = ktcRangeSlice(all, r.months);
      host.innerHTML = '';
      const plot = careerChartOne(pts, 'KTC ' + (lg && lg.is_superflex ? 'superflex' : '1QB') + ' value');
      if (plot) host.appendChild(plot);

      // Signed change across the VISIBLE window, which is the number the range
      // tabs exist to change. Percent as well as points, because +400 means very
      // different things on a 2,400 asset and a 900 one.
      const a = pts[0].v, b = pts[pts.length - 1].v;
      const d = Math.round(b - a);
      const sign = d > 0 ? '+' : d < 0 ? '−' : '';
      const pctTxt = a ? ' (' + sign + Math.abs(Math.round((d / a) * 1000) / 10) + '%)' : '';
      callout.innerHTML = '';
      callout.className = 'ktcv-callout ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
      callout.appendChild(h('strong', { class: 'tnum' }, sign + Math.abs(d) + pctTxt));
      callout.appendChild(h('span', { class: 'tip' },
        'over ' + (r.months ? r.label : pts.length + ' readings') + ', '
        + pts[0].y + ' to ' + pts[pts.length - 1].y));

      for (const btn of tabs.children) {
        const on = btn.dataset.key === active;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', String(on));
      }
    };

    for (const r of RANGES) {
      tabs.appendChild(h('button', {
        class: 'cchart-tab', type: 'button', role: 'tab', dataset: { key: r.key },
        'aria-selected': String(r.key === active),
        onclick: () => { active = r.key; draw(); },
      }, r.label));
    }

    draw();
    return h('section', { class: 'ktcv-block', 'aria-label': 'KTC dynasty value history' },
      h('div', { class: 'hist-head' },
        h('div', { class: 'card-title' }, 'Dynasty value'),
        tabs,
      ),
      callout,
      host,
    );
  }

  // Reference blocks behind three tabs. Reuses .tab-bar / .tab so the card gets
  // the 44px touch target and the mobile gutter handling the views already have,
  // instead of a second tab component that drifts from the first.
  let _pmTabSeq = 0;
  function modalTabs(sections) {
    const live = (sections || [])
      .map(sec => ({ key: sec.key, label: sec.label, nodes: (sec.nodes || []).filter(Boolean) }))
      .filter(sec => sec.nodes.length);
    if (!live.length) return null;
    // One surviving group is not a tab bar, it is just content. An unmatched
    // player with no projection and no history collapses to exactly that, and a
    // single tab you cannot leave is worse than no tab at all.
    if (live.length === 1) return h('div', { class: 'pm-panel' }, ...live[0].nodes);

    const uid = 'pm-tabs-' + (++_pmTabSeq);
    const bar = h('div', { class: 'tab-bar pm-tab-bar', role: 'tablist',
                           'aria-label': 'Player detail sections' });
    const panels = live.map((sec, i) => h('div', {
      class: 'pm-panel', role: 'tabpanel', id: uid + '-p' + i,
      'aria-labelledby': uid + '-t' + i, hidden: i !== 0,
    }, ...sec.nodes));

    const show = (n) => {
      panels.forEach((pan, i) => { pan.hidden = i !== n; });
      [...bar.children].forEach((btn, i) => {
        btn.classList.toggle('active', i === n);
        btn.setAttribute('aria-selected', String(i === n));
        btn.tabIndex = i === n ? 0 : -1;
      });
      // A table inside a hidden panel measures zero wide, so the width classes
      // only resolve once the panel is shown. Re-wrap on every switch.
      wrapDataTables();
    };

    live.forEach((sec, i) => bar.appendChild(h('button', {
      class: 'tab' + (i === 0 ? ' active' : ''), type: 'button', role: 'tab',
      id: uid + '-t' + i, 'aria-controls': uid + '-p' + i,
      'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1',
      onclick: () => show(i),
      onkeydown: (ev) => {
        const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        ev.preventDefault();
        const n = (i + step + live.length) % live.length;
        show(n);
        bar.children[n].focus();
      },
    }, sec.label)));

    return h('div', { class: 'pm-tabs' }, bar, ...panels);
  }

'''


def main() -> int:
    s = io.open(P, encoding='utf-8').read()
    if 'function numberBand' in s:
        print('already inserted, nothing to do')
        return 0
    n = s.count(ANCHOR)
    if n != 1:
        print('ABORT: anchor appears %d times, expected 1' % n)
        return 1
    s = s.replace(ANCHOR, NEW + ANCHOR, 1)
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('inserted %d chars before playerModal' % len(NEW))
    return 0


if __name__ == '__main__':
    sys.exit(main())
