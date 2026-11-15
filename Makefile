.PHONY: setup check fmt test-claim test-all site ingest help

UV ?= uv
# Avoid uv warning about an unrelated active virtualenv (conda, etc.).
unexport VIRTUAL_ENV

help:
	@echo "make setup                         install the toolchain and dependencies"
	@echo "make check                         lint, type-check, test, validate claims and schema"
	@echo "make fmt                           auto-format and apply safe lint fixes"
	@echo "make test-claim CLAIM=claims/x.yaml  feasibility and event-study report for one claim"
	@echo "make test-all                      run every claim, FDR-adjusted across the set"
	@echo "make site                          (planned, M3) build and serve the web app"
	@echo "make ingest                        (planned) fetch live data into the local cache"

setup:
	@command -v $(UV) >/dev/null 2>&1 || python3 -m pip install --user uv
	$(UV) sync
	@if [ -f web/package.json ]; then pnpm --dir web install; \
	else echo "web/ has no package.json yet (planned, M3): skipping pnpm install"; fi

check:
	$(UV) run ruff format --check .
	$(UV) run ruff check .
	$(UV) run pyright
	$(UV) run pytest
	$(UV) run spillover validate
	$(UV) run spillover schema --check

fmt:
	$(UV) run ruff format .
	$(UV) run ruff check --fix .

test-claim:
ifndef CLAIM
	$(error usage: make test-claim CLAIM=claims/your_claim.yaml)
endif
	$(UV) run spillover test-claim $(CLAIM)

test-all:
	$(UV) run spillover test-all

site:
	@echo "The web app is not built yet (planned, milestone M3)."; exit 1

ingest:
	@echo "Live data ingestion is not built yet (planned). Everything runs on fixtures for now."; exit 1
