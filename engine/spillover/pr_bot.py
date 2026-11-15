"""The trusted pull-request comment bot.

Security model (this is the point of the module):

* It runs from ``main`` in a ``workflow_run`` job and never checks out or executes the PR's code.
* A PR's files are fetched through the GitHub API **as text** and validated by *this* trusted code,
  so a PR cannot forge a passing report by shipping its own checker or its own artifact.
* Every string that came from the PR is shown inside a code span, length-limited and stripped of
  backticks and line breaks, so a crafted claim cannot inject links, images, headings or
  ``@mentions`` into the comment.
* It only ever updates a comment that it (``github-actions[bot]``) wrote itself.

The report is advisory. Review still decides what merges.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

from spillover.data import DataError, MarketData
from spillover.eventstudy import run_backtest
from spillover.frozen import frozen_violations, is_claim_path, is_submission_path
from spillover.lanes import (
    Replication,
    apply_changes,
    check_target,
    parse_challenge,
    parse_replication,
)
from spillover.models import ClaimError, parse_claim

MARKER = "<!-- spillover-bot:pr-report -->"
BOT_LOGIN = "github-actions[bot]"
MAX_FILE_BYTES = 64 * 1024
MAX_COMMENT_CHARS = 20_000
MAX_CLAIMS_REVIEWED = 10
_CLAIM_PATH = re.compile(r"^claims/[A-Za-z0-9_]+\.yaml$")
_LANE_PATH = re.compile(r"^(challenges|replications)/[A-Za-z0-9_]+\.yaml$")
# "." and ".." are made of allowed characters but are path components, never real names.
_REPO = re.compile(r"^(?!\.{1,2}/)[A-Za-z0-9_.-]+/(?!\.{1,2}$)[A-Za-z0-9_.-]+$")
_SHA = re.compile(r"^[0-9a-f]{40}$")

CHECKLIST = [
    "The statement is one sentence a non-expert can understand",
    "The event type is from the taxonomy (or an issue proposes a new type)",
    "The instrument has a venue",
    "The window and expected sign are fixed and stated",
    "`falsifier` says what would prove the claim wrong",
    "Enough independent events exist (run `make test-claim`), or a small sample is explained",
    "Commits are signed off (`git commit -s`)",
    "I understand a registered claim cannot be edited, only versioned",
]


class BotError(RuntimeError):
    """The bot could not do its job (bad input, GitHub API failure)."""


# --- GitHub API --------------------------------------------------------------------------------

Request = Callable[[str, str, dict[str, Any] | None], Any]


def make_request(token: str) -> Request:
    """A tiny GitHub REST client. The token is only ever sent to api.github.com."""

    def request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"https://api.github.com{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "spillover-pr-bot",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                payload = resp.read()
        except urllib.error.HTTPError as exc:
            raise BotError(f"GitHub API {method} {path} failed: HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise BotError(f"GitHub API {method} {path} failed: {type(exc).__name__}") from None
        return json.loads(payload) if payload else None

    return request


def _paginate(request: Request, path: str, limit: int = 30) -> list[Any]:
    out: list[Any] = []
    sep = "&" if "?" in path else "?"
    for page in range(1, limit + 1):
        chunk = request("GET", f"{path}{sep}per_page=100&page={page}", None)
        out.extend(chunk)
        if len(chunk) < 100:
            break
    return out


# --- untrusted text ----------------------------------------------------------------------------


def code(text: str, limit: int = 160) -> str:
    """Show PR-supplied text inertly: one line, no backticks, truncated, inside a code span."""
    flat = re.sub(r"\s+", " ", text.replace("`", "'")).strip()
    flat = "".join(ch for ch in flat if ch.isprintable())
    if len(flat) > limit:
        flat = flat[: limit - 1] + "…"
    return f"`{flat}`"


# --- review ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Feasibility:
    n_matched: int
    n_effective: int
    min_events: int
    mean: float | None
    ci_lo: float | None
    ci_hi: float | None
    verdict: str
    synthetic: bool


@dataclass(frozen=True)
class ClaimReview:
    path: str
    claim_id: str | None
    errors: list[str]
    feasibility: Feasibility | None
    note: str | None
    kind: str = "claim"


@dataclass(frozen=True)
class PrReview:
    claims: list[ClaimReview]
    frozen: list[str]
    notes: list[str] = field(default_factory=lambda: list[str]())


def review_claim(path: str, text: str, data: MarketData | None) -> ClaimReview:
    try:
        claim = parse_claim(text, path)
    except ClaimError as exc:
        lines = str(exc).splitlines()
        # Validation errors come as "<path>: invalid claim" plus one line per problem.
        errors = lines[1:] if lines and lines[0].endswith("invalid claim") else [str(exc)]
        return ClaimReview(path, None, errors, None, None)

    if data is None:
        return ClaimReview(path, claim.id, [], None, "No data directory was available to the bot.")
    if claim.id != PurePosixPath(path).stem:
        return ClaimReview(
            path, claim.id, [f"file name must match the claim id ({claim.id}.yaml)"], None, None
        )
    try:
        report = run_backtest(claim, data, n_boot=1000)
    except DataError as exc:
        return ClaimReview(
            path,
            claim.id,
            [],
            None,
            "Feasibility not run: CI has no price data for this claim "
            f"(CI never uses live data or keys). Run `make test-claim` locally. ({exc})",
        )
    if report.n_matched == 0:
        return ClaimReview(
            path,
            claim.id,
            [],
            None,
            f"Feasibility not run: no events of type {claim.event_type} exist in the data CI has. "
            "Run `make test-claim` locally against your own data.",
        )
    return ClaimReview(
        path,
        claim.id,
        [],
        Feasibility(
            report.n_matched,
            report.n_effective,
            report.min_events,
            _finite(report.mean),
            _finite(report.ci_lo),
            _finite(report.ci_hi),
            report.verdict,
            report.data_synthetic,
        ),
        None,
    )


def review_submission(path: str, text: str, base_claims_dir: Path) -> ClaimReview:
    """Review a challenge or replication. The target claim comes from trusted main, not the PR."""
    kind = "challenge" if path.startswith("challenges/") else "replication"
    try:
        item = parse_challenge(text, path) if kind == "challenge" else parse_replication(text, path)
    except ClaimError as exc:
        lines = str(exc).splitlines()
        errors = lines[1:] if lines and "invalid" in lines[0] else [str(exc)]
        return ClaimReview(path, None, errors, None, None, kind)
    if PurePosixPath(path).stem != item.id:
        return ClaimReview(
            path, item.id, [f"file name must match the id ({item.id}.yaml)"], None, None, kind
        )

    target_file = base_claims_dir / f"{item.claim}.yaml"  # claim ids are pattern-validated
    try:
        target = (
            parse_claim(target_file.read_text(encoding="utf-8"), item.claim)
            if target_file.exists()
            else None
        )
    except ClaimError:
        target = None
    problem = check_target(target, item.claim)
    if problem is None and isinstance(item, Replication) and target is not None:
        try:
            apply_changes(target, item.changes)
        except ClaimError as exc:
            problem = str(exc)
    if problem is not None:
        return ClaimReview(path, item.id, [problem], None, None, kind)
    note = (
        f"Targets {item.claim}. After merge the engine runs the replication and writes the result."
        if kind == "replication"
        else f"Targets {item.claim}."
    )
    return ClaimReview(path, item.id, [], None, note, kind)


def _finite(x: float) -> float | None:
    return None if math.isnan(x) or math.isinf(x) else x


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{'+' if x >= 0 else '−'}{abs(x) * 100:.2f}%"


def render_comment(review: PrReview) -> str:
    lines = [
        MARKER,
        "### Spillover checks",
        "",
        "_Advisory. Produced by trusted CI from this pull request's files read as data; "
        "no code from the pull request was run. Reviewers decide what merges._",
        "",
        "**Frozen files**",
    ]
    if review.frozen:
        lines += [f"- ❌ {code(v, 220)}" for v in review.frozen]
    else:
        lines.append("- ✅ No registered claim or generated output is touched.")

    lines += ["", "**Claims in this pull request**"]
    if not review.claims:
        lines.append("- None changed.")
    for c in review.claims:
        head = code(c.path, 100)
        if c.errors:
            lines.append(f"- ❌ {head} does not validate:")
            lines += [f"  - {code(e, 200)}" for e in c.errors[:12]]
            continue
        lines.append(f"- ✅ {head} is a valid {c.kind} (`{c.claim_id}`).")
        f = c.feasibility
        if f is not None:
            tag = " on SYNTHETIC fixture data (a smoke test only)" if f.synthetic else ""
            lines.append(
                f"  - Backtest{tag}: {f.n_matched} matching events, {f.n_effective} effective "
                f"(claim requires {f.min_events}); estimate {_pct(f.mean)} "
                f"[{_pct(f.ci_lo)}, {_pct(f.ci_hi)}]. {code(f.verdict, 200)}"
            )
        elif c.note:
            lines.append(f"  - {code(c.note, 300)}")

    for note in review.notes:
        lines += ["", f"_{code(note, 200)}_"]

    lines += ["", "**Reviewer checklist**"]
    lines += [f"- [ ] {item}" for item in CHECKLIST]
    lines += ["", "_Research, not investment advice._"]
    body = "\n".join(lines)
    if len(body) > MAX_COMMENT_CHARS:
        body = body[: MAX_COMMENT_CHARS - 40] + "\n\n_(comment truncated)_"
    return body


# --- orchestration -----------------------------------------------------------------------------


def _map_status(status: str) -> str:
    return {"added": "A", "removed": "D"}.get(status, "M")


def changes_from_files(files: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """GitHub's file list as (A|M|D, path); a rename is a delete of the old path plus an add."""
    out: list[tuple[str, str]] = []
    for f in files:
        if f.get("status") == "renamed" and f.get("previous_filename"):
            out.append(("D", str(f["previous_filename"])))
            out.append(("A", str(f["filename"])))
        else:
            out.append((_map_status(str(f.get("status", ""))), str(f["filename"])))
    return out


def _fetch_text(request: Request, repo: str, path: str, ref: str) -> str:
    meta = request("GET", f"/repos/{repo}/contents/{path}?ref={ref}", None)
    if not isinstance(meta, dict) or meta.get("encoding") != "base64":
        raise BotError(f"{path}: unexpected response from GitHub")
    if int(meta.get("size", 0)) > MAX_FILE_BYTES:
        raise BotError(f"{path}: larger than {MAX_FILE_BYTES // 1024} KB, not reviewed")
    try:
        return base64.b64decode(str(meta["content"])).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        raise BotError(f"{path}: not readable as UTF-8 text") from None


def find_pull_request(request: Request, repo: str, head_sha: str) -> int | None:
    for pr in request("GET", f"/repos/{repo}/commits/{head_sha}/pulls", None):
        if (
            pr.get("state") == "open"
            and pr.get("base", {}).get("repo", {}).get("full_name") == repo
            and pr.get("head", {}).get("sha") == head_sha
        ):
            return int(pr["number"])
    return None


def build_review(
    request: Request,
    repo: str,
    pr_number: int,
    head_repo: str,
    head_sha: str,
    base_claims_dir: Path,
    data: MarketData | None,
) -> PrReview:
    files = _paginate(request, f"/repos/{repo}/pulls/{pr_number}/files")
    changes = changes_from_files(files)
    notes: list[str] = []
    if len(files) >= 3000:
        notes.append(
            "This pull request changes 3000+ files; GitHub lists no more, so some are unchecked."
        )

    head_text: dict[str, str] = {}
    reviews: list[ClaimReview] = []
    claim_changes = [
        (s, p) for s, p in changes if s != "D" and (is_claim_path(p) or is_submission_path(p))
    ]
    for _status, path in claim_changes[:MAX_CLAIMS_REVIEWED]:
        if not (_CLAIM_PATH.match(path) or _LANE_PATH.match(path)):
            reviews.append(
                ClaimReview(path, None, ["unexpected file name for a claim"], None, None)
            )
            continue
        try:
            head_text[path] = _fetch_text(request, head_repo, path, head_sha)
        except BotError as exc:
            reviews.append(ClaimReview(path, None, [str(exc)], None, None))
            continue
        if _LANE_PATH.match(path):
            reviews.append(review_submission(path, head_text[path], base_claims_dir))
        else:
            reviews.append(review_claim(path, head_text[path], data))
    if len(claim_changes) > MAX_CLAIMS_REVIEWED:
        notes.append(f"Only the first {MAX_CLAIMS_REVIEWED} claim files are reviewed here.")

    def read_base(path: str) -> str:
        local = base_claims_dir / PurePosixPath(path).name
        # A claim missing on main (deleted since this branch started) counts as a draft.
        return (
            local.read_text(encoding="utf-8")
            if local.exists()
            else "registered_at: set_by_ci_on_merge"
        )

    def read_head(path: str) -> str:
        if path in head_text:
            return head_text[path]
        if not (_CLAIM_PATH.match(path) or _LANE_PATH.match(path)):
            return ""
        return _fetch_text(request, head_repo, path, head_sha)

    try:
        frozen = frozen_violations(changes, read_base, read_head)
    except BotError as exc:
        frozen = [f"could not check frozen files: {exc}"]
    return PrReview(reviews, frozen, notes)


def upsert_comment(request: Request, repo: str, pr_number: int, body: str) -> str:
    """Create the bot's comment or update its previous one. Returns 'created' or 'updated'."""
    comments = _paginate(request, f"/repos/{repo}/issues/{pr_number}/comments")
    mine = [
        c
        for c in comments
        if c.get("user", {}).get("login") == BOT_LOGIN and MARKER in str(c.get("body", ""))
    ]
    if mine:
        request("PATCH", f"/repos/{repo}/issues/comments/{mine[-1]['id']}", {"body": body})
        return "updated"
    request("POST", f"/repos/{repo}/issues/{pr_number}/comments", {"body": body})
    return "created"


def run(
    request: Request,
    repo: str,
    head_sha: str,
    head_repo: str,
    base_claims_dir: Path,
    data: MarketData | None,
    dry_run: bool = False,
) -> tuple[str, str]:
    """Do the whole job. Returns (outcome, comment body); outcome says what was done."""
    if not (_REPO.match(repo) and _REPO.match(head_repo) and _SHA.match(head_sha)):
        raise BotError("repository names and the commit sha must be well-formed")
    pr = find_pull_request(request, repo, head_sha)
    if pr is None:
        return "no open pull request for this commit", ""
    review = build_review(request, repo, pr, head_repo, head_sha, base_claims_dir, data)
    body = render_comment(review)
    if dry_run:
        return f"dry run for #{pr}", body
    return f"{upsert_comment(request, repo, pr, body)} comment on #{pr}", body
