import fs from "node:fs";
import fg from "fast-glob";
import { buildMatchers, inRanges } from "./matchers.js";
import { deltaE } from "./color.js";

// Replaces hardcoded values with var(--token) in-place.
// A CSS variable is valid everywhere a literal is (plain CSS, styled-components,
// inline style objects, Tailwind [...], Vue <style>), so one uniform text
// replacement covers React, Vue, and Next without framework-specific AST.
// ponytail: regex replace of self-delimiting syntax; --dry-run + clean-git guard
// back it up. Move to AST only if a real false positive appears.
export async function apply(config, matchMap, { dryRun }) {
  const matchers = buildMatchers(config);
  const files = await fg(config.patterns, {
    cwd: config.cwd,
    ignore: config.ignore,
    absolute: true,
  });

  // Color tokens for approx (ΔE) nearest-match lookup.
  const colorTokens = [...matchMap.entries()]
    .filter(([, t]) => t.category === "color")
    .map(([canon, t]) => ({ canon, name: t.name }));
  const threshold = config.approxDeltaE ?? 0;

  const nearest = (canon) => {
    let best = null;
    for (const t of colorTokens) {
      const d = deltaE(canon, t.canon);
      if (d <= threshold && (!best || d < best.d)) best = { ...t, d };
    }
    return best;
  };

  const results = [];
  let total = 0;

  for (const file of files) {
    let text = fs.readFileSync(file, "utf8");
    const hits = [];

    for (const m of matchers) {
      const ranges = m.blocked ? m.blocked(text) : null;
      text = text.replace(m.re, (...args) => {
        const raw = args[0];
        const offset = args[args.length - 2];
        if (ranges && inRanges(offset, ranges)) return raw;
        const canon = m.canonical(raw);
        if (!canon) return raw;
        let tok = matchMap.get(canon);
        let approx = null;
        if (!tok && m.category === "color" && threshold > 0) {
          const n = nearest(canon);
          if (n) {
            tok = { name: n.name };
            approx = n.d;
          }
        }
        if (!tok) return raw;
        hits.push({ from: raw, to: `var(--${tok.name})`, approx });
        return `var(--${tok.name})`;
      });
    }

    if (hits.length === 0) continue;
    total += hits.length;
    results.push({ file: file.replace(config.cwd + "/", ""), hits });
    if (!dryRun) fs.writeFileSync(file, text);
  }

  return { results, total };
}
