#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script, no bundler */
/**
 * lint:design (PRD section 11). Scans src/ and fails on:
 *   1. the em dash character
 *   2. imports from lucide
 *   3. backdrop-filter
 *   4. radial-gradient
 *   5. the font names Inter, Geist, Space Grotesk
 *   6. sparkle glyphs
 *   7. any CSS transition inside a :hover rule (and hover:transition utilities)
 *   8. any color with a hue between 250 and 320 degrees
 * Items this script cannot detect (copy patterns, layouts) are checked by
 * hand at each milestone.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const EXT = /\.(ts|tsx|js|jsx|css)$/;
const SPARKLES = /[\u2728\u2b50\ud83c\udf1f\ud83d\udcab\u2726\u2727]/;
const FONT_NAMES = /\b(inter|geist|space\s+grotesk)\b/i;

const violations = [];

function report(file, line, rule, text) {
  violations.push({ file: path.relative(path.join(__dirname, ".."), file), line, rule, text: text.trim().slice(0, 80) });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXT.test(entry.name)) scan(full);
  }
}

function hueOf(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

function checkColors(file, lineNo, line) {
  for (const m of line.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const h = hueOf(r, g, b);
    if (h >= 250 && h <= 320) report(file, lineNo, "hue-250-320", `${m[0]} hue ${h.toFixed(0)}`);
  }
  for (const m of line.matchAll(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/g)) {
    const h = hueOf(Number(m[1]), Number(m[2]), Number(m[3]));
    if (h >= 250 && h <= 320) report(file, lineNo, "hue-250-320", `${m[0]} hue ${h.toFixed(0)}`);
  }
  for (const m of line.matchAll(/hsla?\(\s*([\d.]+)/g)) {
    const h = ((Number(m[1]) % 360) + 360) % 360;
    if (h >= 250 && h <= 320) report(file, lineNo, "hue-250-320", `${m[0]} hue ${h.toFixed(0)}`);
  }
}

/** Finds the block that follows a ":hover" occurrence and checks it. */
function checkHoverBlocks(file, source) {
  const reported = new Set();
  let from = 0;
  for (;;) {
    const at = source.indexOf(":hover", from);
    if (at < 0) break;
    from = at + 6;
    const open = source.indexOf("{", at);
    if (open < 0 || open - at > 120) continue;
    if (reported.has(open)) continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    reported.add(open);
    const block = source.slice(open, end + 1);
    if (/(?:^|[;{\s])transition[\s:-]/m.test(block)) {
      const line = source.slice(0, at).split("\n").length;
      report(file, line, "hover-transition", "transition inside a :hover rule");
    }
  }
}

function scan(file) {
  const source = fs.readFileSync(file, "utf8");
  const isCss = file.endsWith(".css");
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (line.includes("\u2014")) report(file, lineNo, "em-dash", line);
    if (/from\s*["']lucide|import\s*[^"']*["']lucide|require\(\s*["']lucide/.test(line))
      report(file, lineNo, "lucide", line);
    if (/backdrop-filter/i.test(line)) report(file, lineNo, "backdrop-filter", line);
    if (/radial-gradient/i.test(line)) report(file, lineNo, "radial-gradient", line);
    if (FONT_NAMES.test(line)) report(file, lineNo, "banned-font", line);
    if (SPARKLES.test(line)) report(file, lineNo, "sparkle", line);
    if (!isCss && /hover:transition/.test(line)) report(file, lineNo, "hover-transition", line);
    checkColors(file, lineNo, line);
  });
  if (isCss) checkHoverBlocks(file, source);
}

if (!fs.existsSync(ROOT)) {
  console.error("lint:design: src/ not found");
  process.exit(1);
}
walk(ROOT);

if (violations.length > 0) {
  console.error(`lint:design: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
  process.exit(1);
}
console.log("lint:design: no violations");
