import { NextResponse, type NextRequest } from "next/server";

/**
 * D-5: /projects/<unknown-id> must return a real HTTP 404, not 200 with
 * the studio shell.
 *
 * Why this lives in the proxy (middleware) and not in the page/layout:
 * the route-level notFound() was tried first, in the page and then in
 * the segment layout — and live curl proved it cannot set the status in
 * this app. The document shell streams before any segment's async work
 * resolves (TTFB ~40 ms against a 2 s-delayed database stub), so a
 * notFound() thrown from a server component only swaps the streamed
 * body; the status stays 200. The D-1 mechanism (dynamicParams=false)
 * cannot apply either — projects are database rows, not a static
 * registry, so they cannot be enumerated at build time. The proxy runs
 * before any rendering, so it is the only place the status can be
 * decided. The layout's own existence check stays as well: it renders
 * the app's 404 UI for client-side (RSC) navigations, which the proxy
 * lets through untouched (see below).
 *
 * Behaviour: for a document request to /projects/<id> (or any path
 * under it), look the id up in Supabase (one indexed select). Unknown
 * id (or a non-UUID id, which Postgres would reject) gets a minimal
 * 404 page mirroring app/not-found.tsx. Anything else passes through.
 * Fail-open: a missing env, a non-2xx answer, a timeout (2 s) or any
 * fetch error all pass through, so a database problem never 404s real
 * projects — the layout check then handles the render as before.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECK_TIMEOUT_MS = 2000;

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · Captionit</title><style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#141412;color:#FFFFEB;font-family:system-ui,sans-serif;text-align:center;padding:24px}main{max-width:480px}.code{font-family:ui-monospace,monospace;font-size:14px;color:rgba(255,255,235,.6)}h1{margin:8px 0;font-size:24px}p{margin:8px 0 0;font-size:15px;color:rgba(255,255,235,.65)}a{display:inline-block;margin-top:24px;border-radius:999px;background:#FFFFEB;color:#141412;padding:10px 20px;font-size:14px;font-weight:600;text-decoration:none}</style></head><body><main><p class="code">404</p><h1>This page doesn&rsquo;t exist</h1><p>The link may be old or mistyped.</p><a href="/">Back to Captionit</a></main></body></html>`;

export const config = {
  matcher: ["/projects/:id", "/projects/:id/:path*"],
};

function notFoundResponse() {
  return new NextResponse(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
    },
  });
}

export default async function proxy(req: NextRequest) {
  // Client-side (RSC) navigations and prefetches: let them through
  // when we can recognise them. The segment layout's notFound()
  // renders the app's 404 UI for those; the status only matters for
  // document requests (initial loads, crawlers, link checkers), which
  // is what this proxy guards.
  //
  // VERIFIED LIVE (builds 4-6, `next start`, stub-counted): in this
  // Next 16.4.5 the proxy CANNOT recognise an RSC request. Every
  // signal the App Router client sends — `rsc: 1`,
  // `Next-Router-State-Tree`, `Next-Router-Prefetch`,
  // `Next-Router-Segment-Prefetch`, and the `?_rsc` search param — is
  // consumed by the server before middleware runs (they are the
  // FLIGHT_HEADERS list; the RSC normalizer strips `?_rsc` and the
  // headers are read into request meta). The checks below are kept
  // because they are the correct signals per the client bundle and
  // they pass in unit tests; live they are inert, so an RSC fetch for
  // an unknown id currently gets this proxy's plain 404 HTML. That
  // is still the correct outcome for the user: the client bundle has
  // an explicit fallback for a non-flight RSC response
  // (fetch-server-response.js: "Failed to fetch RSC payload...
  // Falling back to browser navigation") that does a full navigation,
  // which lands on this same 404 page. A live-browser confirmation
  // of that fallback is still owed — it could not be run from this
  // VM (no browser tasks for subagents).
  if (
    req.headers.get("rsc") === "1" ||
    req.headers.get("next-router-state-tree") !== null ||
    req.headers.get("next-router-prefetch") !== null ||
    req.headers.get("next-router-segment-prefetch") !== null
  ) {
    return NextResponse.next();
  }

  const id = req.nextUrl.pathname.split("/")[2] ?? "";
  if (!UUID_RE.test(id)) return notFoundResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.next();

  try {
    const res = await fetch(
      `${url}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(id)}&deleted_at=is.null&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      },
    );
    if (!res.ok) return NextResponse.next();
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return notFoundResponse();
  } catch {
    return NextResponse.next();
  }
  return NextResponse.next();
}
