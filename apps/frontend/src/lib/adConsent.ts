/**
 * First-party advertising consent (A-13, 2026-11-15).
 *
 * One localStorage key remembers the visitor's ad choice: "accepted" or
 * "declined". Nothing else is stored, no cookie is set, and the choice is
 * read only in the browser (server rendering never sees it, so the AdSense
 * loader cannot be a server-rendered script tag any more — see
 * components/ads/AdSenseLoader.tsx).
 *
 * What this banner is NOT: a Google-certified CMP. In the EEA and the UK,
 * personalised ads legally need consent collected through a
 * Google-certified consent management platform, with IAB TCF signals and
 * Google Consent Mode wired in. This banner is a truthful stopgap for a
 * site with no ad slots yet: it asks first, loads Google's ad code only
 * after Accept, and loads nothing after Decline. Before ads serve to
 * EEA/UK visitors, swap this for a certified CMP and keep this banner's
 * gating (both loaders behind consent) as the behaviour to match.
 */

export const AD_CONSENT_KEY = "captionit-ad-consent";

/** Fired on window whenever the visitor makes (or remakes) a choice. */
export const AD_CONSENT_EVENT = "captionit:ad-consent";

export type AdConsentChoice = "accepted" | "declined";

export function readAdConsent(): AdConsentChoice | null {
  try {
    const value = window.localStorage.getItem(AD_CONSENT_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function writeAdConsent(choice: AdConsentChoice): void {
  try {
    window.localStorage.setItem(AD_CONSENT_KEY, choice);
    window.dispatchEvent(new Event(AD_CONSENT_EVENT));
  } catch {
    // Storage unavailable (private mode, blocked): the banner just asks
    // again next visit and the loader stays gated. Nothing to persist.
  }
}
