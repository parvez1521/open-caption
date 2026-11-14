import type React from "react";
import type { CaptionStyleV2, Emotion, Page, ProjectSettings } from "@capseasy/shared";
import type { ACTIVE_EFFECTS, ENTRANCES } from "@capseasy/shared";

export interface Canvas {
  width: number;
  height: number;
  fps: number;
}

export interface MeasureSpec {
  fontFamily: string;
  fontWeight: number | string;
  fontSize: number;
  letterSpacing?: number;
  fontStyle?: string;
}
export type MeasureFn = (text: string, spec: MeasureSpec) => number;

export interface PageRenderProps {
  page: Page;
  /** absolute media time in ms (page.startMs + local elapsed) */
  timeMs: number;
  style: CaptionStyleV2;
  canvas: Canvas;
  measure: MeasureFn;
  /** true when paused/scrubbing: entrances render fully settled */
  settled?: boolean;
}

export type CoreLayoutId = "sentence" | "word" | "stack3" | "karaoke" | "typewriter" | "bar" | "bubble" | "highlighter" | "kinetic" | "glow-flow" | "glow-duo" | "glow-behind" | "metal-script";
/** pack layouts (src/pack) name themselves "pack-*" */
export type LayoutId = CoreLayoutId | `pack-${string}`;

export interface EmotionModifier {
  /** replaces the highlight colour when emotion reactivity is high */
  accent?: string;
  /** replaces the spoken-word effect (only if the template supports it) */
  effect?: CaptionStyleV2["active"]["effect"];
  /** multiplies the spoken-word scale */
  scale?: number;
  /** shown in the emoji burst when the card has no emoji of its own */
  emoji?: string;
}

export interface TemplateCapabilities {
  hero: boolean;
  alignment: boolean;
  stagger: boolean;
  accentPeriod: boolean;
  weight: boolean;
  color: boolean;
  background: boolean;
  emoji: boolean;
  activeEffects: readonly (typeof ACTIVE_EFFECTS)[number][];
  entrances: readonly (typeof ENTRANCES)[number][];
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  layout: LayoutId;
  defaults: Partial<CaptionStyleV2>;
  settingsDefaults: Partial<ProjectSettings>;
  capabilities: TemplateCapabilities;
  /** Google font families this template always needs, on top of the style's fonts */
  fonts: string[];
  /** the layout draws the key (hero) word in its own size/font, so the hero scale and font controls apply */
  heroDrawn?: boolean;
  /** the layout is composed for exactly this many words per card (e.g. a 2-word bubble, a 5-word composition) */
  fixedWordsPerCard?: number;
  /** per-template overrides of the default emotion styling */
  emotionMap?: Partial<Record<Emotion, EmotionModifier>>;
  Page: React.FC<PageRenderProps>;
}

/** Monetization tier of a look. Free plans get the 25 free looks; paid plans get all 150. */
export type LookTier = "free" | "premium";

export interface LookDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  templateId: string;
  style: CaptionStyleV2;
  settings: Partial<ProjectSettings>;
  /** permanent number shown after the name ("Karaoke Fill #3"); see looks/numbers.ts */
  number?: number;
  /** short traits shown under the gallery preview ("Caps", "Box highlight") */
  tags?: string[];
  legacy?: boolean;
  /**
   * Monetization tier, assigned by the registry from FREE_LOOK_IDS — never
   * by a look definition file. Like `trending`, display/entitlement metadata
   * only: it is NOT part of a look's style or its uniqueness signature, so
   * flipping it never changes a render. User-saved templates carry no tier
   * and are treated as free (they are the creator's own style).
   */
  tier?: LookTier;
  /**
   * Display metadata only: curated "Trending" picks for the landing hero cylinder and the studio
   * picker badge. Deliberately NOT part of a look's style or its uniqueness signature
   * (template + font + effect + fill + background) — flipping it never changes a render.
   */
  trending?: boolean;
}
