/**
 * Custom-CSS sanitizer (PRD §6 theming API / §10 XSS).
 *
 * Property allowlist: color/background/font/border-radius/size tokens only.
 * `url()`, `expression()`, `@import` and anything that could break out of a
 * <style> element are stripped. Selectors must be scoped to the widget root
 * (`.bellnote` / `#bellnote`) so host pages cannot be restyled either.
 *
 * NOTE: keep semantics in sync with the canonical server-side copy at
 * apps/web/lib/render/custom-css.ts (this one is the size-optimized,
 * dependency-free widget build copy).
 */

const ALLOWED_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'border-radius',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'text-align',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
]);

const BAD_VALUE = /(url|expression)\s*\(|javascript:|@|<|>|\/\*/i;

/** Returns a safe stylesheet; anything not explicitly allowed is dropped. */
export function sanitizeCss(input: string): string {
  if (!input || typeof input !== 'string') return '';
  // Reject early if the payload tries to break out of a style context.
  if (/<\/|@import|@charset/i.test(input)) return '';
  const css = input.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  for (const rule of css.split('}')) {
    const brace = rule.indexOf('{');
    if (brace < 0) continue;
    const selector = rule.slice(0, brace).trim();
    // Selector must target the widget root (or a descendant of it).
    if (!/^[.#]bellnote([\s>+~:.#[\]-\w]*)$/.test(selector)) continue;
    let decls = '';
    for (const decl of rule.slice(brace + 1).split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      if (!ALLOWED_PROPS.has(prop) || !value || BAD_VALUE.test(value)) continue;
      decls += `${prop}:${value};`;
    }
    if (decls) out += `${selector}{${decls}}`;
  }
  return out;
}
