#!/usr/bin/env node
/**
 * Fails when a hex colour appears in code outside /packages/theme – all colours come from the tokens.
 * Runs as part of `pnpm lint`. Scans tracked and new (not ignored) source files.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|css)$/;
// JSON configs (app.json needs hex for the native splash / adaptive icon) and generated
// assets are not code; the theme package is the single source of colour values.
const ALLOWED = [/^packages\/theme\//, /^scripts\/check-hex-colors\.mjs$/];
// #RGB, #RGBA, #RRGGBB, #RRGGBBAA – but not inside identifiers or URL fragments like href="#content".
const HEX = /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => SOURCE.test(file) && !ALLOWED.some((re) => re.test(file)));

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(HEX)) {
      hits.push(`${file}:${index + 1}  ${match[0]}`);
    }
  });
}

if (hits.length > 0) {
  console.error('Hex colours outside /packages/theme – use the design tokens instead:');
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`No hex colours outside /packages/theme (${files.length} files checked).`);
