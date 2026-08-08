#!/usr/bin/env node
/**
 * Two-pass widget build (PRD §6.4):
 *  1. Build the panel chunk, hash its content, emit dist/panel.<hash>.js
 *     (CDN-cacheable forever).
 *  2. Build the core loader with the hashed panel filename injected via
 *     esbuild define (__BELLNOTE_PANEL_FILE__).
 * Size budget for the core is enforced afterwards by scripts/check-size.mjs.
 */
import { build } from 'tsup';
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shared = {
  format: ['iife'],
  outExtension: () => ({ js: '.js' }),
  minify: true,
  sourcemap: false,
  outDir: 'dist',
  target: 'es2020',
};

// 1. Panel chunk.
await build({ ...shared, entry: { panel: 'src/panel.ts' }, clean: true });
const raw = readFileSync(`${root}dist/panel.js`);
const hash = createHash('sha256').update(raw).digest('hex').slice(0, 8);
const panelFile = `panel.${hash}.js`;
renameSync(`${root}dist/panel.js`, `${root}dist/${panelFile}`);
// Drop stale hashed panel chunks from previous builds.
for (const f of readdirSync(`${root}dist`)) {
  if (/^panel\.[a-f0-9]{8}\.js$/.test(f) && f !== panelFile) rmSync(`${root}dist/${f}`);
}

// 2. Core loader, panel filename baked in.
await build({
  ...shared,
  entry: { widget: 'src/index.ts' },
  clean: false,
  define: { __BELLNOTE_PANEL_FILE__: JSON.stringify(panelFile) },
});

console.log(`[widget:build] core=dist/widget.js  panel=dist/${panelFile}`);
