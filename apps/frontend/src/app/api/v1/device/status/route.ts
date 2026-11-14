import { companionsEnabled } from "@/lib/api/auth";
import { ok, route } from "@/lib/api/http";

/**
 * Public capability flag: is the desktop helper (Companion) switched on for
 * this deployment? The Settings pairing section asks before offering the
 * "Connect this computer" button — when the helper is off, POST /device/setup
 * 403s, so offering the button is a dead end (overnight QA follow-up, 2026-11-15).
 * Public on purpose: the same fact is already visible from the setup route's
 * 403, and the value carries no user data.
 */
export const GET = route(async () => ok({ companionsEnabled: companionsEnabled() }));
