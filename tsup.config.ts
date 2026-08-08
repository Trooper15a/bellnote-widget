import { defineConfig } from 'tsup';

// Single-file IIFE bundle -> dist/widget.js (PRD §6: one script tag).
// Hard budget: core <= 5 KB gzipped, enforced by scripts/check-size.mjs.
export default defineConfig({
  entry: { widget: 'src/index.ts' },
  format: ['iife'],
  // Force dist/widget.js — tsup otherwise emits *.global.js for IIFE builds.
  outExtension() {
    return { js: '.js' };
  },
  minify: true,
  sourcemap: false,
  clean: true,
  outDir: 'dist',
  target: 'es2020',
});
