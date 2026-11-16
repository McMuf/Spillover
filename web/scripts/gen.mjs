// Generates TypeScript types and a bundled claim schema from the engine's JSON Schemas.
// The Pydantic models are the source of truth: change a field there, run this, and the UI
// shows compile errors where it no longer matches.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";
import { compile } from "json-schema-to-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = resolve(root, "web", "src", "generated");
await mkdir(out, { recursive: true });

const claimSchema = JSON.parse(await readFile(resolve(root, "schemas", "claim.schema.json"), "utf8"));
const siteSchema = JSON.parse(await readFile(resolve(root, "schemas", "site.schema.json"), "utf8"));

// The claim JSON Schema is also bundled for reference, and compiled to a plain validator function
// at build time. Ajv normally generates its validator with `new Function()` in the browser, which a
// strict Content-Security-Policy forbids; compiling here means the browser never evaluates code.
await writeFile(resolve(out, "claim.schema.json"), JSON.stringify(claimSchema, null, 2) + "\n");

const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } });
addFormats(ajv);
const validator = ajv.compile(claimSchema);
// Ajv's standalone output pulls two helpers in with CommonJS require(), which does not exist in a
// browser ES module. Both are tiny, so they are inlined here instead.
let code = standaloneCode(ajv, validator);
code = code.replaceAll(
  'require("ajv/dist/runtime/ucs2length").default',
  "((s) => { let n = 0; for (const _ of s) n++; return n; })",
);
code = code.replaceAll(
  'require("ajv-formats/dist/formats").fullFormats["date-time"]',
  `{ validate: (s) => typeof s === "string" && /^\\d{4}-\\d{2}-\\d{2}[Tt ]\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?([Zz]|[+-]\\d{2}:\\d{2})$/.test(s) && !Number.isNaN(Date.parse(s.replace(" ", "T"))) }`,
);
if (/\brequire\(|new Function|\beval\(/.test(code)) {
  throw new Error("the generated validator still needs require() or runtime code generation");
}
await writeFile(resolve(out, "validateClaim.js"), code);
await writeFile(
  resolve(out, "validateClaim.d.ts"),
  `export interface ValidationIssue { instancePath: string; message?: string }
declare function validate(data: unknown): boolean;
declare namespace validate { let errors: ValidationIssue[] | null | undefined }
export default validate;
`,
);

// Pydantic puts a "title" on every property, which makes json-schema-to-typescript emit one
// alias per field. Keep titles only on the named definitions.
function stripTitles(node, keep = false) {
  if (Array.isArray(node)) return node.forEach((n) => stripTitles(n));
  if (node && typeof node === "object") {
    if (!keep) delete node.title;
    for (const [k, v] of Object.entries(node)) {
      if (k === "$defs") for (const [name, def] of Object.entries(v)) { stripTitles(def); def.title = name; }
      // A "properties" map is keyed by FIELD names: a field may itself be called "title", so walk
      // into each field's schema instead of treating the map as a schema.
      else if (k === "properties") for (const field of Object.values(v)) stripTitles(field);
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
