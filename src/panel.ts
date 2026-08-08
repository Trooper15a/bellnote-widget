/**
 * Bellnote widget panel — lazy chunk (PRD §6.4). Fetched on first bell click
 * from a content-hashed filename (CDN-cacheable forever); NOT subject to the
 * 5 KB core budget.
 *
 * Renders: entry list → full entry (server pre-sanitized HTML, images get
 * loading="lazy" server-side), inline subscribe form, emoji reactions
 * (one per entry per anonymous client id), "Powered by Bellnote" when the
 * config says so. Focus-trapped, Esc closes, prefers-reduced-motion aware.
 *
 * ── SUBSCRIBE CONTRACT (for the subscribers agent) ──────────────────────────
 * POST {apiBase}/w/{projectId}/events   → 202 Accepted (queued: ingest-event)
 *   {
 *     "type": "subscribe",
 *     "email": "reader@example.com",          // required, validated server-side
 *     "source": "widget" | "hosted_page",     // we send "widget" from here
 *     "client_id": "<anonymous localStorage id>"
 *   }
 * The ingest-event consumer should upsert subscribers (project_id, email) with
 * status='pending' + confirm_token/unsubscribe_token and send the double
 * opt-in confirmation email (PRD §2 Flow 2). Idempotent on (project_id, email).
 * ────────────────────────────────────────────────────────────────────────────
 */
import type { PanelApi, PanelContext, WidgetEntry } from './types';

const REACTIONS = ['👍', '🎉', '❤️'];
const REDUCED =
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

let ctx: PanelContext | null = null;
let panel: HTMLElement | null = null;
let body: HTMLElement | null = null;
let entries: WidgetEntry[] | null = null;
let view: 'list' | 'detail' = 'list';
let previousFocus: Element | null = null;

function postEvent(payload: Record<string, unknown>): void {
  if (!ctx) return;
  fetch(`${ctx.apiBase}/w/${encodeURIComponent(ctx.projectId)}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, client_id: ctx.clientId }),
  }).catch(() => {});
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// --- views -------------------------------------------------------------------

function renderList(): void {
  if (!body || !ctx) return;
  view = 'list';
  body.textContent = '';
  if (!entries) {
    body.appendChild(el('p', 'bn-muted', 'Loading…'));
    fetch(`${ctx.apiBase}/w/${encodeURIComponent(ctx.projectId)}/entries?limit=20`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d: { entries: WidgetEntry[] }) => {
        entries = d.entries ?? [];
        if (view === 'list') renderList();
      })
      .catch(() => {
        entries = [];
        if (view === 'list') renderList();
      });
    return;
  }
  if (entries.length === 0) {
    body.appendChild(el('p', 'bn-muted', 'No updates yet — check back soon.'));
    return;
  }
  const list = el('ul', 'bn-list');
  for (const entry of entries) {
    const item = el('li', '');
    const btn = el('button', 'bn-item');
    btn.type = 'button';
    btn.appendChild(el('span', 'bn-item-title', entry.title));
    const meta = el('span', 'bn-item-meta');
    meta.appendChild(el('span', 'bn-chip', entry.category));
    meta.appendChild(el('span', 'bn-date', fmtDate(entry.publishedAt)));
    btn.appendChild(meta);
    btn.addEventListener('click', () => renderDetail(entry));
    item.appendChild(btn);
    list.appendChild(item);
  }
  body.appendChild(list);
}

function renderDetail(entry: WidgetEntry, skipViewEvent?: boolean): void {
  if (!body || !ctx) return;
  view = 'detail';
  body.textContent = '';
  if (!skipViewEvent) postEvent({ type: 'view', entry_id: entry.id });

  const back = el('button', 'bn-back', '← All updates');
  back.type = 'button';
  back.addEventListener('click', renderList);
  body.appendChild(back);

  body.appendChild(el('h2', 'bn-title', entry.title));
  const meta = el('div', 'bn-item-meta');
  meta.appendChild(el('span', 'bn-chip', entry.category));
  meta.appendChild(el('span', 'bn-date', fmtDate(entry.publishedAt)));
  body.appendChild(meta);

  // HTML is pre-sanitized server-side (rehype-sanitize, no raw HTML, images
  // loading="lazy") — see apps/web/lib/render/markdown.ts.
  const html = el('div', 'bn-html');
  html.innerHTML = entry.html;
  body.appendChild(html);

  // Emoji reactions — one per entry per anonymous client id (localStorage).
  const row = el('div', 'bn-reactions');
  const rxKey = `rx:${entry.id}`;
  const mine = ctx.store.get(rxKey);
  for (const emoji of REACTIONS) {
    const count = entry.reactions?.[emoji] ?? 0;
    const btn = el('button', 'bn-rx' + (mine === emoji ? ' bn-rx-on' : ''));
    btn.type = 'button';
    btn.setAttribute('aria-pressed', mine === emoji ? 'true' : 'false');
    btn.setAttribute('aria-label', `React ${emoji}`);
    btn.textContent = `${emoji} ${count + (mine === emoji ? 1 : 0)}`;
    if (mine) btn.disabled = true; // already reacted — one per entry per client
    btn.addEventListener('click', () => {
      if (ctx!.store.get(rxKey)) return;
      ctx!.store.set(rxKey, emoji);
      postEvent({ type: 'reaction', entry_id: entry.id, reaction: emoji });
      renderDetail(entry, true); // re-render with optimistic +1, no dup view
    });
    row.appendChild(btn);
  }
  body.appendChild(row);
}

// --- panel shell -------------------------------------------------------------

function buildPanel(c: PanelContext): HTMLElement {
  const p = el('div', 'bn-panel');
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-modal', 'true');
  p.setAttribute('aria-label', c.config.launcherLabel ?? 'Updates');

  const head = el('div', 'bn-head');
  head.appendChild(el('span', 'bn-head-title', c.config.launcherLabel ?? 'Updates'));
  const closeBtn = el('button', 'bn-close', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', api.close);
  head.appendChild(closeBtn);
  p.appendChild(head);

  body = el('div', 'bn-body');
  p.appendChild(body);

  // Inline subscribe form (contract documented at top of file).
  const form = el('form', 'bn-sub');
  const input = el('input', 'bn-sub-input') as HTMLInputElement;
  input.type = 'email';
  input.required = true;
  input.placeholder = 'Get updates by email';
  input.setAttribute('aria-label', 'Email address');
  const submit = el('button', 'bn-sub-btn', 'Subscribe');
  submit.type = 'submit';
  form.appendChild(input);
  form.appendChild(submit);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!input.value) return;
    postEvent({ type: 'subscribe', email: input.value, source: 'widget' });
    form.textContent = '';
    // Double opt-in (PRD §2 Flow 2): reader must confirm via email.
    form.appendChild(el('p', 'bn-muted', 'Thanks! Check your inbox to confirm.'));
  });
  p.appendChild(form);

  if (c.config.showPoweredBy) {
    const foot = el('div', 'bn-foot');
    const link = el('a', 'bn-powered', 'Powered by Bellnote');
    link.href = 'https://bellnote.dev';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    foot.appendChild(link);
    p.appendChild(foot);
  }

  // Focus trap + Esc (PRD §6.9).
  p.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      api.close();
      return;
    }
    if (ev.key !== 'Tab') return;
    const focusables = p.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input,[tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  const style = document.createElement('style');
  style.textContent = CSS;
  p.appendChild(style);
  return p;
}

const api: PanelApi = {
  open(c: PanelContext): void {
    ctx = c;
    previousFocus = document.activeElement;
    if (!panel) {
      panel = buildPanel(c);
      c.root.appendChild(panel);
    }
    panel.hidden = false;
    // Panel is position:fixed — mirror the launcher's configured side.
    const leftSide = c.config.position === 'bottom-left';
    panel.style.left = leftSide ? '20px' : 'auto';
    panel.style.right = leftSide ? 'auto' : '20px';
    if (c.config.background) panel.style.background = c.config.background;
    if (c.config.textColor) panel.style.color = c.config.textColor;
    postEvent({ type: 'widget_open' });
    renderList();
    (panel.querySelector('.bn-close') as HTMLElement | null)?.focus();
  },
  close(): void {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    // Return focus to the launcher (or whatever had focus before).
    const target = (ctx?.launcher ?? previousFocus) as HTMLElement | null;
    target?.focus?.();
  },
};

(window as unknown as { __bellnotePanel: PanelApi }).__bellnotePanel = api;

// Scoped widget styles. .bn-panel resets inheritance so host-page CSS does
// not leak in; motion is disabled under prefers-reduced-motion (PRD §6.9).
const CSS = `
.bellnote .bn-panel{all:initial;box-sizing:border-box;display:block;position:fixed;
bottom:80px;right:20px;left:auto;width:360px;max-width:calc(100vw - 40px);
max-height:min(70vh,560px);overflow-y:auto;z-index:2147483000;background:#fff;
color:#111827;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);
font:14px/1.5 system-ui,-apple-system,sans-serif;padding:12px 14px;
${REDUCED ? '' : 'transition:opacity .15s ease;'}}
.bellnote .bn-panel[hidden]{display:none}
.bellnote .bn-panel *{box-sizing:border-box;font:inherit}
.bellnote .bn-head{display:flex;align-items:center;justify-content:space-between;
margin-bottom:8px}
.bellnote .bn-head-title{font-weight:600}
.bellnote .bn-close{border:0;background:none;cursor:pointer;font-size:14px;
color:inherit;padding:4px 8px;border-radius:6px}
.bellnote .bn-close:hover{background:rgba(0,0,0,.06)}
.bellnote .bn-list{list-style:none;margin:0;padding:0}
.bellnote .bn-item{display:block;width:100%;text-align:left;border:0;background:none;
cursor:pointer;padding:10px 8px;border-radius:8px;color:inherit}
.bellnote .bn-item:hover{background:rgba(0,0,0,.05)}
.bellnote .bn-item-title{display:block;font-weight:600;margin-bottom:2px}
.bellnote .bn-item-meta{display:flex;gap:8px;align-items:center;margin:4px 0 8px}
.bellnote .bn-chip{font-size:11px;padding:1px 8px;border-radius:999px;
background:rgba(0,0,0,.08);color:inherit}
.bellnote .bn-date{font-size:12px;opacity:.6}
.bellnote .bn-title{font-size:16px;margin:8px 0 0}
.bellnote .bn-back{border:0;background:none;cursor:pointer;color:inherit;
opacity:.7;padding:4px 0;font-size:13px}
.bellnote .bn-html p{margin:0 0 10px}
.bellnote .bn-html ul,.bellnote .bn-html ol{margin:0 0 10px;padding-left:20px}
.bellnote .bn-html ul{list-style:disc}
.bellnote .bn-html ol{list-style:decimal}
.bellnote .bn-html li{margin:3px 0}
.bellnote .bn-html h1,.bellnote .bn-html h2,.bellnote .bn-html h3{font-weight:600;margin:12px 0 6px}
.bellnote .bn-html strong{font-weight:600}
.bellnote .bn-html code{background:rgba(0,0,0,.06);border-radius:4px;padding:1px 4px}
.bellnote .bn-html pre{background:rgba(0,0,0,.06);border-radius:8px;padding:10px;overflow-x:auto;margin:0 0 10px}
.bellnote .bn-html pre code{background:none;padding:0}
.bellnote .bn-html blockquote{border-left:3px solid rgba(0,0,0,.2);padding-left:10px;margin:0 0 10px;opacity:.85}
.bellnote .bn-html img{max-width:100%;height:auto;border-radius:6px}
.bellnote .bn-html a{color:#2563eb}
.bellnote .bn-reactions{display:flex;gap:8px;margin-top:10px}
.bellnote .bn-rx{border:1px solid rgba(0,0,0,.15);background:none;border-radius:999px;
padding:3px 10px;cursor:pointer;font-size:13px;color:inherit}
.bellnote .bn-rx-on{border-color:#2563eb;background:rgba(37,99,235,.1)}
.bellnote .bn-rx:disabled{cursor:default;opacity:.7}
.bellnote .bn-sub{display:flex;gap:6px;margin-top:12px;padding-top:10px;
border-top:1px solid rgba(0,0,0,.08)}
.bellnote .bn-sub-input{flex:1;border:1px solid rgba(0,0,0,.2);border-radius:8px;
padding:6px 10px;color:inherit;background:transparent}
.bellnote .bn-sub-btn{border:0;border-radius:8px;padding:6px 12px;cursor:pointer;
background:#111827;color:#fff}
.bellnote .bn-muted{opacity:.6;font-size:13px;margin:8px 0 0}
.bellnote .bn-foot{margin-top:10px;text-align:center}
.bellnote .bn-powered{font-size:11px;opacity:.5;color:inherit;text-decoration:none}
`.replace(/\s+/g, ' ');
