"""Turn a two-sided prop price into the number the market actually expects.

Taking `consensus_line` alone throws away half the market's information. That is fine
for yardage, where the line grid is dense enough that books move the LINE and the price
sits at ~50/50 (measured 2026-08-18: median fair p(over) 0.496-0.500, and 0-8% of props
more than 5pp off a coin flip). It is wrong for touchdowns, where the grid is half-TD
wide: a book that thinks 6.2 cannot post 6.2, so it posts 5.5 and charges for the over.
29% of rush-TD and 18% of rec-TD props sit more than 5pp off 50/50. That lean IS the
line's fractional part.

Pair the prices correctly or not at all. BettingPros' `over.odds` and `under.odds` are
the BEST price on each side, from different books, AT DIFFERENT LINES -- 97 of 107
rec-yard props have over.line != under.line. Devigging those two against each other is
meaningless (it read Chris Olave's over as -140 when that price belonged to a 999.5 line,
not the 1050.5 consensus). Only `consensus_odds`, which is one coherent price pair at the
consensus line, is safe to devig.

Counts use Poisson, which needs no volatility guess: for a half-integer line L,
p(over) = P(X >= ceil(L)), so solve for the lambda that reproduces the fair probability.
Yards use a normal with a per-stat coefficient of variation, which IS a guess and is
exposed as a knob rather than buried.
"""
import math

# Season-long CV (sd / mean) for yardage, dominated by games-missed risk rather than
# per-game variance. Knob: raise it and a given price lean moves the line further.
# Fit it against realized seasons if that ever matters; the shift is small either way.
CV = {"pass_yd": 0.28, "rush_yd": 0.38, "rec_yd": 0.35}
COUNT_STATS = {"pass_td", "rush_td", "rec_td", "pass_int", "rec"}

# Beyond this lean the posted line is not a median, it is an ALT RUNG. The tell is
# clustering: 8 different players share a posted 749.5 rush/rec-yard line, because that
# is the lowest rung anyone boards for a backup, and the price (under -1011) carries the
# whole message. Poisson can answer that honestly for counts -- solving P(X>=6)=0.27
# yields Kyler Murray at 4.3 rush TDs, which is simply correct. A normal cannot, because
# out there the answer is driven entirely by the guessed CV and the tail is the wrong
# shape. So counts solve uncapped; yardage past this lean is DROPPED, and Sleeper's
# projection fills the slot with an honest borrow flag instead.
# ponytail: one threshold, no per-stat table until a measurement asks for one.
MAX_YARD_LEAN = 0.10


def implied(american):
    """American odds -> raw implied probability (still contains the vig)."""
    if american is None:
        return None
    a = float(american)
    return (-a) / ((-a) + 100) if a < 0 else 100 / (a + 100)


def fair_prob(over_odds, under_odds):
    """Multiplicative devig of a coherent two-way price. None if either side is missing.

    Multiplicative (proportional) rather than additive: additive can push a heavy
    favourite past 1.0, and the fancier alternatives (power, Shin) need a parameter
    fit that 5% hold on a season prop does not justify.
    """
    po, pu = implied(over_odds), implied(under_odds)
    if po is None or pu is None:
        return None
    total = po + pu
    return po / total if total > 0 else None


def _norm_ppf(p):
    """Inverse standard normal (Acklam's rational approximation, ~1e-9 absolute)."""
    if not 0 < p < 1:
        raise ValueError(p)
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q, r = p - 0.5, (p - 0.5) ** 2
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def _poisson_sf(k, lam):
    """P(X >= k) for Poisson(lam), summed from 0 to keep it stable at small lam."""
    if k <= 0:
        return 1.0
    cdf, term = math.exp(-lam), math.exp(-lam)
    for i in range(1, k):
        term *= lam / i
        cdf += term
    return max(0.0, 1.0 - cdf)


def _poisson_mean_for(k, p_over, lo=0.01, hi=60.0):
    """Solve P(X >= k) = p_over for lambda. Monotone in lambda, so bisect."""
    for _ in range(60):
        mid = (lo + hi) / 2
        if _poisson_sf(k, mid) < p_over:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def market_mean(stat, line, over_odds, under_odds):
    """The market's expected value for `stat`, price included.

    Returns (mean, fair_p_over, method). Two deliberate non-answers:
      - one side unpriced      -> the raw line, unshifted. Never invent a lean from
                                  a single price.
      - yardage, extreme lean  -> mean is None, meaning "drop this row". The posted
                                  number is an alt rung, not a market median, and a
                                  normal tail off a guessed CV is not evidence.
    """
    p = fair_prob(over_odds, under_odds)
    if line is None:
        return None, p, "no-line"
    if p is None or not 0.001 < p < 0.999:
        return line, p, "line-only"

    if stat in COUNT_STATS:
        # over a 5.5 line means 6 or more; an integer line can push, so treat it as
        # strictly greater. Uncapped on purpose: Poisson has no free parameter here.
        k = int(line) + 1 if line == int(line) else math.ceil(line)
        return round(_poisson_mean_for(k, p), 2), p, "poisson"

    cv = CV.get(stat)
    if cv is None:
        return line, p, "line-only"
    if abs(p - 0.5) > MAX_YARD_LEAN:
        return None, p, "alt-line"
    return round(line + cv * line * _norm_ppf(p), 2), p, "normal"


def demo():
    # a coin-flip price must leave the line where it is
    m, p, _ = market_mean("rec_yd", 1050.5, -110, -110)
    assert abs(p - 0.5) < 1e-9 and abs(m - 1050.5) < 0.01, (m, p)

    # Olave's real consensus pair: -115 / -110 is a 0.5pp lean, so a tiny nudge up
    m, p, meth = market_mean("rec_yd", 1050.5, -115, -110)
    assert 0.505 < p < 0.506, p
    assert 1050.5 < m < 1060 and meth == "normal", (m, meth)

    # a 5.5 TD line priced -150 over means the market's mean is above 5.5
    m, p, meth = market_mean("rush_td", 5.5, -150, +120)
    assert p > 0.55 and m > 5.5 and meth == "poisson", (m, p, meth)

    # ... and juice on the under pulls it below, roughly symmetrically
    m2, p2, _ = market_mean("rush_td", 5.5, +120, -150)
    assert p2 < 0.45 and m2 < 5.5, (m2, p2)
    assert abs((m - 5.5) - (5.5 - m2)) < 1.0, "symmetric prices, roughly symmetric shift"

    # counts solve uncapped: Kyler Murray's real 5.5 @ 178/-4902 is ~4.3 rush TDs,
    # and clamping that to 4.95 was strictly worse than the honest answer.
    m, p, meth = market_mean("rush_td", 5.5, 178, -4902)
    assert 4.0 < m < 4.7 and meth == "poisson", (m, meth)

    # yardage at the same extreme is an alt rung, so it is refused rather than guessed
    m, p, meth = market_mean("rush_yd", 749.5, 355, -1011)
    assert m is None and meth == "alt-line" and p < 0.25, (m, meth, p)

    # a moderate yardage lean is still answered
    m, p, meth = market_mean("rec_yd", 900.5, -130, +105)
    assert meth == "normal" and m > 900.5, (m, meth)

    # one side unpriced: no lean may be invented
    assert market_mean("rec_yd", 900.5, -140, None) == (900.5, None, "line-only")

    # devig is direction-correct and vig-free
    assert fair_prob(-110, -110) == 0.5
    assert fair_prob(-200, +150) > 0.6

    # Poisson inversion round-trips
    lam = _poisson_mean_for(6, 0.42)
    assert abs(_poisson_sf(6, lam) - 0.42) < 1e-6

    print("devig demo ok")


if __name__ == "__main__":
    demo()
