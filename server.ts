// AERIS site server — Bun runtime, no dependencies.
// Serves the static site in ./public.
import { join, resolve, sep } from "node:path";

export const SITE_ROOT = resolve(import.meta.dir, "public");
const PORT = Number(process.env.PORT ?? 3000);

const CACHE: Record<string, string> = {
  ".html": "no-cache",
  ".css": "public, max-age=3600",
  ".js": "public, max-age=3600",
};

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (pathname === "/") pathname = "/index.html";

  // Resolve inside the site root; reject anything escaping it.
  const filePath = resolve(join(SITE_ROOT, "." + pathname));
  if (filePath !== SITE_ROOT && !filePath.startsWith(SITE_ROOT + sep)) {
    return new Response("Not Found", { status: 404 });
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const ext = filePath.slice(filePath.lastIndexOf("."));
  const headers = {
    "Content-Type": contentType(filePath),
    "Cache-Control": CACHE[ext] ?? "public, max-age=3600",
  };
  return new Response(req.method === "HEAD" ? null : file, { headers });
}

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, fetch: handleRequest });
  console.log(`AERIS listening on http://localhost:${server.port}`);
}
