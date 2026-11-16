"""A headline run that did nothing useful must say why, so scheduled runs fail loudly."""

from spillover.cli import headline_run_problem
from spillover.ingest.headline_run import HeadlineSummary


def test_missing_key_is_a_problem() -> None:
    msg = headline_run_problem(HeadlineSummary(feeds_ok=2, fetched=45, pending_no_client=45))
    assert msg is not None and "ANTHROPIC_API_KEY" in msg


def test_every_call_failing_names_the_error_type_and_a_likely_fix() -> None:
    errors = [f"h{i}: model call failed (BadRequestError)" for i in range(3)]
    msg = headline_run_problem(HeadlineSummary(feeds_ok=2, extraction_errors=errors))
    assert msg is not None and "BadRequestError" in msg and "billing" in msg

    auth = ["h1: model call failed (AuthenticationError)"]
    msg = headline_run_problem(HeadlineSummary(feeds_ok=2, extraction_errors=auth))
    assert msg is not None and "rejected" in msg


def test_a_partial_failure_or_a_quiet_feed_is_fine() -> None:
    one_refusal = ["h1: the model declined to answer this headline"]
    assert (
        headline_run_problem(
            HeadlineSummary(feeds_ok=2, live_calls=9, extraction_errors=one_refusal)
        )
        is None
    )
    assert headline_run_problem(HeadlineSummary(feeds_ok=2, fetched=45, already_stored=45)) is None
