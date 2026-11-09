import { CaptionStyleSchema, DEFAULT_WORDS_PER_CARD, type CaptionStyleV2, type ProjectSettings } from "@capseasy/shared";
import legacyLooks from "./looks/legacy.generated.json";
import { NEW_LOOKS } from "./looks/new";
import { PREMIUM_LOOKS } from "./looks/premium";
import { isRetiredLook, lookNumber } from "./looks/numbers";
import { PACK_LOOKS, PACK_SECTIONS } from "./pack";
import { TEMPLATES } from "./templates";
import type { LookDefinition, TemplateDefinition } from "./types";

/** Product switch: emoji are hidden everywhere (render + studio controls) while this is false. */
export const EMOJI_ENABLED = false;

const byId = new Map<string, TemplateDefinition>(TEMPLATES.map((t) => [t.id, t]));
export const FALLBACK_TEMPLATE = "sentence_highlight";

let warned = new Set<string>();
/** Unknown ids never crash a render: fall back loudly (once) instead of silently mis-rendering. */
export function getTemplate(id: string): TemplateDefinition {
  const t = byId.get(id);
  if (t) return t;
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`[capseasy] unknown caption template "${id}", falling back to "${FALLBACK_TEMPLATE}"`);
  }
  return byId.get(FALLBACK_TEMPLATE)!;
}
export const hasTemplate = (id: string) => byId.has(id);
export const listTemplates = (): TemplateDefinition[] => TEMPLATES;

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep merge; arrays and scalars replace. `undefined` in the patch is ignored. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Template defaults <- (look or project style) <- card override. Always returns a fully valid style. */
export function resolveStyle(style: Partial<CaptionStyleV2> & { templateId?: string }, cardOverride?: Record<string, unknown> | null): CaptionStyleV2 {
  const tpl = getTemplate(style.templateId ?? FALLBACK_TEMPLATE);
  let merged = deepMerge(CaptionStyleSchema.parse({ templateId: tpl.id, ...tpl.defaults }) as unknown, style) as Plain;
  if (cardOverride) merged = deepMerge(merged, cardOverride);
  // emoji are switched off product-wide for now: stored emoji stay in the doc but never render
  return CaptionStyleSchema.parse({ ...merged, templateId: tpl.id, emoji: { ...(merged.emoji as Plain | undefined), enabled: EMOJI_ENABLED } });
}

/**
 * Curated gallery: ONE look per distinct visual identity (layout + motion + typographic character).
 * Colour-only variants were removed; users recolour any look in the Style panel or save their own.
 * Projects that used a removed look keep rendering (their full style is stored on the project).
 */
const CURATED_NEW = new Set([
  "metal_script", "soft_glow", "neon_duo", "serif_behind", "ice_duo", "serif_accent_glow",
  "hormozi_box", "beast_bounce", "karaoke_fill", "pop_clean", "gradient_pop", "outline_fill", "bold_pill",
  "comic_burst", "wave_bounce", "storytime", "chat_bubble", "scribble",
  "minimal_pro", "netflix_sub", "lower_third", "read_along",
  "luxe_serif", "motivational", "film_noir", "kinetic_mix",
  "retro_vhs", "retro_3d", "neon_sign", "terminal", "gaming_hud",
  "highlighter_card", "explainer", "desi_clean",
]);
// the five three-line stack skins are genuinely different designs; the other legacy looks were colour variants
const CURATED_LEGACY = new Set(["staggered_splash", "glow_stack_classic", "cartoon_stack_classic", "serif_pop_classic", "vintage_cinematic"]);
/**
 * The stack skins used to ignore the stored spoken-word effect ("pop") and hard-code some body fonts. Now that
 * those controls are wired, pin what these looks actually showed so they render exactly as before.
 */
const LEGACY_FIXES: Record<string, unknown> = {
  staggered_splash: { active: { effect: "none" } },
  glow_stack_classic: { active: { effect: "none" } },
  cartoon_stack_classic: { fontId: "Caveat", active: { effect: "none" } },
  serif_pop_classic: { active: { effect: "color" } },
  vintage_cinematic: { active: { effect: "none" } },
};

/**
 * Gallery names say what makes each look different (its signature effect), and tags list the rest of its
 * character. Ids never change: projects store the id.
 */
const DISPLAY: Record<string, { name: string; tags: string[] }> = {
  metal_script: { name: "Metal Slam + Script", tags: ["Letter slam", "Script"] },
  soft_glow: { name: "Soft Glow", tags: ["Glow", "Rise"] },
  neon_duo: { name: "Neon Caps + Script", tags: ["Neon", "Italic serif"] },
  serif_behind: { name: "Giant Serif Behind", tags: ["Big word", "Glow"] },
  ice_duo: { name: "Italic Over Ice Caps", tags: ["Italic serif", "Glow"] },
  serif_accent_glow: { name: "Serif Accent Glow", tags: ["Halo", "Italic word"] },
  hormozi_box: { name: "Jumping Box", tags: ["Caps", "Box highlight"] },
  beast_bounce: { name: "Bouncy Single Word", tags: ["One word", "3D shadow"] },
  karaoke_fill: { name: "Karaoke Fill", tags: ["Full line", "Colour sweep"] },
  pop_clean: { name: "Pop-Up Word", tags: ["Scale pop", "Outline"] },
  gradient_pop: { name: "Gradient Word", tags: ["One word", "Gradient"] },
  outline_fill: { name: "Hollow to Solid", tags: ["Outline", "Fill in"] },
  bold_pill: { name: "Dark Pill Highlight", tags: ["Pill", "Colour"] },
  comic_burst: { name: "Comic Tilt", tags: ["One word", "Tilt", "Shadow"] },
  wave_bounce: { name: "Hopping Word", tags: ["Bounce", "Rounded"] },
  storytime: { name: "Pastel Box", tags: ["Box highlight", "Soft"] },
  chat_bubble: { name: "Chat Bubble", tags: ["Bubble", "Messages"] },
  scribble: { name: "Marker Scribble", tags: ["Handwritten", "Marker"] },
  minimal_pro: { name: "Dim Until Spoken", tags: ["Minimal", "Pill"] },
  netflix_sub: { name: "Classic Subtitle", tags: ["Subtitle", "Still"] },
  lower_third: { name: "News Lower Third", tags: ["Bar", "Accent"] },
  read_along: { name: "Read-Along Light Up", tags: ["Full line", "Dimmed"] },
  luxe_serif: { name: "Italic Serif Wipe", tags: ["Serif", "Wipe"] },
  motivational: { name: "Wide Tracked Word", tags: ["One word", "Tall caps"] },
  film_noir: { name: "Noir Band", tags: ["Serif", "Dark band"] },
  kinetic_mix: { name: "Kinetic Big Word", tags: ["Stacked", "Tilt"] },
  retro_vhs: { name: "VHS Colour Split", tags: ["Pixel", "Retro"] },
  retro_3d: { name: "3D Extrusion", tags: ["One word", "3D"] },
  neon_sign: { name: "Neon Glow", tags: ["Glow", "Retro"] },
  terminal: { name: "Typewriter Terminal", tags: ["Mono", "Cursor"] },
  gaming_hud: { name: "Violet HUD Box", tags: ["Caps", "Box highlight"] },
  highlighter_card: { name: "Yellow Highlighter", tags: ["Card", "Marker"] },
  explainer: { name: "Underline Sweep", tags: ["Readable", "Underline"] },
  desi_clean: { name: "Desi Amber Word", tags: ["Devanagari", "Colour"] },
  vintage_cinematic: { name: "Giant Italic Hero", tags: ["3 lines", "Serif hero"] },
  staggered_splash: { name: "3-Line Stagger", tags: ["3 lines", "Big middle word"] },
  glow_stack_classic: { name: "3-Line Glow Hero", tags: ["3 lines", "Glow"] },
  serif_pop_classic: { name: "Script Hero Pop", tags: ["3 lines", "Script"] },
  cartoon_stack_classic: { name: "Cartoon 3-Line", tags: ["3 lines", "Handwritten"] },
};
const named = (l: LookDefinition): LookDefinition => ({ ...l, ...DISPLAY[l.id] });

const ALL_LOOKS: LookDefinition[] = [
  ...NEW_LOOKS.filter((l) => CURATED_NEW.has(l.id)).map((l) => named({ ...l, style: resolveStyle({ ...l.style, templateId: l.templateId }) })),
  // pack looks carry their own gallery name and tags
  ...PACK_LOOKS.map((l) => ({ ...l, style: resolveStyle({ ...l.style, templateId: l.templateId }) })),
  // Premium Plus looks (looks/premium.ts) carry their own gallery name and tags too
  ...PREMIUM_LOOKS.map((l) => ({ ...l, style: resolveStyle({ ...l.style, templateId: l.templateId }) })),
  ...(legacyLooks as unknown as LookDefinition[]).filter((l) => CURATED_LEGACY.has(l.id)).map((l) => named({ ...l, category: "Classic", style: CaptionStyleSchema.parse(deepMerge(deepMerge(l.style, LEGACY_FIXES[l.id]), { emoji: { enabled: EMOJI_ENABLED } })) })),
];

/** Gallery sections, in display order. "All" lists these first (in this order), then every other look. */
export const LOOK_SECTIONS: { id: string; label: string; lookIds: string[] }[] = [
  { id: "viral", label: "Viral", lookIds: ["metal_script", "soft_glow", "neon_duo", "serif_behind", "ice_duo", "serif_accent_glow", "staggered_splash", "glow_stack_classic", "vintage_cinematic", "serif_pop_classic", "kinetic_mix"] },
  { id: "popular", label: "Popular", lookIds: ["hormozi_box", "beast_bounce", "comic_burst", "chat_bubble", "explainer", "highlighter_card"] },
  ...PACK_SECTIONS.filter((s) => s.looks.length).map((s) => ({ id: s.id, label: s.label, lookIds: s.looks.map((l) => l.id) })),
  { id: "premium_plus", label: "Premium Plus", lookIds: PREMIUM_LOOKS.map((l) => l.id) },
].map((s) => ({ ...s, lookIds: s.lookIds.filter((id) => !isRetiredLook(id)) })).filter((s) => s.lookIds.length);
const featured = LOOK_SECTIONS.flatMap((s) => s.lookIds);
const rank = (id: string) => (featured.includes(id) ? featured.indexOf(id) : featured.length);

/**
 * Curated "Trending" picks: the new-motion showcases (Scribble Ring, Typed Caret, Amber Sweep Box,
 * Slice Signal) plus the strongest karaoke / bold classics. Display metadata only — applied here,
 * centrally, so no look definition file (and no uniqueness signature) changes; see LookDefinition.trending.
 */
export const TRENDING_LOOK_IDS: readonly string[] = [
  "scribble_ring",
  "typed_caret",
  "amber_sweep_box",
  "slice_signal",
  // karaoke classics: karaoke_fill itself is retired from the gallery, so its live karaoke kin carry the slot
  "karaoke_pill",
  "emerald_karaoke_pro",
  "hormozi_box",
  "beast_bounce",
  "metal_script",
  "comic_burst",
];
const TRENDING = new Set(TRENDING_LOOK_IDS);

const NUMBERED: LookDefinition[] = [...ALL_LOOKS].sort((a, b) => rank(a.id) - rank(b.id)).map((l) => ({ ...l, number: lookNumber(l.id), trending: TRENDING.has(l.id) }));
/** the gallery: every look except retired ones (see looks/numbers.ts) */
export const LOOKS: LookDefinition[] = NUMBERED.filter((l) => !isRetiredLook(l.id));
/** the curated trending looks, in TRENDING_LOOK_IDS order (hero cylinder + picker badge) */
export const TRENDING_LOOKS: LookDefinition[] = TRENDING_LOOK_IDS.map((id) => LOOKS.find((l) => l.id === id)).filter((l): l is LookDefinition => !!l);

/** resolves retired looks too, so projects that use one keep rendering */
const looksById = new Map(NUMBERED.map((l) => [l.id, l]));
export const getLook = (id: string | null | undefined): LookDefinition | undefined => (id ? looksById.get(id) : undefined);
export { lookNumber, isRetiredLook, LOOK_NUMBER_ORDER, RETIRED_LOOK_NUMBERS } from "./looks/numbers";
export const lookCategories = (): string[] => [...new Set(LOOKS.map((l) => l.category))];

/**
 * Switch look: keeps content, replaces styling wholesale (the look is a complete style). Words per card is the
 * creator's choice, not the look's: every look uses DEFAULT_WORDS_PER_CARD except one-word looks, which need 1, and
 * layouts composed for an exact count (TemplateDefinition.fixedWordsPerCard).
 * (Pass the current value to keep a creator's own setting when switching between multi-word looks.)
 */
export function applyLook(look: LookDefinition, currentWordsPerCard?: number): { style: CaptionStyleV2; settings: Partial<ProjectSettings> } {
  const style = resolveStyle(look.style);
  const tpl = getTemplate(style.templateId);
  const oneWord = tpl.layout === "word";
  const { maxWordsPerCard: _ignored, ...rest } = look.settings;
  const keep = currentWordsPerCard !== undefined && currentWordsPerCard > 1 ? currentWordsPerCard : DEFAULT_WORDS_PER_CARD;
  // layouts composed for an exact word count (a 2-word bubble, a 5-word composition) always get it
  return { style, settings: { ...rest, maxWordsPerCard: oneWord ? 1 : tpl.fixedWordsPerCard ?? keep } };
}
