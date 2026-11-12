import "server-only";
import { isIP } from "node:net";
import { PLANS } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { linkFileName } from "@/features/transcribe/linkFile";

/**
 * GET /api/v1/transcribe/proxy?url=<direct media link>
 *
 * Same-origin proxy for the Transcribe page's link mode. The browser can no
 * longer fetch an arbitrary media host directly — production connect-src CSP
 * is 'self' + named hosts only — so the server fetches the linked file and
 * streams it back to the browser. The file is never stored: bytes flow
 * straight through, and transcription still runs on the user's device.
 * No CSP change is needed: the browser only ever talks to this same-origin route.
 *
 * Guards, all with plain errors:
 * - http/https only; literal private/loopback/link-local IPs and localhost are
 *   refused, so this route can't be used to reach internal addresses.
 * - at most 5 redirects, each re-checked the same way.
 * - content-length over the Transcribe cap (frozen Free tier, 50 MB) is
 *   refused before streaming; a body that runs past the cap mid-stream is
 *   cut off by the counting transform below.
 * - a served content-type that is present and not audio/video is refused.
 *   (No content-type at all passes through — the browser-side probe still
 *   rejects a file that isn't media.)
 */
const MAX_BYTES = PLANS.free.maxUploadBytes;
const MAX_REDIRECTS = 5;

const overLimitMessage = () =>
  `This file is over the ${uploadLimitLabel(MAX_BYTES)} limit for this tool. Trim it and try again.`;

const BAD_URL_MESSAGE = "Paste a full link starting with http:// or https://.";

/** Literal private/loopback/link-local hostnames. No DNS is consulted: a name that resolves to a private address is out of scope for this guard. */
function isPrivateHost(hostname: string): boolean {
  // WHATWG URL keeps IPv6 brackets in hostname ("[::1]"); isIP wants them stripped.
  const h = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const v = isIP(h);
  if (v === 4) {
    const [a, b] = h.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  if (v === 6) {
    if (h === "::1" || h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb") || h.startsWith("fc") || h.startsWith("fd")) return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateHost(mapped[1]!);
  }
  return false;
}

/** Parse + check one URL (the original or a redirect target). */
function checkUrl(raw: string | null): URL {
  if (!raw) throw new ApiFailure("VALIDATION", BAD_URL_MESSAGE);
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ApiFailure("VALIDATION", BAD_URL_MESSAGE);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiFailure("VALIDATION", BAD_URL_MESSAGE);
  }
  if (isPrivateHost(url.hostname)) {
    throw new ApiFailure("VALIDATION", "This link points to a private address. Paste a public link to a media file.");
  }
  return url;
}

/** Fetch upstream with redirects followed manually, so every hop is re-checked. */
async function fetchUpstream(url: URL): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current.toString(), { redirect: "manual" });
    } catch {
      throw new ApiFailure("UPSTREAM_FAILED", "Couldn't reach this link — check it and try again.");
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (hop === MAX_REDIRECTS) throw new ApiFailure("UPSTREAM_FAILED", "This link redirects too many times. Check the link and try again.");
      if (!next) throw new ApiFailure("UPSTREAM_FAILED", "This link couldn't be opened — it redirects nowhere. Check the link and try again.");
      try {
        current = checkUrl(new URL(next, current).toString());
      } catch (e) {
        if (e instanceof ApiFailure) throw e;
        throw new ApiFailure("UPSTREAM_FAILED", "This link redirects to an address that can't be opened. Check the link and try again.");
      }
      continue;
    }
    return res;
  }
  throw new ApiFailure("UPSTREAM_FAILED", "This link redirects too many times. Check the link and try again.");
}

/** Pass the body through, erroring the stream the moment it runs past the cap — no unbounded buffering. */
function capStream(body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> {
  if (!body) return new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BYTES) controller.error(new Error(overLimitMessage()));
        else controller.enqueue(chunk);
      },
    }),
  );
}

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "transcribe_proxy", 30, 3600);
  await rateLimit("site", "transcribe_proxy_global", 600, 86_400);
  const url = checkUrl(new URL(req.url).searchParams.get("url"));
  const res = await fetchUpstream(url);
  if (!res.ok) throw new ApiFailure("UPSTREAM_FAILED", `This link couldn't be opened (HTTP ${res.status}). Check the link and try again.`);
  const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type && !type.startsWith("video/") && !type.startsWith("audio/")) {
    throw new ApiFailure("UNSUPPORTED_MEDIA", "This link isn't a video or audio file.");
  }
  const len = res.headers.get("content-length");
  if (len !== null && Number(len) > MAX_BYTES) throw new ApiFailure("LIMIT_EXCEEDED", overLimitMessage());
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  if (len !== null) headers.set("content-length", len);
  // The name is URL-encoded: a raw filename can hold characters a header value may not.
  headers.set("x-file-name", encodeURIComponent(linkFileName(url, type || null)));
  headers.set("cache-control", "no-store");
  return new Response(capStream(res.body), { status: 200, headers });
});
