#!/usr/bin/env node
/**
 * 类名守卫：确保 TSX 里用到的每个类名都真的存在于样式文件里。
 *
 * 背景：首页曾经引用了 `.empty-card` / `.empty-icon`，而 globals.css 里
 * 从来没有这两个类，于是空状态渲染成了没有边框的纯文本——构建、类型、
 * 单测都不会报错。这个脚本把这类「用了但没写」的 bug 变成构建失败。
 *
 * 两个方向都查：
 *   1. 全局字符串类名（className="button button-primary"）→ 必须出现在非 module 的 CSS 里
 *   2. CSS Modules 引用（className={styles.option}）→ 必须出现在该文件 import 的 module CSS 里
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const CLASS_LOOKING = /^[a-z][\w-]*$/;

function walk(dir, filter) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full, filter));
    else if (filter(full)) files.push(full);
  }
  return files;
}

function classNamesFromCss(source) {
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\([^)]*\)/g, "");
  const names = new Set();
  for (const match of cleaned.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    names.add(match[1]);
  }
  return names;
}

/** 去掉辅助函数调用与比较运算里的字符串，避免把 "ghost"/"correct" 当成类名 */
function stripNonClassStrings(expr) {
  return expr
    .replace(/\bbuttonClass\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, " ")
    .replace(/[!=]==?\s*(["'])(?:\\.|(?!\1)[^\\])*\1/g, " ")
    .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1\s*[!=]==?/g, " ");
}

function quotedTokens(expr) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'/g;
  for (const match of expr.matchAll(re)) {
    const text = match[1] ?? match[2] ?? "";
    tokens.push(...text.split(/\s+/));
  }
  return tokens;
}

/** 扫描模板字符串内部：字面量段是类名，`${...}` 里继续找带引号的字符串 */
function templateTokens(text) {
  const tokens = [];
  let literal = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] === "$" && text[index + 1] === "{") {
      tokens.push(...literal.split(/\s+/));
      literal = "";

      let depth = 1;
      let inner = "";
      index += 2;
      while (index < text.length && depth > 0) {
        const char = text[index];
        if (char === "{") depth += 1;
        if (char === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        inner += char;
        index += 1;
      }
      tokens.push(...quotedTokens(stripNonClassStrings(inner)));
      index += 1;
      continue;
    }

    literal += text[index];
    index += 1;
  }

  tokens.push(...literal.split(/\s+/));
  return tokens;
}

function collectClassNameValues(source) {
  const values = [];
  const opening = /className\s*=\s*/g;
  let match;

  while ((match = opening.exec(source))) {
    let index = match.index + match[0].length;
    const char = source[index];

    if (char === '"' || char === "'") {
      const end = source.indexOf(char, index + 1);
      values.push({ kind: "string", text: source.slice(index + 1, end) });
      opening.lastIndex = end;
      continue;
    }

    if (char === "{") {
      const end = findMatchingBrace(source, index);
      values.push({ kind: "expression", text: source.slice(index + 1, end) });
      opening.lastIndex = end;
      continue;
    }
  }

  return values;
}

function findMatchingBrace(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length;
}

/** 表达式里的模板字符串：逐个取出并走 templateTokens */
function expressionTokens(expr) {
  const cleaned = stripNonClassStrings(expr);
  const tokens = [];
  let index = 0;

  while (index < cleaned.length) {
    if (cleaned[index] === "`") {
      const end = cleaned.indexOf("`", index + 1);
      tokens.push(...templateTokens(cleaned.slice(index + 1, end)));
      index = end + 1;
      continue;
    }
    index += 1;
  }

  const withoutTemplates = cleaned.replace(/`[^`]*`/g, " ");
  tokens.push(...quotedTokens(withoutTemplates));
  return tokens;
}

const cssFiles = walk(SRC, (file) => extname(file) === ".css");
const moduleCss = new Map();
const globals = new Set();

for (const file of cssFiles) {
  const names = classNamesFromCss(readFileSync(file, "utf8"));
  if (file.endsWith(".module.css")) moduleCss.set(file, names);
  else names.forEach((name) => globals.add(name));
}

const tsxFiles = walk(SRC, (file) => extname(file) === ".tsx");
const problems = [];
let globalRefs = 0;
let moduleRefs = 0;

for (const file of tsxFiles) {
  const source = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);

  for (const value of collectClassNameValues(source)) {
    const tokens =
      value.kind === "string"
        ? value.text.split(/\s+/)
        : expressionTokens(value.text);

    for (const token of tokens) {
      if (!token || !CLASS_LOOKING.test(token)) continue;
      globalRefs += 1;
      if (!globals.has(token)) {
        problems.push(`${rel}: class "${token}" 未在任何全局样式表中定义`);
      }
    }
  }

  const imports = [
    ...source.matchAll(/import\s+(\w+)\s+from\s+"([^"]+\.module\.css)"/g),
  ];

  for (const [, binding, specifier] of imports) {
    const cssPath = resolve(dirname(file), specifier);
    const defined = moduleCss.get(cssPath);
    if (!defined) {
      problems.push(`${rel}: 找不到样式模块 ${specifier}`);
      continue;
    }

    const usage = new RegExp(`\\b${binding}\\.(\\w+)`, "g");
    for (const match of source.matchAll(usage)) {
      moduleRefs += 1;
      if (!defined.has(match[1])) {
        problems.push(
          `${rel}: ${binding}.${match[1]} 在 ${relative(ROOT, cssPath)} 中不存在`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`✗ 类名检查失败（${problems.length} 处）\n`);
  for (const problem of [...new Set(problems)].sort()) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}

console.log(
  `✓ 类名检查通过：${globalRefs} 处全局类名、${moduleRefs} 处模块引用均已在样式表中定义`,
);
