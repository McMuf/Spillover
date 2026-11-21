# Methodology

How Spillover decides whether a kind of news moves a market, as the engine does it today
(rules version **0.2**). The code is the reference: [`engine/spillover/eventstudy.py`](../engine/spillover/eventstudy.py)
(the statistic and test), [`engine/spillover/scoreboard.py`](../engine/spillover/scoreboard.py) (verdicts) and
[`engine/spillover/scoring.py`](../engine/spillover/scoring.py) (grading frozen predictions). If this page and the
code disagree, the code is wrong; please open an issue.

## The idea

On the day of a headline the whole market also moves, so a raw price change says little about the
headline. An **event study** first estimates what the instrument would normally have done, from a
calm stretch of history before the event. The gap between what happened and that normal level is
the **abnormal return**. Adding the abnormal returns across the claim's window gives the
**cumulative abnormal return (CAR)**. Do that for many events of the same kind and ask whether the
average is distinguishable from zero. This is the standard method (MacKinlay 1997; Brown and Warner
1985); Spillover's contribution is applying it in public, to claims frozen before the events.

## One event, step by step

1. **Find events.** Events whose type matches the claim's `event_type` and whose entity is one of its
   `trigger_entities`. Several matching entities on one event count once.
2. **Day 0** is the first trading day on or after the event date. With daily data, news before the
   open and after the close land on the same trading day, so day 0 is a whole day. News published
   at or after 16:00 New York time is dated to the next session.
3. **Estimation window:** the 120 trading days ending 10 trading days before day 0. The 10-day gap
   keeps run-up and leaked news out of the idea of a normal day.
4. **Clean estimation days (rules 0.2).** Days of *other* known news are left out of the estimation
   window: every scheduled event of any type (Fed decisions, CPI, jobs reports) and every event of
   the claim's own type, from its day 0 through the claim's window length. An event needs at least
   60 clean days, otherwise it is dropped and counted as "not enough history".
5. **Baseline.** `factor_only` fits `return = alpha + beta * market` by ordinary least squares on the
   clean days (several factors are allowed). `constant_mean` uses the instrument's own average
   return; it is used when the instrument *is* the market (the S&P 500 has no separate market to
   subtract), so a factor model would explain everything with itself.
6. **Abnormal return** for each window day: actual minus the baseline's prediction. **CAR**: their sum
   over the window (`+1 trading day` means day 0 and day +1).
7. **Contaminated events.** If another scheduled event falls inside the claim's window, the event is
   dropped and counted: its move cannot be told apart from the other news.
8. **Collapse overlaps.** If two events' windows overlap, only the first is kept. Ten headlines
   about one story are one test, not ten.

### Why sum abnormal returns across the window?

News is not absorbed in one tick: prices can move before the open, keep adjusting the next day, or
partly reverse. Summing the daily abnormal returns over the window measures the *total* abnormal
move the claim is about, whatever its timing inside the window. For small daily simple returns the
sum is very close to the compounded abnormal return; the difference matters for long windows,
which is why long-horizon check-ins are reported as descriptions, not verdicts. Summing also keeps
the statistic additive and its variance easy to reason about (about `n_days * sigma^2` under no
effect), which is what the test needs.

### What collapsing overlaps does to the sample

The statistic treats events as independent. Two events whose windows overlap share days, so their
CARs are partly the same numbers; counting both would overstate the evidence and shrink the interval
dishonestly. Collapsing keeps the first, so the **effective sample** is the number of independent
windows. It can be much smaller than the number of headlines (one story repeated by many outlets is
one event), and the site always shows both counts: matched, dropped for history, dropped for overlap
with scheduled news, collapsed, and effective.

## What is tested

- **`abnormal_return`** (direction claims): the CAR. Positive means the instrument beat its baseline.
- **`abs_excess_return`** (bigger-moves claims), **changed in rules 0.2**: the *rank* of the move's size.
  The engine computes `|CAR|` and compares it with the sizes of every same-length run of clean
  estimation days: the share of those ordinary windows that moved less. The tested value is that
  share minus one half, so 0 means typical and +0.3 means "bigger than 80% of ordinary windows". This
  is in the family of nonparametric rank tests for event studies (Corrado 1989).

## The test (rules 0.2)

Across the effective events, the engine takes the mean of the tested values and a **Student
t-interval** (95%, `n - 1` degrees of freedom) and the matching two-sided p-value. A claim's verdict:

| Status | When |
|---|---|
| **Proposed** | Registered, with fewer effective forward events than it requires (at least 8). |
| **Supported** | The fixed sample is complete, the interval excludes zero in the stated direction, and the result survives the false-discovery-rate adjustment. |
| **Not supported** | The fixed sample is complete and the interval excludes zero in the opposite direction. |
| **Inconclusive** | The fixed sample is complete, but the interval includes zero or the result did not survive the adjustment. It means "cannot tell", not "failed". |

### Why the test changed in rules 0.2

Rules 0.1 used a **percentile bootstrap** interval. An outside review simulated it at the minimum
sample of 8 events and found too many false positives; the project reproduced this before any claim
was graded. Share of 3,000–4,000 simulated claims with **no real effect** that the method would call
significant at a nominal 5% (two-sided):

| Data, 8 events | Percentile bootstrap (0.1) | Student t on the CAR (0.2) | t on the size rank (0.2) |
|---|---|---|---|
| Normal returns | 10.9% | 4.4–5.0% | 5.9–6.1% |
| Fat-tailed returns (t, 3 df) | 12.1% | 3.7–4.5% | 5.5–5.9% |
| Old size measure (`|CAR|` minus typical), skewed | 18.4% | n/a | n/a |

The percentile bootstrap is known to under-cover with small samples: its interval is roughly a
normal interval with the population variance replaced by the (smaller, biased) plug-in variance, and
no small-sample correction. The t-interval's multiplier grows when there are few events. The old
size measure was also lopsided (sizes cannot be negative), which no symmetric interval handles well
at `n = 8`; ranks are close to uniform under no effect, which fixes that. Because a "Supported"
verdict also needs the stated direction, its false-positive rate is about half the two-sided figure
(about 2–3%), before the false-discovery-rate adjustment lowers it further. The simulation is
reproduced by tests in `engine/tests/test_eventstudy.py`, and `spillover placebo-check` runs the same
check on real data with random dates.

### Fixed stopping (rules 0.2)

A claim states how many forward events it needs (`min_forward_events`, at least 8). The verdict uses
**exactly the first that many effective events**, in the order their windows opened. Recomputing the
status after every new event and stopping when it first looks significant ("optional stopping")
inflates false positives far above 5%; a fixed sample removes that freedom. Later events are graded
and shown on the claim page, but never change the verdict.

### Many claims (false discovery rate)

Test enough claims and some will look real by luck. P-values are adjusted with Benjamini-Hochberg.
Since rules 0.2 each claim is adjusted together with the claims that completed their fixed sample on
or before the day it did, so a claim that finishes later can never move an earlier verdict.

## Frozen predictions and what the timestamp proves

When a new qualifying event appears, the engine writes a **prediction** for every registered claim it
triggers, before the claim's window closes, and commits it to an append-only ledger with its SHA-256
hash. Each prediction is also submitted to **OpenTimestamps**, which anchors a digest of the file in a
Bitcoin block.

What the proof shows: the exact bytes of that prediction existed no later than that block's time. A
prediction whose proof predates the window's close cannot have been written with knowledge of the
outcome, and changing a single byte breaks both the hash and the proof.

What it does not show: that the claim is a good idea, that the event data or prices are correct,
that the engine scored it correctly (the code and data are public for that), or that nobody wrote
other predictions and kept them private. The last is covered differently: every registered claim
gets a prediction for every qualifying event, automatically, by a public workflow; claims cannot
pick which events count.

## Placebo and controls

`clm_placebo_random_dates_*` tests random dates, where nothing should show up; if it is ever
significant, the engine has a bug, and the site raises an alert. `clm_fomc_abs_move_spx_*` is a
**positive control**: bigger S&P 500 moves on Fed days are well documented, so the engine should find
it. The other seed claims are the first real tests; claims about companies wait for single-stock
prices.

## What this cannot tell you

Whether a pattern will persist; why it happens (an event study measures behavior around dates, not
mechanism); anything finer than a day; or much from a thin sample (wide intervals are shown, not
hidden). Long-horizon check-ins (months to years) are descriptive: over long windows the market
model's errors pile up and many other things happen, so they are never graded. Nothing here is
investment advice.

## Rules changes

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-15 | First rules: percentile bootstrap, `|CAR|` minus typical size for bigger-move claims. |
| 0.2 | 2026-11-20 | Student t-interval; size rank for bigger-move claims; clean estimation days (at least 60); fixed stopping at the stated sample; false-discovery adjustment by completion order. Applied to claims registered afterwards: every claim registered under 0.1 was registered again as a new version, the old versions stay on record as superseded. No claim had been graded. |

## References

- MacKinlay, A. C. (1997). Event studies in economics and finance. *Journal of Economic Literature*, 35(1), 13–39.
- Brown, S. J., and Warner, J. B. (1985). Using daily stock returns: The case of event studies. *Journal of Financial Economics*, 14(1), 3–31.
- Corrado, C. J. (1989). A nonparametric test for abnormal security-price performance in event studies. *Journal of Financial Economics*, 23(2), 385–395.
- Benjamini, Y., and Hochberg, Y. (1995). Controlling the false discovery rate. *Journal of the Royal Statistical Society, Series B*, 57(1), 289–300.
- Hall, P. (1988). Theoretical comparison of bootstrap confidence intervals. *The Annals of Statistics*, 16(3), 927–953.
