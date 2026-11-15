// Generates TypeScript types and a bundled claim schema from the engine's JSON Schemas.
// The Pydantic models are the source of truth: change a field there, run this, and the UI
// shows compile errors where it no longer matches.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = resolve(root, "web", "src", "generated");
await mkdir(out, { recursive: true });

const claimSchema = JSON.parse(await readFile(resolve(root, "schemas", "claim.schema.json"), "utf8"));
const siteSchema = JSON.parse(await readFile(resolve(root, "schemas", "site.schema.json"), "utf8"));

// The claim JSON Schema is also bundled for live validation in the submit form.
await writeFile(resolve(out, "claim.schema.json"), JSON.stringify(claimSchema, null, 2) + "\n");

// Pydantic puts a "title" on every property, which makes json-schema-to-typescript emit one
// alias per field. Keep titles only on the named definitions.
function stripTitles(node, keep = false) {
  if (Array.isArray(node)) return node.forEach((n) => stripTitles(n));
  if (node && typeof node === "object") {
    if (!keep) delete node.title;
    for (const [k, v] of Object.entries(node)) {
      if (k === "$defs") for (const [name, def] of Object.entries(v)) { stripTitles(def); def.title = name; }
      else if (k !== "title") stripTitles(v);
    }
  }
}
// Pydantic emits tuples as `prefixItems`; json-schema-to-typescript wants tuple-style `items`.
function tuples(node) {
  if (Array.isArray(node)) return node.forEach(tuples);
  if (node && typeof node === "object") {
    if (Array.isArray(node.prefixItems)) {
      node.items = node.prefixItems;
      node.minItems = node.prefixItems.length;
      node.maxItems = node.prefixItems.length;
      delete node.prefixItems;
    }
    Object.values(node).forEach(tuples);
  }
}
tuples(siteSchema);
stripTitles(siteSchema);
siteSchema.title = "SiteData";
const banner = "/* AUTO-GENERATED from schemas/*.json by web/scripts/gen.mjs. Do not edit. */";
const types = await compile(siteSchema, "SiteData", {
  bannerComment: banner,
  additionalProperties: false,
  unreachableDefinitions: true,
  style: { singleQuote: false },
});
await writeFile(resolve(out, "site.ts"), types);
console.log("generated web/src/generated/{site.ts,claim.schema.json}");
