#!/usr/bin/env node
/**
 * CI budget check (PRD §6 / AC #9): core widget.js must be <= 5 KB gzipped.
 * Exits non-zero (fails the build) when the budget is exceeded.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 5 * 1024;
const file = fileURLToPath(new URL('../dist/widget.js', import.meta.url));

let raw;
try {
  raw = readFileSync(file);
} catch {
  console.error(`[widget:size] FAIL — ${file} not found. Run the tsup build first.`);
  process.exit(1);
}

const gz = gzipSync(raw, { level: 9 });
const kb = (gz.length / 1024).toFixed(2);
const rawKb = (raw.length / 1024).toFixed(2);

if (gz.length > BUDGET_BYTES) {
  console.error(
    `[widget:size] FAIL — widget.js is ${kb} KB gzipped (${rawKb} KB raw), budget is 5.00 KB. ` +
      'Shrink the core loader (PRD §6: panel must be a separate lazy chunk).',
  );
  process.exit(1);
}

console.log(`[widget:size] OK — widget.js ${kb} KB gzipped (${rawKb} KB raw), budget 5.00 KB`);
