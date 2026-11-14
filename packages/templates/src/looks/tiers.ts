import { LOOK_NUMBER_ORDER } from "./numbers";
import type { LookTier } from "../types";

/**
 * Look tiers for monetization (owner brief 2026-11-14): exactly the 25 ids
 * in FREE_LOOK_IDS are free. Every other KNOWN look is premium.
 *
 * This module is PURE DATA — its only import is the permanent number list
 * (itself pure: no React, no browser APIs). It must stay that way. The
 * server export routes import this file directly, by deep path, because
 * the templates barrel (src/index.ts) re-exports client-only modules
 * (videoFrame's createContext, fonts' useEffect) that Next.js refuses in
 * a route handler — importing the barrel from a server route fails the
 * production build. The registry imports the same set, so the picker and
 * the server can never drift.
 *
 * Membership is the permanent number list: it holds every built-in look
 * (gallery + retired, 178 ids). Hidden looks (desi_bold, podcast_duo,
 * chat_bubble_green, emoji_react) are NOT in it, user-saved templates
 * ("user:...") are NOT in it, and unknown ids are NOT in it — none of
 * those is ever premium.
 */

/**
 * Free looks: the 25, copied exactly from the owner brief. Do NOT re-pick,
 * add or swap ids here without the owner: the 25 were chosen against
 * criteria C1–C6 (see
 * ~/workspace/pricing/monetization-implementation/looks-selection.md).
 */
export const FREE_LOOK_IDS: ReadonlySet<string> = new Set([
  "netflix_sub", "minimal_pro", "read_along", "shimmer_pass", "explainer",
  "highlighter_card", "broadcast_lower", "hormozi_box", "karaoke_pill",
  "chat_bubble", "storytime", "wave_bounce", "scribble", "cream_strip_lines",
  "terminal", "motivational", "luxe_serif", "retro_vhs", "soft_glow",
  "selection_highlight", "plain_lowercase", "solid_label_card", "light_to_bold",
  "typo_big_small", "typo_editorial_indent",
]);

/** The tier of one look id: free only when it is in FREE_LOOK_IDS, premium otherwise. */
export const lookTier = (id: string): LookTier => (FREE_LOOK_IDS.has(id) ? "free" : "premium");

/**
 * True when the id is a known look (gallery or retired) and not free.
 * Unknown ids, hidden looks and user-saved templates are never premium:
 * they carry no premium style the gate could protect.
 */
export const isPremiumLookId = (id: string | null | undefined): boolean =>
  !!id && LOOK_NUMBER_ORDER.includes(id) && !FREE_LOOK_IDS.has(id);
