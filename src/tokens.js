import fs from "node:fs";
import path from "node:path";

// tokens file schema (human-editable):
//   "color-black": { "value": "#000000", "match": "#000000", "count": 42, "category": "color" }
//   - key      = token name  -> becomes CSS var --<key>
//   - value    = CSS value emitted into :root
//   - match    = canonical value used to find occurrences (rename the key freely)
//   - category = which matcher produced it (color | dimension)

export function loadTokens(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveTokens(file, tokens) {
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2) + "\n");
}

// canonical -> { name, value, category }
export function toMatchMap(tokens) {
  const map = new Map();
  for (const [name, t] of Object.entries(tokens)) {
    map.set(t.match ?? t.value, { name, value: t.value, category: t.category ?? "color" });
  }
  return map;
}

export function writeCssTokens(file, tokens, selector) {
  const lines = Object.entries(tokens).map(([name, t]) => `  --${name}: ${t.value};`);
  const css = `${selector} {\n${lines.join("\n")}\n}\n`;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, css);
}

// Style Dictionary format: nested { category: { leaf: { value } } }.
// Feed this to `style-dictionary` to generate SCSS/JS/iOS/Android from one source.
const CATEGORY_KEY = { color: "color", dimension: "size" };
export function writeStyleDictionary(file, tokens) {
  const out = {};
  for (const [name, t] of Object.entries(tokens)) {
    const top = CATEGORY_KEY[t.category ?? "color"] ?? "misc";
    const leaf = name.replace(/^(color|size)-/, "");
    (out[top] ??= {})[leaf] = { value: t.value };
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}
