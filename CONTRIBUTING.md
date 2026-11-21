# Contributing to Spillover

Thanks for helping. Spillover is a public notebook with a referee: people write down what they think
a kind of news does to a market, the claim is frozen, and the market grades it. Every contribution
goes through a pull request, so it is reviewed in public.

## Ways to help

| You want to | Do this |
|---|---|
| Ask a half-formed question | Use the site's **Questions** page (GitHub Discussions, Q&A category). No form, low bar. |
| Write a claim | Use the guided form on the site (**Write a claim**). It fills in the YAML and opens GitHub's editor; choose "Create a new branch and start a pull request". Or copy `claims/_template.yaml` by hand. |
| Disagree with a claim | Open a **challenge** or write a **counter-claim** (the claim page links both). |
| Re-run a claim on other data | Open a **replication** (`replications/`). |
| Label headlines | The site's **Label** page. Labels measure the automatic labeler; they are never used to grade claims directly. |
| Improve the engine or site | Open an issue first for anything large, then a pull request. |

## Before you open a pull request

```sh
make setup        # install the engine (uv) and the website (pnpm)
make check        # lint, type-check, test, validate claims and schemas
make test-claim CLAIM=claims/your_claim_v1.yaml   # for a claim: the backtest report
```

- Sign off every commit: `git commit -s` (Developer Certificate of Origin).
- Keep claims about a **kind** of event (a Fed decision, an earnings beat), not one story; the form
  warns when an idea is a one-off.
- Do not edit a registered claim. Change it by adding a new version (`_v2`); the old one stays on
  record.

## What review checks

Reviews check that a claim is **clear and testable** (a kind of event, a priced market, a window, a
direction and a falsifier), never whether it is a good idea. The market decides that. The bot comment
on every pull request runs the backtest and points out problems.

## Rules changes

Scoring rules are versioned (`RULES_VERSION` in `engine/spillover/ledger.py`) and described in
[docs/methodology.md](docs/methodology.md). A change applies only to claims registered afterwards and
gets a public pull request with at least seven days for comments. See [GOVERNANCE.md](GOVERNANCE.md).

## Conduct

Challenge claims, not people. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
