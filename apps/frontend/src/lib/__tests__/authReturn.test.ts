import { describe, expect, it } from "vitest";
import { CANONICAL_APP, authReturnScript } from "../authReturn";
import { PRODUCTION_URL } from "../seo";

describe("auth return canonical app", () => {
  it("falls back to the production custom domain (www), never the upstream Captions-Easy domain, when NEXT_PUBLIC_APP_URL is unset", () => {
    // vitest does not set NEXT_PUBLIC_APP_URL, so the module resolved the fallback
    expect(CANONICAL_APP).toBe(PRODUCTION_URL);
    expect(CANONICAL_APP).toBe("https://www.captionit.in");
    expect(CANONICAL_APP).not.toContain("captionseasy.com");
    expect(CANONICAL_APP).not.toContain("localhost");
    expect(CANONICAL_APP).not.toContain("open-caption-ten.vercel.app");
  });

  it("embeds the canonical URL in the inline return script, so a sign-in return is never forwarded to the upstream site", () => {
    const script = authReturnScript();
    expect(script).toContain("https://www.captionit.in");
    expect(script).not.toContain("captionseasy.com");
  });
});
