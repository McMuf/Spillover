# Governance

Spillover is maintained in the open on GitHub. This page says who decides what, and what nobody can
decide.

## What no one can change

- **A grade.** Verdicts come only from the published rules applied to frozen predictions and market
  data. Votes, comments, popularity and maintainers cannot change one.
- **A registered claim.** It is frozen when it merges. A change is a new version; the old version
  stays on record.
- **The record.** Predictions, events and outcomes are append-only. A wrong event is withdrawn by a
  reviewed line in `labels/retracted.txt` with its reason; the original stays visible.

## Roles

- **Maintainers** review and merge pull requests, run releases, and moderate. Today there is one
  maintainer (@McMuf); the project is looking for co-maintainers.
- **Contributors** write claims, challenges, replications, labels, code and docs.

A contributor becomes a co-maintainer after a sustained record of reviewed contributions, proposed in
a public issue and agreed by the existing maintainers.

## Review scope

Claims are reviewed for clarity and testability only, never for whether they are a good idea.

**Today** the single maintainer registers the seed claims directly, so those claims have had no
independent review; that is stated here rather than hidden. **Once there is a second maintainer,**
maintainers cannot merge their own claims, and every claim needs another maintainer's approval.

## Rules changes

Every change to scoring rules is recorded in the rules-change table in
[docs/methodology.md](docs/methodology.md), bumps `RULES_VERSION`, and applies only to claims registered
afterwards. Rules 0.2 corrected errors found by an outside review before any claim had been graded;
affected claims were registered again as new versions and the old versions stay on record as
superseded. From now on, rules changes get a public pull request open for at least seven days before
they merge.

## Moderation

Removed: claims or comments that target individuals, promote specific trades or pump thinly traded
assets, spam, and anything illegal. Removals are logged in the pull request or discussion where they
happen. Disagreements go to an issue, decided by the maintainers, with the reasoning written down.

## Triage

Issues and pull requests are triaged weekly. Security reports follow [SECURITY.md](SECURITY.md).
