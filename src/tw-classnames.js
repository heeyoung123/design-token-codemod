import fs from "node:fs";
import fg from "fast-glob";
import { canonicalColor } from "./color.js";
import { loadTokens } from "./tokens.js";

// Tailwind-only codemod: `text-[#hex]` -> `text-primary-400`.
// dtoken emits var(), which can't become a named utility because dtoken's regex
// never sees the `text-[` prefix. Here we keep the prefix and swap the literal
// for the token name (Tailwind auto-generates the utility from your @theme palette).
// ponytail: regex on self-delimiting `-[#hex]`; # only appears for colors, so it
// won't hit non-color arbitrary values. --dry-run + clean git back it up.

const UTIL = /-\[(?:color:)?(#[0-9a-fA-F]{3,8})\]/g;

// token name -> utility suffix: drop a leading "color-" (that prefix lives in
// --color-* but not in the utility, e.g. text-primary-400).
const suffix = (name) => name.replace(/^color-/, "");

export async function applyTailwind(config, { dryRun } = {}) {
  const tokens = loadTokens(config.tokensFile);
  const byHex = new Map(); // canonical hex -> suffix
  for (const [name, t] of Object.entries(tokens)) {
    if ((t.category ?? "color") !== "color") continue;
    const canon = canonicalColor(t.match ?? t.value);
    if (canon) byHex.set(canon, suffix(name));
  }

  const files = await fg(config.patterns, {
    cwd: config.cwd,
    ignore: config.ignore,
    absolute: true,
  });

  const results = [];
  let total = 0;

  for (const file of files) {
    let text = fs.readFileSync(file, "utf8");
    const hits = [];
    text = text.replace(UTIL, (raw, hex) => {
      const canon = canonicalColor(hex);
      const name = canon && byHex.get(canon);
      if (!name) return raw; // no token for this color -> leave it
      const to = `-${name}`;
      hits.push({ from: raw, to });
      return to;
    });
    if (hits.length === 0) continue;
    total += hits.length;
    results.push({ file: file.replace(config.cwd + "/", ""), hits });
    if (!dryRun) fs.writeFileSync(file, text);
  }

  return { results, total };
}
