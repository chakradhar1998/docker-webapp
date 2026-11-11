// AERIS site tests — Bun test runner, no extra dependencies.
// Run from the repo root:  bun test
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { handleRequest, SITE_ROOT } from "../server.ts";

const ROOT = resolve(import.meta.dir, "..");
const PAGES = ["index.html", "generic.html"];
const readSite = (rel: string) => readFileSync(join(SITE_ROOT, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("page structure", () => {
  test("pages exist", () => {
    for (const p of PAGES) expect(existsSync(join(SITE_ROOT, p))).toBe(true);
  });

  test("html basics: lang, viewport, title", () => {
    for (const p of PAGES) {
      const html = readSite(p);
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('name="viewport"');
      expect(html).toMatch(/<title>[^<]+<\/title>/);
    }
  });

  test("both pages load only landing.css and theme.js", () => {
    for (const p of PAGES) {
      const html = readSite(p);
      expect(html).toContain('href="assets/css/landing.css"');
      expect(html).toContain('src="assets/js/theme.js"');
      for (const banned of ["main.css", "minimal.css", "jquery", "fontawesome", "elements.html"])
        expect(html).not.toContain(banned);
    }
  });

  test("brand and fictional-demo footer credit", () => {
    for (const p of PAGES) {
      expect(readSite(p)).toContain("AERIS");
      expect(readSite(p)).toContain("fictional demo");
    }
  });

  test("local links and anchors resolve", () => {
    const ids: Record<string, Set<string>> = {};
    for (const p of PAGES) {
      ids[p] = new Set([...readSite(p).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    }
    for (const p of PAGES) {
      for (const m of readSite(p).matchAll(/(?:href|src)="([^"]+)"/g)) {
        const ref = m[1];
        if (ref.startsWith("http") || ref.startsWith("mailto:")) continue;
        const [file, frag] = ref.split("#");
        if (file) expect(existsSync(join(SITE_ROOT, file)), `${p}: ${ref}`).toBe(true);
        if (frag) expect(ids[file || p]?.has(frag), `${p}: ${ref}`).toBe(true);
      }
    }
  });

  test("public/ contains only live assets (no legacy template files)", () => {
    const all: string[] = [];
    const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : all.push(e.name));
    walk(SITE_ROOT);
    expect(all.sort()).toEqual(["generic.html", "index.html", "landing.css", "theme.js"]);
  });
});

describe("dark mode", () => {
  const css = readSite("assets/css/landing.css");
  const js = readSite("assets/js/theme.js");

  test("toggle button on both pages", () => {
    for (const p of PAGES) {
      expect(readSite(p)).toContain('id="themeToggle"');
      expect(readSite(p)).toContain('aria-pressed="false"');
    }
  });

  test("css defines light and dark variables, body uses them", () => {
    expect(css).toContain("--bg:#fff");
    const dark = css.match(/\[data-theme="dark"\]\{([^}]*)\}/)?.[1] ?? "";
    for (const v of ["--bg:#0b0b0c", "--ink:#f4f4f5", "--muted:", "--line:"])
      expect(dark).toContain(v);
    const body = css.match(/body\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toContain("background:var(--bg)");
    expect(body).toContain("color:var(--ink)");
  });

  test("theme.js persists and respects system preference", () => {
    expect(js).toContain("localStorage.getItem('aeris-theme')");
    expect(js).toContain("localStorage.setItem('aeris-theme'");
    expect(js).toContain("prefers-color-scheme: dark");
    expect(js).toContain("data-theme");
  });

  test("buy-now regression: nav button text uses --bg on dark pill", () => {
    const rule = css.match(/\.links a\.btn\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("color:var(--bg)");
  });
});

describe("configurator (generic.html)", () => {
  const html = readSite("generic.html");
  const groups: Record<string, { add: number; pressed: boolean }[]> = {};
  for (const m of html.matchAll(/data-group="(\w+)">([\s\S]*?)<\/div>\s*<\/div>/g)) {
    groups[m[1]] = [...m[2].matchAll(/data-add="(\d+)" aria-pressed="(\w+)"/g)]
      .map((o) => ({ add: Number(o[1]), pressed: o[2] === "true" }));
  }

  test("chip/ram/ssd groups, one free default each", () => {
    expect(Object.keys(groups).sort()).toEqual(["chip", "ram", "ssd"]);
    for (const opts of Object.values(groups)) {
      const defaults = opts.filter((o) => o.pressed);
      expect(defaults.length).toBe(1);
      expect(defaults[0].add).toBe(0);
    }
  });

  test("price math: base 1199, max 2299, displayed base matches", () => {
    const base = Number(html.match(/var base=(\d+)/)?.[1]);
    expect(base).toBe(1199);
    const max = base + Object.values(groups)
      .reduce((sum, opts) => sum + Math.max(...opts.map((o) => o.add)), 0);
    expect(max).toBe(2299);
    expect(html).toContain('id="price">$1,199<');
    expect(readSite("index.html")).toContain("from $1,199");
  });

  test("buy button and status region exist", () => {
    expect(html).toContain('id="buyBtn"');
    expect(html).toContain('id="msg"');
  });
});

describe("server (handleRequest)", () => {
  const req = (path: string, method = "GET") => handleRequest(new Request(`http://test${path}`, { method }));

  test("GET / serves the landing page", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("AERIS");
  });

  test("GET pages and assets serve 200 with types", async () => {
    for (const [path, type] of [
      ["/generic.html", "text/html"],
      ["/assets/css/landing.css", "text/css"],
      ["/assets/js/theme.js", "text/javascript"],
    ] as const) {
      const res = await req(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("Content-Type"), path).toContain(type);
    }
  });

  test("missing and deleted pages 404", async () => {
    expect((await req("/elements.html")).status).toBe(404);
    expect((await req("/nope.html")).status).toBe(404);
  });

  test("path traversal is rejected", async () => {
    expect((await req("/%2e%2e%2fDockerfile")).status).toBe(404);
    expect((await req("/assets/%2e%2e%2f%2e%2e%2fpackage.json")).status).toBe(404);
  });

  test("non-GET is 405 and HEAD has no body", async () => {
    expect((await req("/", "POST")).status).toBe(405);
    const head = await req("/", "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  test("html is no-cache, assets are cached", async () => {
    expect((await req("/")).headers.get("Cache-Control")).toBe("no-cache");
    expect((await req("/assets/css/landing.css")).headers.get("Cache-Control"))
      .toContain("max-age=3600");
  });
});

describe("Dockerfile and CI", () => {
  const docker = readRoot("Dockerfile");
  const ci = readRoot(".github/workflows/docker-image.yml");

  test("Dockerfile runs the Bun server", () => {
    expect(docker).toContain("FROM oven/bun:1");
    expect(docker).toMatch(/^EXPOSE 3000$/m);
    expect(docker).toContain('CMD ["bun", "run", "server.ts"]');
    expect(docker).not.toContain("nginx");
  });

  test("Docker copy sources exist", () => {
    for (const m of docker.matchAll(/^COPY (\S+) /gm)) {
      const src = m[1];
      if (src.includes("*")) {
        const dir = join(ROOT, src.slice(0, src.indexOf("*")));
        expect(existsSync(dir) && readdirSync(dir).length > 0, src).toBe(true);
      } else {
        expect(existsSync(join(ROOT, src)), src).toBe(true);
      }
    }
  });

  test("CI tests with Bun before pushing the image", () => {
    expect(ci).toContain("oven-sh/setup-bun");
    expect(ci).toContain("bun test");
    expect(ci).toMatch(/docker:\s*\n\s*needs: test/);
    expect(ci).toContain("webapp:${{ github.sha }}");
    expect(ci).toContain("webapp:latest");
  });

  test("package.json declares start/dev/test on Bun", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    expect(pkg.scripts.start).toContain("bun");
    expect(pkg.scripts.test).toBe("bun test");
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
