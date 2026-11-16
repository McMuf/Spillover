import type { Backtest, SiteClaim, SiteData } from "./generated/site";

/** Fully typed factories: if the engine's schema changes, these stop compiling. */
export function makeBacktest(over: Partial<Backtest> = {}): Backtest {
  return {
    claim_id: "clm_demo_v1",
    statement: "demo",
    instrument: "ABC · us_equity",
    baseline: "factor_only",
    measure: "abnormal_return",
    expected_sign: "negative",
    window_days: 2,
    data_synthetic: true,
    as_of: "2025-12-26",
    n_matched: 40,
    n_no_history: 2,
    n_scheduled_overlap: 1,
    n_overlap_collapsed: 1,
    n_effective: 36,
    min_events: 8,
    mean: -0.0123,
    ci_lo: -0.02,
    ci_hi: -0.004,
    p_value: 0.004,
    n_boot: 1000,
    seed: 0,
    verdict: "Consistent with the claim in sample",
    events: [{ event_id: "ev1", event_date: "2025-01-02", car: -0.01, value: -0.01 }],
    ...over,
  };
}

export function makeClaim(id = "clm_demo_v1", over: Partial<SiteClaim> = {}): SiteClaim {
  return {
    claim: {
      id,
      statement: "After a headline, ABC falls by more than the market explains.",
      event_type: "DEMO_EVENT",
      trigger_entities: ["ABC"],
      instrument: { venue: "us_equity", symbol: "ABC", basket: null },
      window: { start: "first_report", end: "+1_trading_day" },
      expected_sign: "negative",
      decompose: [],
      baseline: "factor_only",
      factor: "MKT",
      factors: null,
      measure: "abnormal_return",
      confidence: null,
      success: { spillover_ci_excludes_zero: true, min_forward_events: 8 },
      falsifier: "The interval includes zero after eight forward events.",
      registered_by: "someone",
      registered_at: "set_by_ci_on_merge",
    },
    yaml: "id: " + id + "\n",
    status: "Draft",
    backtest: makeBacktest({ claim_id: id }),
    backtest_error: null,
    chart: null,
    forward_log: [],
    event_ids: ["ev1"],
    challenges: [],
    replications: [],
    ...over,
  };
}

export function makeSite(claims: SiteClaim[] = [makeClaim()]): SiteData {
  return {
    schema_version: 1,
    meta: { repo: "McMuf/Spillover", engine_version: "0", rules_version: "0.1", data_synthetic: true, data_as_of: "2025-12-26" },
    claims,
    events: [{ event_id: "ev1", event_type: "DEMO_EVENT", entities: ["ABC"], date: "2025-01-02", scheduled: false, source: "test", claims: [] }],
    scoreboard: {
      schema_version: 1,
      rules_version: "0.1",
      engine_version: "0",
      as_of: null,
      synthetic: true,
      claims: [],
      contributors: [],
      calibration: [],
      placebo: { claims: [], alert: false, message: "No placebo claim has shown a significant result." },
      notes: [],
    },
  };
}
