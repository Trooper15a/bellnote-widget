/**
 * Bellnote widget core loader (PRD §6) — hard budget: <= 5 KB gzipped (CI).
 *
 * Install: <script src="https://cdn.bellnote.dev/widget.js" data-project="PROJ_ID" async></script>
 *
 * Core responsibilities (everything heavier lives in the lazy panel chunk):
 *  - inject the bell launcher (inline SVG, real <button>, fixed position → no
 *    layout shift) with an unread badge from localStorage (NO cookies);
 *  - fetch GET config → apply theme (colors/position/label + sanitized
 *    custom CSS — property allowlist, url()/expression()/@import stripped);
 *  - fetch GET entries?limit=5 → badge = entries newer than
 *    localStorage `bellnote:<projectId>:lastSeen`;
 *  - on click: lazy-load the content-hashed panel chunk, mark-all-read;
 *  - SPA-safe: only global is window.Bellnote { open, close, identify };
 *    launcher lives directly on <body> so client-side route swaps do not
 *    remove it; if the install script tag is removed, we tear down.
 */
import { sanitizeCss } from './css';
import type { PanelApi, WidgetConfig, WidgetEntry } from './types';

// Injected at build time by scripts/build.mjs (content-hashed panel chunk).
declare const __BELLNOTE_PANEL_FILE__: string | undefined;
const PANEL_FILE =
  typeof __BELLNOTE_PANEL_FILE__ !== 'undefined' ? __BELLNOTE_PANEL_FILE__ : 'panel.js';

const script =
  (document.currentScript as HTMLScriptElement | null) ??
  (document.querySelector('script[data-project]') as HTMLScriptElement | null);
const projectId = script?.getAttribute('data-project') ?? '';
const apiBase = script ? new URL(script.src, location.href).origin : '';
const panelUrl = script ? new URL(PANEL_FILE, script.src).href : '';

// --- localStorage (privacy: no cookies, no fingerprinting — PRD §6.3) ------
const LS = `bellnote:${projectId}:`;
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(LS + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(LS + key, value);
    } catch {
      /* private mode etc. — badge just won't persist */
    }
  },
};

let clientId = store.get('cid');
if (!clientId) {
  clientId =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('cid', clientId);
}

// --- DOM: root + launcher ---------------------------------------------------
let config: WidgetConfig = {};
let root: HTMLElement | null = null;
let launcher: HTMLButtonElement | null = null;
let badge: HTMLElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let panelApi: PanelApi | undefined;
let panelLoading = false;

function markAllRead(): void {
  store.set('lastSeen', String(Date.now()));
  if (badge) badge.hidden = true;
}

function open(): void {
  if (!root) return;
  markAllRead();
  if (panelApi) {
    panelApi.open(ctx());
    return;
  }
  if (panelLoading) return;
  panelLoading = true;
  const s = document.createElement('script');
  s.src = panelUrl;
  s.async = true;
  s.onload = () => {
    panelApi = (window as unknown as { __bellnotePanel?: PanelApi }).__bellnotePanel;
    if (panelApi && root) panelApi.open(ctx());
  };
  document.head.appendChild(s);
}

function close(): void {
  panelApi?.close();
}

function ctx() {
  return {
    root: root as HTMLElement,
    launcher: launcher as HTMLButtonElement,
    config,
    apiBase,
    projectId,
    clientId: clientId as string,
    store,
  };
}

function updateBadge(entries: WidgetEntry[]): void {
  if (!badge) return;
  const lastSeen = Number(store.get('lastSeen') ?? 0);
  const unread = entries.filter(
    (e) => e.publishedAt && Date.parse(e.publishedAt) > lastSeen,
  ).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.hidden = unread === 0;
}

function applyTheme(c: WidgetConfig): void {
  if (!root || !launcher) return;
  root.style.right = c.position === 'bottom-left' ? 'auto' : '20px';
  root.style.left = c.position === 'bottom-left' ? '20px' : 'auto';
  if (c.primaryColor) launcher.style.background = c.primaryColor;
  launcher.style.color = '#fff'; // bell icon stroke (currentColor)
  if (c.launcherLabel) launcher.setAttribute('aria-label', c.launcherLabel);
  if (styleEl) styleEl.textContent = sanitizeCss(c.customCss ?? '');
}

function mount(): void {
  root = document.createElement('div');
  root.id = 'bellnote';
  root.className = 'bellnote';
  root.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483000';

  launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Updates');
  launcher.style.cssText =
    'width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;display:flex;' +
    'align-items:center;justify-content:center;background:#111827;color:#fff;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.25);position:relative';
  // Inline SVG bell (no external assets), stroke follows currentColor.
  launcher.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  launcher.addEventListener('click', open);

  badge = document.createElement('span');
  badge.hidden = true;
  badge.setAttribute('aria-hidden', 'true');
  badge.style.cssText =
    'position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 4px;' +
    'border-radius:9px;background:#dc2626;color:#fff;font:600 11px/18px system-ui,' +
    'sans-serif;text-align:center;pointer-events:none';
  launcher.appendChild(badge);

  styleEl = document.createElement('style');
  root.appendChild(styleEl);
  root.appendChild(launcher);
  document.body.appendChild(root);
}

function teardown(): void {
  panelApi?.close();
  root?.remove();
  root = null;
  launcher = null;
  badge = null;
  observer?.disconnect();
}

// SPA-safety: if the host app removes our install script tag, clean up.
const observer =
  typeof MutationObserver !== 'undefined' && script
    ? new MutationObserver(() => {
        if (!document.contains(script)) teardown();
      })
    : null;

function boot(): void {
  if (!projectId || root) return;
  mount();
  observer?.observe(document.documentElement, { childList: true, subtree: true });
  // Config + entries headers: tiny, parallel, cache-friendly (ETag/CDN).
  fetch(`${apiBase}/w/${encodeURIComponent(projectId)}/config`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((c: WidgetConfig) => {
      config = c;
      applyTheme(c);
    })
    .catch(() => {});
  fetch(`${apiBase}/w/${encodeURIComponent(projectId)}/entries?limit=5`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { entries?: WidgetEntry[] } | null) => {
      if (d?.entries) updateBadge(d.entries);
    })
    .catch(() => {});
}

const Bellnote = {
  open,
  close,
  identify() {
    /* reserved no-op for MVP (PRD §6.7) */
  },
};
(window as unknown as { Bellnote: typeof Bellnote }).Bellnote = Bellnote;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Side-effect-only bundle: no exports, so tsup emits dist/widget.js (an
// exported IIFE would be renamed widget.global.js by tsup).
