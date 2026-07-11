import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  patterns: ["**/*.{css,scss,less,js,jsx,ts,tsx,vue}"],
  ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"],
  tokensFile: "dtoken.tokens.json",
  cssOutput: "dtoken.tokens.css",
  cssSelector: ":root",
  styleDictionaryOutput: "dtoken.tokens.sd.json",

  categories: ["color"], // add "dimension" for px/rem/em spacing & sizes
  namedColors: false, // match "black"/"white" words — risky (hits classNames/prose), opt-in
  approxDeltaE: 0, // >0: apply maps near-identical colors to nearest token within this ΔE
};

export function loadConfig(cwd = process.cwd()) {
  const p = path.join(cwd, "dtoken.config.json");
  const user = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
  return { ...DEFAULTS, ...user, cwd };
}
