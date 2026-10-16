/**
 * Pack: plate, stamp and whip styles (word plates, stamped keywords, blur whips, growing bars). Wired in through ./index.ts.
 * Re-created from the catalogue (docs/research/competitors-captions.md): VEED's Asphalt, Ticker, Sticker and Interrupt
 * (section 4.4) and OpusClip's Blur switch and Popline (section 3). Defaults are the catalogued values converted to
 * reference px at a 1080 short edge (VEED sizes are fractions of the short edge; OpusClip's are px on a 720 design).
 */
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { BlockCutInLayout, StampHoistLayout } from "./plates-hoist";
import { NO_EXIT, OWN_ENTRANCE, platesCaps } from "./plates-kit";
import { BlurWhipLayout, FatBarLayout } from "./plates-whip";
import { PlateTickerLayout, SandTilesLayout } from "./plates-words";

const solid = (color: string) => ({ type: "solid" as const, color });

export const PLATES_TEMPLATES: TemplateDefinition[] = [
  {
    // VEED "Asphalt": size 0.0625, wrap 0.4, line height 1.08, tracking 0.03 em, shadow 0.2 em #16131099, y 0.787
    id: "pack_stamp_hoist", name: "Orange Stamp", description: "Condensed caps rise in; the key word is stamped above them in dark caps on a tilted orange plate", layout: "pack-stamp-hoist",
    defaults: {
      fontId: "Barlow Semi Condensed", fontWeight: 700, fontSize: 67, casing: "upper", letterSpacing: 2, lineHeight: 1.08, maxWidth: 0.4, position: { x: 0.5, y: 0.787 },
      fill: solid("#F4EFE6"), shadows: [{ x: 0, y: 0, blur: 13, color: "rgba(22,19,16,0.6)" }, { x: 0, y: 0, blur: 3, color: "rgba(22,19,16,0.85)" }, { x: 0, y: 2, blur: 5, color: "rgba(22,19,16,0.6)" }],
      hero: { fontId: "Anton", fontWeight: 400, scale: 2.6, fill: solid("#16130F"), rotate: 0 },
      active: { effect: "none", color: "#FF6A13", scale: 1, boxRadius: 0 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: platesCaps({ hero: true }), heroDrawn: true, fonts: ["Barlow Semi Condensed", "Anton"], Page: StampHoistLayout,
  },
  {
    // VEED "Ticker": Jost 900 italic, line height 1.45, tracking -0.015 em, wrap 0.82 at x 0.47 y 0.68; plates #FF1F0F with a
    // #0A0A0A box 0.09 em down-right; key word 1.37x black on #E9FF00
    id: "pack_plate_ticker", name: "Red Plate Ticker", description: "Heavy italic caps on square red plates with a hard black offset; the key word pops in bigger on a yellow plate", layout: "pack-plate-ticker",
    defaults: {
      fontId: "Jost", fontWeight: 900, fontStyle: "italic", fontSize: 100, casing: "upper", letterSpacing: -1.5, lineHeight: 1.45, align: "left", maxWidth: 0.82, position: { x: 0.47, y: 0.68 },
      fill: solid("#FFFFFF"), shadows: [{ x: 9, y: 9, blur: 0, color: "#0A0A0A" }],
      hero: { scale: 1.37, fill: solid("#0A0A0A"), rotate: 0 },
      active: { effect: "none", color: "#E9FF00", scale: 1, boxRadius: 0 }, entrance: OWN_ENTRANCE, exit: NO_EXIT, templateOptions: { plate: "#FF1F0F" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: platesCaps({ hero: true, alignment: true }), heroDrawn: true, fonts: ["Jost"], Page: PlateTickerLayout,
  },
  {
    // VEED "Sticker": Baloo 2 800 #472B3F, size 0.062, line height 1.6, tracking 0.012 em, wrap 0.82, y 0.75; tiles #FFF4E1;
    // key word Fraunces italic 900 white, 1.2x, on #7C5FC9
    id: "pack_sand_tiles", name: "Sand Word Tiles", description: "Every word on its own rounded sand tile; the key word in white italic serif on a lavender tile", layout: "pack-sand-tiles",
    defaults: {
      fontId: "Baloo 2", fontWeight: 800, fontSize: 67, casing: "none", letterSpacing: 0.8, lineHeight: 1.6, maxWidth: 0.82, position: { x: 0.5, y: 0.75 },
      fill: solid("#472B3F"), shadows: [{ x: 0, y: 3, blur: 8, color: "rgba(40,22,36,0.3)" }],
      hero: { fontId: "Fraunces", fontWeight: 900, scale: 1.2, fill: solid("#FFFFFF"), rotate: 0 },
      active: { effect: "none", color: "#7C5FC9", scale: 1, boxRadius: 0 }, entrance: OWN_ENTRANCE, exit: NO_EXIT, templateOptions: { plate: "#FFF4E1" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: platesCaps({ hero: true }), heroDrawn: true, fonts: ["Baloo 2", "Fraunces"], Page: SandTilesLayout,
  },
  {
    // VEED "Interrupt": IBM Plex Mono 600 #E6F1F7, size 0.0375, line height 1.75, tracking 0.08 em, wrap 0.8 at x 0.485 y 0.7;
    // key word Anton #0B0B0E 3x..6.3x on #FF2D00 (left) / #00E5FF (right) on alternate cards
    id: "pack_block_cutin", name: "Colour Block Cut-In", description: "Mono caps rise in; the key word cuts in on its own line, huge and dark on a colour block that opens sideways", layout: "pack-block-cutin",
    defaults: {
      fontId: "IBM Plex Mono", fontWeight: 600, fontSize: 40, casing: "upper", letterSpacing: 3.2, lineHeight: 1.75, maxWidth: 0.8, position: { x: 0.485, y: 0.7 },
      fill: solid("#E6F1F7"), shadows: [{ x: 0, y: 4.4, blur: 20, color: "rgba(11,11,14,0.52)" }, { x: 0, y: 2.2, blur: 4.4, color: "rgba(11,11,14,0.4)" }, { x: 0, y: 0, blur: 3, color: "rgba(11,11,14,0.85)" }],
      hero: { fontId: "Anton", fontWeight: 400, scale: 3, fill: solid("#0B0B0E"), rotate: 0 },
      active: { effect: "none", color: "#FF2D00", scale: 1, boxRadius: 0 }, entrance: OWN_ENTRANCE, exit: NO_EXIT, templateOptions: { altBlock: "#00E5FF" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: platesCaps({ hero: true }), heroDrawn: true, fonts: ["IBM Plex Mono", "Anton"], Page: BlockCutInLayout,
  },
  {
    // OpusClip "Blur switch": heavy geometric caps (L 56 px on the 720 design), white, spoken word #4FE3E8, drop shadow
    // black 93 % softness 6; 19.1 % from the bottom
    id: "pack_blur_whip", name: "Motion-Blur Whip", description: "The whole line whips in and out sideways with a motion blur; the spoken word turns cyan", layout: "pack-blur-whip",
    defaults: {
      fontId: "Montserrat", fontWeight: 800, fontSize: 84, casing: "upper", lineHeight: 1.2, position: { x: 0.5, y: 0.809 },
      fill: solid("#FFFFFF"), shadows: [{ x: 0, y: 0, blur: 9, color: "rgba(0,0,0,0.93)" }],
      active: { effect: "color", color: "#4FE3E8", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: platesCaps({ alignment: true, activeEffects: ["color", "none"] }), fonts: ["Montserrat"], Page: BlurWhipLayout,
  },
  {
    // OpusClip "Popline": extra-bold caps (Bernina Sans 800; Plus Jakarta Sans is the closest loadable face), white with a
    // (2, 2) blur 5 shadow on the 720 design; spoken word 1.3x over a #7C4DFF bar 20 px tall, radius 10, 5 px above the baseline
    id: "pack_fat_bar", name: "Fat Bar Pop", description: "The spoken word grows over a fat rounded purple bar that fades in under it", layout: "pack-fat-bar",
    defaults: {
      fontId: "Plus Jakarta Sans", fontWeight: 800, fontSize: 84, casing: "upper", lineHeight: 1.2, position: { x: 0.5, y: 0.809 },
      fill: solid("#FFFFFF"), shadows: [{ x: 3, y: 3, blur: 7.5, color: "rgba(0,0,0,0.85)" }, { x: 0, y: 0, blur: 16, color: "rgba(0,0,0,0.4)" }],
      active: { effect: "underline", color: "#7C4DFF", scale: 1.3, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: platesCaps({ alignment: true, activeEffects: ["underline", "none"] }), fonts: ["Plus Jakarta Sans"], Page: FatBarLayout,
  },
];

export const PLATES_LOOKS: LookSeed[] = [
  { id: "orange_stamp_hoist", name: "Orange Stamp Word", description: "Condensed caps rise in while the key word lands above them as a dark stamp on a tilted orange plate", category: "Trending", templateId: "pack_stamp_hoist",
    tags: ["Stamp", "Condensed caps", "Tilt"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "red_plate_ticker", name: "Red Plate Ticker", description: "Heavy italic caps on square red plates with a black offset; the key word pops in bigger on yellow", category: "Trending", templateId: "pack_plate_ticker",
    tags: ["Word plates", "Italic caps", "Pop"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "sand_word_tiles", name: "Sand Word Tiles", description: "Each word rises in on its own rounded sand tile; the key word is white italic serif on lavender", category: "Trending", templateId: "pack_sand_tiles",
    tags: ["Word tiles", "Rounded", "Italic serif"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "color_block_cutin", name: "Colour Block Cut-In", description: "Mono caps with the key word cutting in huge on a colour block, red on the left then cyan on the right", category: "Trending", templateId: "pack_block_cutin",
    tags: ["Big word", "Mono", "Alternating"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "motion_blur_whip", name: "Motion-Blur Whip", description: "Bold caps whip in and out sideways in a streak of motion blur, the spoken word in cyan", category: "Trending", templateId: "pack_blur_whip",
    tags: ["Motion blur", "Whip", "Caps"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "fat_bar_pop", name: "Fat Bar Pop", description: "Bold caps where the spoken word grows over a fat rounded purple bar", category: "Trending", templateId: "pack_fat_bar",
    tags: ["Underline bar", "Scale pop", "Caps"], style: {}, settings: { maxWordsPerCard: 3 } },
];
