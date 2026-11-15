import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import claimSchema from "../generated/claim.schema.json";

export interface ClaimForm {
  id: string;
  statement: string;
  eventType: string;
  entities: string;
  venue: string;
  symbol: string;
  windowEnd: string;
  expectedSign: "positive" | "negative";
  baseline: "factor_only" | "constant_mean";
  minEvents: number;
  falsifier: string;
  handle: string;
}

export const EMPTY_FORM: ClaimForm = {
  id: "clm__v1",
  statement: "",
  eventType: "",
  entities: "",
  venue: "us_equity",
  symbol: "",
  windowEnd: "+1_trading_day",
  expectedSign: "negative",
  baseline: "factor_only",
  minEvents: 8,
  falsifier: "",
  handle: "",
};

const indent = (text: string): string =>
  text
    .trim()
    .split("\n")
    .map((l) => `  ${l.trim()}`)
    .join("\n");

/** The claim as a YAML file, in the same layout as claims/_template.yaml. */
export function toYaml(f: ClaimForm): string {
  const entities = f.entities
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .join(", ");
  return [
    `id: ${f.id.trim()}`,
    "",
    "statement: >",
    indent(f.statement || "REPLACE_ME"),
    "",
    `event_type: ${f.eventType.trim() || "REPLACE_ME"}`,
    `trigger_entities: [${entities}]`,
    "",
    `instrument: {venue: ${f.venue.trim()}, symbol: ${f.symbol.trim()}}`,
    "",
    `window: {start: first_report, end: ${f.windowEnd.trim()}}`,
    `expected_sign: ${f.expectedSign}`,
    "",
    `baseline: ${f.baseline}`,
    "",
    `success: {spillover_ci_excludes_zero: true, min_forward_events: ${f.minEvents}}`,
    "",
    "falsifier: >",
    indent(f.falsifier || "REPLACE_ME"),
    "",
    `registered_by: ${f.handle.trim() || "YOUR_GITHUB_HANDLE"}`,
    "registered_at: set_by_ci_on_merge",
    "",
  ].join("\n");
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateClaim = ajv.compile(claimSchema);

const PLACEHOLDERS = ["REPLACE_ME", "YOUR_GITHUB_HANDLE", "TICKER_OR_ENTITY_ID"];

/** Human-readable problems, from the engine's own JSON Schema plus the placeholder rules. */
export function validateYaml(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (e) {
    return [`The YAML does not parse: ${e instanceof Error ? e.message : String(e)}`];
  }
  const problems: string[] = [];
  if (!validateClaim(parsed)) {
    for (const err of validateClaim.errors ?? []) {
      const where = err.instancePath.replace(/^\//, "").replace(/\//g, ".") || "claim";
      problems.push(`${where}: ${err.message ?? "invalid"}`);
    }
  }
  for (const p of PLACEHOLDERS) {
    if (text.includes(p)) problems.push(`Replace the placeholder ${p} with real content.`);
  }
  return problems;
}

export function pullRequestUrl(repo: string, id: string, yamlText: string): string {
  const q = new URLSearchParams({ filename: `${id}.yaml`, value: yamlText });
  return `https://github.com/${repo}/new/main/claims?${q.toString()}`;
}
