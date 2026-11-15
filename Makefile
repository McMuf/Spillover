.PHONY: setup check check-web e2e export-data headlines fmt test-claim test-all site ingest help

UV ?= uv
# Avoid uv warning about an unrelated active virtualenv (conda, etc.).
unexport VIRTUAL_ENV

help:
	@echo "make setup                         install the toolchain and dependencies"
	@echo "make check                         lint, type-check, test, validate claims and schema"
	@echo "make fmt                           auto-format and apply safe lint fixes"
	@echo "make test-claim CLAIM=claims/x.yaml  feasibility and event-study report for one claim"
	@echo "make test-all                      run every claim, FDR-adjusted across the set"
	@echo "make check-web                     web: generate types, type-check, unit tests, build"
	@echo "make e2e                           browser smoke test against the built site"
	@echo "make site                          export the data and serve the web app (needs pnpm)"
	@echo "make ingest                        fetch prices and events into data/cache (needs data/sources.toml)"
	@echo "make headlines                     fetch feeds and extract events (needs ANTHROPIC_API_KEY for new ones)"

setup:
	@command -v $(UV) >/dev/null 2>&1 || python3 -m pip install --user uv
	$(UV) sync
	@if [ -f web/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then pnpm --dir web install; \
	  else echo "pnpm not found: install it (https://pnpm.io/installation) to work on web/"; fi; \
	fi

check:
	$(UV) run ruff format --check .
	$(UV) run ruff check .
	$(UV) run pyright
	$(UV) run pytest
	$(UV) run spillover validate
	$(UV) run spillover schema --check
	$(UV) run spillover verify-ledger
	$(UV) run spillover verify-outcomes

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

check-web: export-data
	pnpm --dir web typecheck
	pnpm --dir web test
	pnpm --dir web build

e2e: export-data
	pnpm --dir web build
	pnpm --dir web e2e

# The website reads one generated, typed JSON file. Never committed.
export-data:
	$(UV) run spillover export-site

site: export-data
	pnpm --dir web install
	pnpm --dir web dev

ingest:
	$(UV) run spillover ingest

headlines:
	$(UV) run spillover ingest-headlines
