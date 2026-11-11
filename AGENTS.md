# AGENTS.md — Single Source of Truth

> Read this file first. It describes the whole project as it exists today.
> If this file and the code disagree, the code wins — fix this file in the same change.

## 1. What this project is

`docker-webapp` is the **AERIS landing page served by a Bun server**. AERIS is a
fictional laptop brand (demo content: specs, A1/A1 Pro chips, reviews, prices
are invented). The project was rewritten from Nginx + static files (originally
the Massively template by HTML5 UP, CCA 3.0) to **Bun**: a single dependency-free
`Bun.serve` server, `bun test` tests, and a Bun Docker image.

There is no framework, no database, no API, and no build step. The only
JavaScript the pages load is the dark-mode toggle plus a small inline
configurator script.

## 2. Stack

| Layer | Choice |
|---|---|
| Runtime / server | Bun (`Bun.serve`) via `server.ts` — vanilla, zero dependencies |
| Pages | Static HTML in `public/` (`index.html`, `generic.html`) |
| Styling | One stylesheet `public/assets/css/landing.css` (CSS variables, light+dark) |
| Page JS | `public/assets/js/theme.js` (dark mode) + inline configurator script in `generic.html` |
| Tests | `bun test` → `tests/site.test.ts` (23 tests) |
| Container | `oven/bun:1`, port 3000 |
| CI | GitHub Actions: `bun test`, then build/push Docker image |

Do not add dependencies, a framework (Elysia/Hono/React…), or a build step
unless explicitly requested — `package.json` must keep `"dependencies": {}`-equivalent
(i.e. no `dependencies` key) and the test suite asserts this.

## 3. Layout

```
.
├── AGENTS.md                  # this file
├── package.json               # scripts: start / dev / test (all Bun)
├── server.ts                  # Bun.serve static server (exports handleRequest, SITE_ROOT)
├── Dockerfile                 # oven/bun:1, EXPOSE 3000, CMD bun run server.ts
├── .dockerignore              # .git, .github, tests, AGENTS.md
├── tests/
│   └── site.test.ts           # bun test suite (see §8)
├── public/                    # site root served by server.ts
│   ├── index.html             # landing page
│   ├── generic.html           # Aeris 14 product / configurator page
│   └── assets/
│       ├── css/landing.css    # only stylesheet
│       └── js/theme.js        # only external JS (dark mode)
└── .github/workflows/docker-image.yml
```

The old `html5up-massively/` folder and all legacy template assets (Massively
`main.css`, Sass, jQuery, Font Awesome, demo images, `elements.html`,
`minimal.css`) were **deleted** in the Bun rewrite. They survive only in git
history. Do not recreate them; `public/` must contain only the four live files
(a test enforces this).

## 4. The site

| Page | File | Purpose |
|---|---|---|
| Landing | `public/index.html` | Hero for Aeris 14, press strip, 3-model lineup ($999/$1,199/$1,899), Why AERIS, dark specs table, quotes, orange CTA |
| Product / buy | `public/generic.html` | Configurator: chip/memory/storage `.opt` buttons update `#price` live (base $1,199, max $2,299); "Add to bag" shows a demo message in `#msg`, no checkout |

- Shared shell: sticky nav (logo `AERIS.`, Models / Why AERIS / Specs / Aeris 14,
  dark-mode toggle, Buy now) and a footer noting AERIS is a fictional demo brand.
- Laptop visual is inline SVG — no image files anywhere.
- Prices must stay consistent: changing the configurator base means editing
  `var base=` and `data-add` values in `generic.html` **and** the "from $1,199"
  copy in `index.html`. Tests assert both.

## 5. Dark mode

- Toggle: `#themeToggle` button in the nav of both pages (`☾ Dark` / `☀ Light`,
  `aria-pressed` kept in sync).
- Mechanism: `public/assets/js/theme.js` is loaded in `<head>` (applies before
  paint), sets `data-theme="dark"|"light"` on `<html>`. First visit follows
  `prefers-color-scheme`; the choice persists in `localStorage` key
  `aeris-theme`.
- Theming: `landing.css` uses CSS variables only — light `:root`
  (`--bg #fff`, `--ink #0b0b0c`, `--muted #5c5c60`, `--line #e7e7e9`,
  `--nav rgba(255,255,255,.92)`) and `[data-theme="dark"]`
  (`--bg #0b0b0c`, `--ink #f4f4f5`, `--muted #a7a7ad`, `--line #26262a`).
  Accent is `--accent #ff4d00` in both. Never hard-code page backgrounds
  outside the variable definitions / always-dark specs & CTA areas.
- Regression guard: nav "Buy now" (`.links a.btn`) must use `color:var(--bg)` —
  grey text on the black pill was a reported bug; a test pins this.

## 6. Server (`server.ts`)

- `Bun.serve({ port, fetch: handleRequest })`, port from `PORT` env (default 3000).
- `handleRequest(req)` is exported for tests; the server only starts under
  `import.meta.main`, so importing it in tests never binds a port.
- Routing: `/` → `/index.html`; any other path is resolved inside `public/`.
  Unknown paths and anything escaping the root (e.g. `/%2e%2e%2fDockerfile`)
  return 404. Only GET/HEAD are allowed (405 otherwise, `Allow: GET, HEAD`);
  HEAD returns headers with an empty body.
- Content types cover html/css/js/images/fonts; `Cache-Control: no-cache` for
  HTML, `public, max-age=3600` for assets.

## 7. Running

```bash
bun run start        # http://localhost:3000  (or: bun run server.ts)
bun run dev          # same, with --watch
PORT=8080 bun run start
```

Docker (note the port changed from the old Nginx setup: 3000, not 80):

```bash
docker build -t webapp .
docker run --rm -p 8080:3000 webapp
# open http://localhost:8080
```

CI (`.github/workflows/docker-image.yml`, on every push): `test` job
(checkout → `oven-sh/setup-bun@v2` → `bun test`), then `docker` job
(`needs: test`) pushes `<DOCKERHUB_USERNAME>/webapp:<full-git-sha>` and
`:latest` to Docker Hub (`vars.DOCKERHUB_USERNAME`, `secrets.DOCKERHUB_TOKEN`).

## 8. Tests

```bash
bun test             # 23 tests, ~0.3s, from repo root
```

`tests/site.test.ts` (`bun:test`, no extra deps) covers: page structure and
shared assets, no legacy references, links/anchors resolving, `public/`
containing only live files, dark-mode variables/toggle/persistence, the
Buy-now contrast regression, configurator groups and price math, the server
handler (200s, content types, 404, traversal rejection, 405, HEAD, cache
headers), and the Dockerfile/CI/`package.json` contracts. When you change
pages, prices, theme behaviour, server behaviour or deployment, update the
matching test in the same change and keep the suite green.

## 9. Change rules

1. Vanilla Bun + static HTML/CSS + the existing small JS. No new dependencies.
2. Keep both pages' nav/footer in sync; keep prices consistent across pages.
3. Colours via CSS variables only, so dark mode keeps working.
4. Run `bun test` and a live `bun run start` smoke check before finishing.
5. Update this file whenever structure, stack, ports or deployment change.

## 10. Attribution & git state

Original design lineage: Massively by HTML5 UP (CCA 3.0); the footer keeps an
"inspired by HTML5 UP" credit — keep a credit line there. Branch is `main`;
the minimal redesign, AERIS redesign, dark mode, tests and the Bun rewrite
are uncommitted in the working tree — check `git status` before assuming what
is deployed, since CI only publishes committed pushes.
