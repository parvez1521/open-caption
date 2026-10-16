/** Pack: Paper, sticker and overlay styles. Templates (layouts) and gallery looks; wired in through ./index.ts. */
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { capsOwn } from "./graphic-common";
import { CookLayout } from "./graphic-cook";
import { RANSOM_FONTS, RansomLayout, StickerLayout, TornPaperLayout } from "./graphic-paper";
import { BoxedLayout, NotificationLayout, PopupChatLayout } from "./graphic-ui";

/** the card enters as the layout draws it: no extra card entrance */
const OWN = { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" } as const;
const NO_EFFECT = { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 } as const;
/** the regular entrances, word by word (the torn-paper style doesn't lock its transitions) */
const WORD_ENTRANCES = ["none", "fade", "rise", "drop", "pop", "zoom", "slide-left", "slide-right", "blur-in", "flip", "elastic", "mask-reveal", "glitch"] as const;

const ransom = (id: string, name: string, description: string, live: boolean): TemplateDefinition => ({
  id, name, description, layout: "pack-ransom",
  defaults: {
    fontId: "Anton", fontWeight: 400, fontSize: 66, casing: "upper", lineHeight: 1.15, entrance: OWN, exit: { type: "none", durationMs: 0 }, active: NO_EFFECT,
    // the cut-outs' shadow: 0.04em 0.06em 0.05em rgba(0,0,0,.35)
    shadows: [{ x: 2.2, y: 3.4, blur: 2.8, color: "rgba(0,0,0,0.35)" }],
    templateOptions: { ransomLive: live },
  },
  settingsDefaults: { maxWordsPerCard: 3 },
  capabilities: capsOwn(), fonts: RANSOM_FONTS, Page: RansomLayout,
});

const popupChat = (id: string, name: string, tail: "right" | "left"): TemplateDefinition => ({
  id, name, description: `A mint speech bubble with its tail on the ${tail}, popping in with a twist`, layout: "pack-popup-chat",
  defaults: {
    fontId: "Nunito", fontWeight: 800, fontSize: 88, casing: "lower", letterSpacing: -1.2, lineHeight: 1.15, fill: { type: "solid", color: "#FFFFFF" },
    entrance: OWN, exit: { type: "none", durationMs: 0 }, active: NO_EFFECT, templateOptions: { tail, bubble: "#5EE5AC" },
  },
  settingsDefaults: { maxWordsPerCard: 3 },
  capabilities: capsOwn({ weight: true, color: true }), fonts: ["Nunito"], Page: PopupChatLayout,
});

export const GRAPHIC_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_cook", name: "Knockout Word", description: "The frame turns black and the word is cut out of it: the video shows only inside the letters", layout: "pack-cook",
    defaults: {
      fontId: "Archivo Black", fontWeight: 400, fontSize: 300, casing: "upper", maxWidth: 0.92, position: { x: 0.5, y: 0.5 }, entrance: OWN, exit: { type: "none", durationMs: 0 },
      active: NO_EFFECT, stroke: { enabled: true, width: 2, color: "#FFFFFF" }, templateOptions: { matte: "#000000" },
    },
    settingsDefaults: { maxWordsPerCard: 1 },
    capabilities: capsOwn(), fonts: ["Archivo Black"], fixedWordsPerCard: 1, Page: CookLayout,
  },
  {
    id: "pack_sticker", name: "Die-Cut Sticker", description: "A hatched slab-serif key word on a die-cut paper sticker, small words above and below", layout: "pack-sticker",
    defaults: {
      fontId: "Alfa Slab One", fontWeight: 400, fontSize: 56, casing: "lower", lineHeight: 1, fill: { type: "solid", color: "#F25555" },
      hero: { fontId: "Alfa Slab One", scale: 2.4, casing: "upper", rotate: 0 }, active: { effect: "none", color: "#F25555", scale: 1, boxRadius: 12 },
      stroke: { enabled: true, width: 4, color: "#1F1F1F" }, entrance: OWN, exit: { type: "none", durationMs: 0 },
      templateOptions: { paper: "#F7F4EC", shadow: "#141414" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: capsOwn({ hero: true, color: true }), heroDrawn: true, fonts: ["Alfa Slab One"], Page: StickerLayout,
  },
  ransom("pack_ransom", "Ransom Cut-Outs", "Every letter cut from a different magazine page", false),
  ransom("pack_ransom_live", "Stop-Motion Ransom", "Magazine cut-out letters that keep swapping font, paper and tilt", true),
  {
    id: "pack_torn_paper", name: "Torn Paper", description: "Heavy plum words on a thick, torn warm-paper cutout", layout: "pack-torn-paper",
    defaults: {
      fontId: "Archivo Black", fontWeight: 400, fontSize: 92, casing: "none", lineHeight: 1.5, wordSpacing: 6, fill: { type: "solid", color: "#6B3F7A" },
      active: { effect: "none", color: "#6B3F7A", scale: 1.1, boxRadius: 12 }, entrance: { type: "pop", durationMs: 400, stagger: "word", easing: "outExpo" },
      exit: { type: "none", durationMs: 0 }, templateOptions: { paper: "#F4EFE2" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: capsOwn({ color: true, activeEffects: ["none", "color", "pop", "scale-up", "bounce", "shake"], entrances: WORD_ENTRANCES }), fonts: ["Archivo Black"], Page: TornPaperLayout,
  },
  {
    id: "pack_boxed", name: "Neon Frame", description: "Light lead-in over a big italic serif word in a neon box whose lines run across the video", layout: "pack-boxed",
    defaults: {
      fontId: "Inter", fontWeight: 300, fontSize: 56, casing: "lower", letterSpacing: 1, lineHeight: 1.1, fill: { type: "solid", color: "#F0F0F0" },
      hero: { fontId: "Playfair Display", fontWeight: 600, scale: 2.6, rotate: 0 }, active: { effect: "none", color: "#C4FF4D", scale: 1, boxRadius: 12 },
      entrance: OWN, exit: { type: "none", durationMs: 0 },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: capsOwn({ hero: true, weight: true, color: true }), heroDrawn: true, fonts: ["Inter", "Playfair Display"], Page: BoxedLayout,
  },
  {
    id: "pack_notification", name: "Phone Notification", description: "Each card arrives as a phone notification banner", layout: "pack-notification",
    defaults: {
      fontId: "Inter", fontWeight: 400, fontSize: 40, casing: "none", lineHeight: 1.25, fill: { type: "solid", color: "#111111" },
      entrance: OWN, exit: { type: "none", durationMs: 0 }, active: NO_EFFECT, templateOptions: { app: "messages", sender: "Messages", time: "now", motion: "slide-down" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: capsOwn({ weight: true, color: true }), fonts: ["Inter"], Page: NotificationLayout,
  },
  popupChat("pack_popup_chat", "Mint Chat Pop", "right"),
  popupChat("pack_popup_chat_left", "Mint Chat Pop (Left)", "left"),
];

export const GRAPHIC_LOOKS: LookSeed[] = [
  { id: "knockout_word", name: "Video-Through Knockout", description: "The frame goes black and each word is cut out of it, so the video plays inside the letters", category: "Bold", templateId: "pack_cook",
    tags: ["One word", "Knockout", "Full frame"], style: {}, settings: { maxWordsPerCard: 1 } },
  { id: "die_cut_sticker", name: "Die-Cut Sticker", description: "A hatched red key word on a white die-cut sticker, small words tucked above and below", category: "Paper", templateId: "pack_sticker",
    tags: ["Sticker", "Big word", "Hatch"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "ransom_cutouts", name: "Ransom Cut-Outs", description: "Every letter cut from a different magazine: its own font, paper, ink and tilt", category: "Paper", templateId: "pack_ransom",
    tags: ["Cut-out letters", "Collage"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "ransom_flicker", name: "Stop-Motion Ransom", description: "Magazine cut-out letters that keep re-cutting themselves, five times a second", category: "Paper", templateId: "pack_ransom_live",
    tags: ["Cut-out letters", "Stop motion"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "torn_paper_cutout", name: "Torn Paper Cutout", description: "Heavy plum words on a thick torn scrap of warm paper", category: "Paper", templateId: "pack_torn_paper",
    tags: ["Paper", "Outline", "Pop"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "neon_frame_lines", name: "Neon Frame Lines", description: "A light lead-in over a big italic word in a neon box whose lines run across the whole video", category: "Neon", templateId: "pack_boxed",
    tags: ["Frame", "Italic serif", "Neon"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "phone_notification", name: "Phone Notification", description: "Each line slides down as a phone notification banner", category: "Social", templateId: "pack_notification",
    tags: ["Banner", "Social"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "mint_chat_pop", name: "Mint Chat Pop", description: "A mint pill speech bubble that pops in with a twist, tail on the right", category: "Social", templateId: "pack_popup_chat",
    tags: ["Bubble", "Messages", "Pop"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "mint_chat_pop_left", name: "Mint Chat Pop Left", description: "The mint speech bubble from the other side: tail on the left, twisting the other way", category: "Social", templateId: "pack_popup_chat_left",
    tags: ["Bubble", "Messages", "Mirrored"], style: {}, settings: { maxWordsPerCard: 3 } },
];
