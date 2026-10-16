/**
 * The pack: 64 more caption looks, each with its own layout logic where the design needs one. Each file owns its
 * templates (ids "pack_*", layouts "pack-*") and looks; the registry and template list pick them up from here.
 * Pack files must not import ../registry or ../templates (circular): use ../text, ../motion, ../layouts/* and ./kit.
 */
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { CREATOR_LOOKS, CREATOR_TEMPLATES } from "./creator";
import { DYNAMIC_LOOKS, DYNAMIC_TEMPLATES } from "./dynamic";
import { GRAPHIC_LOOKS, GRAPHIC_TEMPLATES } from "./graphic";
import { LINES_LOOKS, LINES_TEMPLATES } from "./lines";
import { PLATES_LOOKS, PLATES_TEMPLATES } from "./plates";
import { PREMIUM_A_LOOKS, PREMIUM_A_TEMPLATES } from "./premium-a";
import { PREMIUM_B_LOOKS, PREMIUM_B_TEMPLATES } from "./premium-b";
import { TRENDING_LOOKS, TRENDING_TEMPLATES } from "./trending";
import { TYPO_LOOKS, TYPO_TEMPLATES } from "./typo";

export const PACK_TEMPLATES: TemplateDefinition[] = [...LINES_TEMPLATES, ...TYPO_TEMPLATES, ...CREATOR_TEMPLATES, ...GRAPHIC_TEMPLATES, ...DYNAMIC_TEMPLATES, ...TRENDING_TEMPLATES, ...PLATES_TEMPLATES, ...PREMIUM_A_TEMPLATES, ...PREMIUM_B_TEMPLATES];

/** gallery sections for the pack, in display order (each lists its looks in the order they're defined) */
export const PACK_SECTIONS: { id: string; label: string; looks: LookSeed[] }[] = [
  { id: "premium", label: "Premium motion", looks: [...PREMIUM_A_LOOKS, ...PREMIUM_B_LOOKS] },
  { id: "trending", label: "Trending", looks: [...TRENDING_LOOKS, ...PLATES_LOOKS] },
  { id: "creator", label: "Creator", looks: CREATOR_LOOKS },
  { id: "dynamic", label: "Dynamic", looks: DYNAMIC_LOOKS },
  { id: "typography", label: "Typography", looks: TYPO_LOOKS },
  { id: "simple", label: "Simple", looks: LINES_LOOKS },
  { id: "paper", label: "Paper & pop", looks: GRAPHIC_LOOKS },
];

export const PACK_LOOKS: LookSeed[] = PACK_SECTIONS.flatMap((s) => s.looks);
