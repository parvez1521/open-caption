/**
 * /ads.txt — served ONLY when a real AdSense publisher id is configured.
 *
 * AdSense readiness mechanism, not an application: no ads run on Open Caption
 * today and no publisher id is hardcoded anywhere. Set ADSENSE_PUBLISHER_ID
 * (format pub-XXXXXXXXXXXXXXXX) in the deployment environment once the owner
 * has a custom domain and an approved site, redeploy, and this route serves
 * the standard sellers line. While the env var is unset or malformed the
 * route 404s, exactly like a site with no ads.txt.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const publisherId = process.env.ADSENSE_PUBLISHER_ID?.trim();
  if (!publisherId || !/^pub-\d+$/.test(publisherId)) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
