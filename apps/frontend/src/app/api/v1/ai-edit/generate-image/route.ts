import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { CloudAiError, cloudImageConfig, runCloudImage } from "@/lib/api/cloudAi";

/**
 * AI Edit image generation (Studio revision, 2026-11-22): the client sends
 * ONE prompt (a plan item's prompt, or the one-off prompt) and the route
 * runs Cloudflare Workers AI FLUX.1 [schnell] server-side, returning the
 * image as a data URL. No model or provider name is ever returned to the
 * client, and no visitor sign-in is needed — this replaces Puter image
 * generation, whose free monthly allowance was spent on 2026-11-21
 * ("Low Balance" on all 8 visuals) and whose Qwen Image switch was never
 * proven free live. Video generation still goes through Puter (FLUX is
 * image-only), so the panel only asks for a Puter sign-in when a plan
 * holds a video item.
 *
 * Cost guard: images draw from the SAME free 10,000 Neurons/day pool as
 * the text planner, and one image costs far more than one plan call — so
 * images get their OWN buckets, separate from the plan route's 600/day
 * site bucket: 20/day per user, 50/day site-wide (the ~57/day estimate
 * for FLUX.1 schnell on the free pool). When the site bucket is spent
 * the panel says so plainly instead of spinning.
 *
 * Failure wording follows the plan route's rule: a 401/403
 * means the free AI key is dead, a 429 means the free daily limit is used
 * up, a 410 means Cloudflare retired the model, a timeout means the
 * model took too long, an empty answer means it returned no image —
 * anything else keeps the "could not be reached" wording. The upstream
 * status, failure kind and error message are also logged server-side (no
 * key, no prompt text) so the failure can be traced in the deployment
 * logs.
 */

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return ok({ configured: !!cloudImageConfig() });
});

const Body = z.object({
  prompt: z.string().min(1).max(1000),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  if (!cloudImageConfig()) return ok({ configured: false as const });
  await rateLimit(user.id, "ai_edit_generate_image", 20, 86_400);
  await rateLimit("site", "ai_edit_generate_image_site", 50, 86_400);

  let image: { imageBase64: string; mime: string };
  try {
    image = await runCloudImage(body.prompt);
  } catch (err) {
    const status = err instanceof CloudAiError ? err.status : undefined;
    const kind = err instanceof CloudAiError ? err.kind : undefined;
    const detail = err instanceof CloudAiError ? err.detail : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        msg: "ai-edit/generate-image free AI call failed",
        status: status ?? "unknown",
        kind: kind ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
        ...(detail !== undefined ? { detail } : {}),
      }),
    );
    if (status === 401 || status === 403) {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "The free AI key isn't working. It may have expired, so check the key in Vercel.",
      );
    }
    if (status === 429) {
      throw new ApiFailure("RATE_LIMITED", "The free image limit is used up for today. Try again tomorrow.");
    }
    if (status === 410) {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "Cloudflare retired this free image model, so no image can be made right now. The site needs a newer model set in Vercel.",
      );
    }
    if (kind === "timeout") {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "The free AI took too long to draw the image. Try again — a shorter prompt draws faster.",
      );
    }
    if (kind === "empty") {
      throw new ApiFailure("UPSTREAM_FAILED", "The free AI answered but made no image. Try again.");
    }
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
  console.info(
    JSON.stringify({
      level: "info",
      msg: "ai-edit/generate-image free AI call succeeded",
      bytes: image.imageBase64.length,
      mime: image.mime,
    }),
  );
  return ok({ configured: true as const, imageDataUrl: `data:${image.mime};base64,${image.imageBase64}` });
});
