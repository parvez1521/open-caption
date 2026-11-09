/**
 * Brand — the ONE place the product name and site copy live.
 *
 * Final brand name decided by the owner (2026-11-09): "Open Caption".
 * To rename the product later, change BRAND_NAME here (plus the two-part
 * wordmark split in components/brand/Logo.tsx) and the visible spots that
 * import from this file will follow.
 */
export const BRAND_NAME = "Open Caption";

/** Wordmark parts: first part bold, second part in the serif-italic accent. */
export const BRAND_WORDMARK_LEAD = "Open";
export const BRAND_WORDMARK_ACCENT = "Caption";

export const BRAND_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export const BRAND_TITLE = `Word-timed captions for Reels, Shorts and TikTok, made in your browser | ${BRAND_NAME}`;

export const BRAND_DESCRIPTION =
  "Drop in a short video and get animated captions timed to every word. Fix any word, pick a style, and export an MP4 or subtitle file — everything runs in your browser, your video is never uploaded, and it costs nothing.";

export const BRAND_TAGLINE = `${BRAND_NAME}: captions timed to every word, made in your browser`;
