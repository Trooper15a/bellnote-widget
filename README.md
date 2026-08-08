# Bellnote Widget

The embeddable changelog widget that powers [Bellnote](https://bellnote.dev) — the changelog that writes itself.

**One script tag. A bell, an unread badge, and your updates — in under 5 KB gzipped.**

```html
<script src="https://bellnote.dev/widget.js" data-project="PROJ_ID" async></script>
```

## Why this is open source

Changelog widgets have a bloat problem — some popular ones add 50 KB+ to your page and set tracking cookies. This one is small enough to **read in one sitting**, sets **zero cookies** (unread state lives in `localStorage`), and lazy-loads its panel only when someone clicks the bell. Open-sourcing it means you don't have to take our word for any of that.

## Features

- 🔔 **Bell launcher** — inline SVG, real `<button>`, fixed position, no layout shift
- **Unread badge** — entries newer than `localStorage` last-seen; clears on open
- **Lazy panel** — the entry list/detail UI is a separate content-hashed chunk fetched on first click only
- **Theming** — colors, position, launcher label via the config endpoint; allowlisted custom CSS (`url()`, `expression()`, `@import` stripped)
- **Reactions + subscribe form** — emoji reactions per entry, double opt-in subscribe
- **Privacy-first** — no cookies, no fingerprinting; reactions dedupe by anonymous client id
- **SPA-safe** — survives client-side route changes, cleans up after itself, exposes only `window.Bellnote` (`open()`, `close()`)
- **Accessible** — focus-trapped panel, `Esc` closes, respects `prefers-reduced-motion`

## Size budget (enforced)

The core loader must stay **≤ 5 KB gzipped** — the build fails otherwise:

```bash
npm install
npm run build   # builds dist/widget.js + panel chunk, then checks the size
npm run size    # re-check anytime
npm test        # CSS-sanitizer unit tests
```

Current core size: **~2 KB gzipped.**

## How it talks to the backend

The widget derives its API base from the origin of its own `<script src>` and calls three endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /w/:projectId/config` | theme/config (ETag + public caching) |
| `GET /w/:projectId/entries` | latest published entries, sanitized HTML |
| `POST /w/:projectId/events` | views, opens, reactions, subscribes (202, async) |

You can point it at any backend that implements those three — including [Bellnote](https://bellnote.dev), which also drafts your changelog entries from GitHub merges with AI, learns your voice, and publishes everywhere (widget, hosted page, email, Slack, RSS) for one flat price.

## Development

```bash
npm install
npm run build      # tsup → dist/widget.js + dist/panel.<hash>.js
npm test
npm run typecheck
```

The core (`src/index.ts`) must stay dependency-free vanilla TypeScript. Anything that would grow it past the budget belongs in the lazy panel chunk (`src/panel.ts`).

## License

MIT — see [LICENSE](./LICENSE).
