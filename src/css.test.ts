/**
 * node:test — custom-CSS sanitizer (PRD §6/§10): malicious payloads must
 * render inert. Run: npm test -w @bellnote/widget
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCss } from './css';

test('keeps allowlisted declarations scoped to the widget root', () => {
  assert.equal(
    sanitizeCss('.bellnote{color:#fff;background:#111827;border-radius:8px}'),
    '.bellnote{color:#fff;background:#111827;border-radius:8px;}',
  );
});

test('strips url() values', () => {
  assert.equal(sanitizeCss('.bellnote{background:url(https://evil.example/x)}'), '');
  assert.equal(
    sanitizeCss('.bellnote{color:red;background:URL( javascript:alert(1) )}'),
    '.bellnote{color:red;}',
  );
});

test('strips expression()', () => {
  assert.equal(sanitizeCss('.bellnote{width:expression(alert(1))}'), '');
});

test('@import makes the whole payload inert', () => {
  assert.equal(sanitizeCss('@import "https://evil.example/x.css";'), '');
  assert.equal(sanitizeCss(".bellnote{color:red} @import url('//evil')"), '');
});

test('style-breakout payloads are inert', () => {
  assert.equal(sanitizeCss('.bellnote{color:red}</style><script>alert(1)</script>'), '');
});

test('drops non-allowlisted properties', () => {
  assert.equal(sanitizeCss('.bellnote{position:fixed;color:blue;behavior:url(x)}'), '.bellnote{color:blue;}');
});

test('drops selectors not scoped to the widget root', () => {
  assert.equal(sanitizeCss('body{background:#000}'), '');
  assert.equal(sanitizeCss('html .bellnote{color:red}'), '');
});

test('allows widget-root descendants and pseudo-classes', () => {
  assert.equal(
    sanitizeCss('.bellnote .bn-panel a:hover{color:#2563eb}'),
    '.bellnote .bn-panel a:hover{color:#2563eb;}',
  );
});

test('javascript: in any value is dropped', () => {
  assert.equal(sanitizeCss('.bellnote{background:javascript:alert(1)}'), '');
});

test('handles junk safely', () => {
  assert.equal(sanitizeCss(''), '');
  assert.equal(sanitizeCss('not css at all'), '');
  assert.equal(sanitizeCss('.bellnote{;;;}'), '');
});
