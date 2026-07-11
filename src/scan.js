import fs from "node:fs";
import fg from "fast-glob";
import { buildMatchers, inRanges } from "./matchers.js";

// Scans files for hardcoded values across all enabled matchers. Returns:
//   canonical -> { category, count, files:Set, samples:[{file,line,raw}] }
export async function scan(config) {
  const matchers = buildMatchers(config);
  const files = await fg(config.patterns, {
    cwd: config.cwd,
    ignore: config.ignore,
    absolute: true,
    dot: false,
  });

  const found = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const rel = file.replace(config.cwd + "/", "");
    for (const m of matchers) {
      const ranges = m.blocked ? m.blocked(text) : null;
      for (const hit of text.matchAll(m.re)) {
        if (ranges && inRanges(hit.index, ranges)) continue;
        const canon = m.canonical(hit[0]);
        if (!canon) continue;
        const line = text.slice(0, hit.index).split("\n").length;
        const e = found.get(canon) ??
          { category: m.category, count: 0, files: new Set(), samples: [] };
        e.count++;
        e.files.add(rel);
        if (e.samples.length < 3) e.samples.push({ file: rel, line, raw: hit[0] });
        found.set(canon, e);
      }
    }
  }
  return { files, found };
}
