/**
 * Facts the legal pages depend on. Fill every value marked TODO before launch (and have a lawyer review the
 * pages); they are rendered verbatim on /terms, /privacy, /cookies, /acceptable-use, /copyright,
 * /subprocessors.
 */
import { BRAND_NAME } from "./brand";

export const LEGAL = {
  product: BRAND_NAME,
  /** Run by one person (no company yet): "<Full legal name>, an individual trading as CaptionsEasy". Swap for the
   *  company name if one is registered later. */
  operator: "Ishaan Gupta, an individual trading as CaptionsEasy",
  /** City and state only: an individual doesn't need to publish a home address. */
  address: "Bengaluru, Karnataka, India",
  /** public support / privacy inbox */
  email: "hello@captionseasy.com",
  jurisdiction: "India",
  
  courts: "the courts of Bengaluru, Karnataka, India",
  /** date the current versions took effect */
  effective: "30 September 2026",
  /** minimum age to hold an account */
  minAge: 13,
  site: "captionseasy.com",
} as const;

/** Opens the visitor's mail app with a feedback email to the public inbox. */
export const FEEDBACK_MAILTO = `mailto:${LEGAL.email}?subject=${encodeURIComponent("Open Caption feedback")}`;

export const LEGAL_PAGES = [
  { href: "/terms", title: "Terms of Service" },
  { href: "/privacy", title: "Privacy Policy" },
  { href: "/cookies", title: "Cookie Policy" },
  { href: "/acceptable-use", title: "Acceptable Use" },
  { href: "/copyright", title: "Copyright & Takedowns" },
  { href: "/subprocessors", title: "Subprocessors" },
] as const;
