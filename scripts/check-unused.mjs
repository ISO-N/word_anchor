import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

function walk(dir, filter) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full, filter)
      : filter(full)
        ? [full]
        : [];
  });
}

const css = walk("src", (f) => extname(f) === ".css");
const code = walk("src", (f) => [".tsx", ".ts"].includes(extname(f)))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const DYNAMIC = new Set([
  "button-primary",
  "button-ghost",
  "button-danger",
  "button-small",
]);

for (const file of css) {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set([...text.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]));

  const unused = [...names].filter((name) => {
    if (DYNAMIC.has(name)) return false;
    // CSS Modules 用 styles.xxx 引用
    if (file.endsWith(".module.css")) {
      return !new RegExp(`\\.${name}\\b`).test(code);
    }
    return !new RegExp(`(^|[\\s"'\`])${name}([\\s"'\`]|$)`).test(code);
  });

  if (unused.length) console.log(`${file}: ${unused.join(", ")}`);
}

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const vars = [...tokens.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]);
const allCss = css.map((f) => readFileSync(f, "utf8")).join("\n");
const unusedVars = [...new Set(vars)].filter(
  (v) => (allCss.match(new RegExp(`var\\(\\s*${v}\\b`, "g")) || []).length === 0,
);
console.log("未使用的令牌:", unusedVars.join(", ") || "(无)");
