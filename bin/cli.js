#!/usr/bin/env node
import { execSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadConfig } from "../src/config.js";
import { scan } from "../src/scan.js";
import { apply } from "../src/apply.js";
import { buildMatchers } from "../src/matchers.js";
import {
  loadTokens,
  saveTokens,
  toMatchMap,
  writeCssTokens,
  writeStyleDictionary,
} from "../src/tokens.js";

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));

function gitIsDirty(cwd) {
  try {
    return (
      execSync("git status --porcelain", { cwd, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() !== ""
    );
  } catch {
    return false; // not a git repo -> don't block
  }
}

// Returns getAnswer(prompt) -> Promise<string|null>, or null when not interactive.
// TTY: live readline (Ctrl-D resolves null, no hang). Piped: drain stdin up front,
// because readline/promises only reliably yields the first line from a pipe.
async function makeAsker(interactive) {
  if (!interactive) return null;
  if (!stdin.isTTY) {
    let data = "";
    for await (const chunk of stdin) data += chunk;
    const queue = data.split(/\r?\n/);
    return async (q) => {
      stdout.write(q);
      const a = queue.length ? queue.shift() : null;
      stdout.write((a ?? "") + "\n");
      return a;
    };
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let pending = null;
  rl.on("close", () => {
    if (pending) (pending(null), (pending = null));
  });
  const fn = (q) =>
    new Promise((res) => {
      pending = res;
      rl.question(q).then((a) => {
        if (pending) (pending = null), res(a);
      });
    });
  fn.close = () => rl.close();
  return fn;
}

// matcher.autoName keyed by category, for suggesting names
function nameSuggester(config) {
  const byCat = Object.fromEntries(buildMatchers(config).map((m) => [m.category, m]));
  return (canon, category) => byCat[category]?.autoName(canon) ?? canon;
}

async function cmdScan(config) {
  const interactive = flags.has("--interactive");
  const { files, found } = await scan(config);
  const tokens = loadTokens(config.tokensFile);
  const suggest = nameSuggester(config);

  const sorted = [...found.entries()].sort((a, b) => b[1].count - a[1].count);
  const getAnswer = await makeAsker(interactive); // string | null(=default & stop)

  for (const [canon, info] of sorted) {
    const existing = Object.entries(tokens).find(([, t]) => (t.match ?? t.value) === canon);
    if (existing) {
      existing[1].count = info.count;
      continue;
    }
    let name = suggest(canon, info.category);
    if (getAnswer) {
      const s = info.samples[0];
      const raw = await getAnswer(
        `${canon}  (${info.count}×, e.g. ${s.file}:${s.line})\n  name [${name}] (Enter=accept, s=skip): `,
      );
      const ans = (raw ?? "").trim(); // null = EOF -> accept default for this + remaining
      if (ans.toLowerCase() === "s") continue;
      if (ans) name = ans;
    }
    tokens[name] = { value: canon, match: canon, count: info.count, category: info.category };
  }
  getAnswer?.close?.();
  saveTokens(config.tokensFile, tokens);

  if (!interactive) {
    console.log(`Scanned ${files.length} files.`);
    console.log(`Found ${found.size} distinct values:\n`);
    for (const [canon, info] of sorted.slice(0, 30)) {
      const s = info.samples[0];
      console.log(
        `  [${info.category[0]}] ${canon.padEnd(12)} ${String(info.count).padStart(4)}×  e.g. ${s.file}:${s.line}`,
      );
    }
  }
  console.log(`\nWrote ${config.tokensFile}. Edit names, then: dtoken apply --dry-run`);
}

async function cmdApply(config, { dryRun }) {
  if (!dryRun && gitIsDirty(config.cwd)) {
    console.error("Working tree is dirty. Commit or stash first, or use --dry-run.");
    process.exit(1);
  }
  const tokens = loadTokens(config.tokensFile);
  if (Object.keys(tokens).length === 0) {
    console.error(`No tokens in ${config.tokensFile}. Run: dtoken scan`);
    process.exit(1);
  }
  const matchMap = toMatchMap(tokens);
  const { results, total } = await apply(config, matchMap, { dryRun });

  for (const r of results) {
    console.log(`\n${r.file}`);
    const seen = new Map();
    for (const h of r.hits) {
      const tag = h.approx != null ? ` (approx ΔE ${h.approx.toFixed(1)})` : "";
      const key = `${h.from} → ${h.to}${tag}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [pair, n] of seen) console.log(`  ${pair}  (${n}×)`);
  }

  console.log(
    `\n${dryRun ? "[dry-run] would replace" : "Replaced"} ${total} occurrences in ${results.length} files.`,
  );
  if (!dryRun) {
    writeCssTokens(config.cssOutput, tokens, config.cssSelector);
    writeStyleDictionary(config.styleDictionaryOutput, tokens);
    console.log(`Wrote ${config.cssOutput} (import once globally) and ${config.styleDictionaryOutput}.`);
  }
}

function cmdExport(config) {
  const tokens = loadTokens(config.tokensFile);
  if (Object.keys(tokens).length === 0) {
    console.error(`No tokens in ${config.tokensFile}. Run: dtoken scan`);
    process.exit(1);
  }
  writeStyleDictionary(config.styleDictionaryOutput, tokens);
  writeCssTokens(config.cssOutput, tokens, config.cssSelector);
  console.log(`Wrote ${config.styleDictionaryOutput} and ${config.cssOutput}.`);
}

const config = loadConfig();
if (cmd === "scan") await cmdScan(config);
else if (cmd === "apply") await cmdApply(config, { dryRun: flags.has("--dry-run") });
else if (cmd === "export") cmdExport(config);
else {
  console.log(`dtoken — hardcoded values → design tokens (CSS variables)

  dtoken scan                 find values, write ${config.tokensFile}
  dtoken scan --interactive   prompt for each token name
  dtoken apply --dry-run      preview replacements (shows exact vs approx ΔE)
  dtoken apply                replace + write CSS & Style Dictionary (needs clean git tree)
  dtoken export               (re)write ${config.cssOutput} + ${config.styleDictionaryOutput} from tokens

  config (dtoken.config.json): categories ["color","dimension"], namedColors, approxDeltaE
`);
}
