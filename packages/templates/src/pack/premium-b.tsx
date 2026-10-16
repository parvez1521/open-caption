/**
 * Pack: premium motion looks (After Effects-grade type animation), part B. Wired in through ./index.ts.
 * Five looks built the way a motion designer would build them in AE: per-character 3D with a real camera and light,
 * a slice-and-RGB glitch on a 30 fps glitch clock, layered chrome with a moving specular, a log-space zoom with AE
 * Echo trails, and a virtual camera over a typographic lockup. Motion kit and exporter notes: ./premium-b-kit.tsx.
 */
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { KineticCameraLayout, SERIF_FONT } from "./premium-b-camera";
import { ChromeSweepLayout, SILVER } from "./premium-b-chrome";
import { EchoZoomLayout } from "./premium-b-echo";
import { FlipTypeLayout } from "./premium-b-flip";
import { GlitchSliceLayout } from "./premium-b-glitch";
import { NO_EXIT, OWN_ENTRANCE, premiumCaps } from "./premium-b-kit";

const solid = (color: string) => ({ type: "solid" as const, color });
/** a soft dark contact shadow plus a tight one: reads on black and on a bright frame */
const READ = [{ x: 0, y: 0, blur: 40, color: "rgba(0,0,0,0.38)" }, { x: 0, y: 4, blur: 16, color: "rgba(0,0,0,0.5)" }, { x: 0, y: 2, blur: 4, color: "rgba(0,0,0,0.6)" }];

export const PREMIUM_B_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_flip_3d", name: "3D Drum Flip", description: "Letters roll up out of depth on a 3D drum, lit by a key light, and settle with a soft overshoot; the spoken word pops forward", layout: "pack-flip-3d",
    defaults: {
      fontId: "Big Shoulders", fontWeight: 900, fontSize: 124, casing: "upper", letterSpacing: 1, lineHeight: 0.98, position: { x: 0.5, y: 0.7 },
      fill: solid("#F6F3EC"), shadows: READ, active: { effect: "none", color: "#FFB23F", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps(), fonts: ["Big Shoulders"], Page: FlipTypeLayout,
  },
  {
    id: "pack_glitch_slice", name: "Signal Tear", description: "Words tear in as sliced, RGB-split frames and snap clean; the key word re-tears when it is spoken", layout: "pack-glitch-slice",
    defaults: {
      fontId: "Space Grotesk", fontWeight: 700, fontSize: 100, casing: "upper", letterSpacing: -1, lineHeight: 1.04, position: { x: 0.5, y: 0.7 },
      fill: solid("#FFFFFF"), shadows: READ,
      active: { effect: "none", color: "#C8FF3C", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps(), fonts: ["Space Grotesk"], Page: GlitchSliceLayout,
  },
  {
    id: "pack_chrome_sweep", name: "Liquid Chrome", description: "Bevelled chrome caps land with weight while a specular band sweeps across them; the key word is gold and catches the light again when spoken", layout: "pack-chrome-sweep",
    defaults: {
      fontId: "Unbounded", fontWeight: 800, fontSize: 88, casing: "upper", letterSpacing: -1, lineHeight: 1.14, position: { x: 0.5, y: 0.7 },
      fill: SILVER, stroke: { enabled: true, width: 4, color: "#0A0E14" },
      shadows: [{ x: 0, y: 2, blur: 0, color: "#2E3846" }, { x: 0, y: 4, blur: 0, color: "#1F2731" }, { x: 0, y: 6, blur: 0, color: "#131920" }, { x: 0, y: 12, blur: 24, color: "rgba(0,0,0,0.6)" }],
      active: { effect: "none", color: "#F2C25B", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps(), fonts: ["Unbounded"], Page: ChromeSweepLayout,
  },
  {
    id: "pack_echo_zoom", name: "Afterimage Zoom", description: "Words are thrown in from the camera, trailing tinted echoes that collapse into them; cards zoom out through the lens", layout: "pack-echo-zoom",
    defaults: {
      fontId: "Inter Tight", fontWeight: 900, fontSize: 102, casing: "upper", letterSpacing: -2, lineHeight: 1.02, position: { x: 0.5, y: 0.7 },
      fill: solid("#FFFFFF"), shadows: READ, active: { effect: "none", color: "#5AA8FF", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps(), fonts: ["Inter Tight"], Page: EchoZoomLayout,
  },
  {
    id: "pack_kinetic_camera", name: "Kinetic Camera", description: "A typographic lockup (huge key word, tracked kicker, italic serif) with a virtual camera that whips in and focuses each word as it is spoken", layout: "pack-kinetic-camera",
    defaults: {
      fontId: "Inter Tight", fontWeight: 800, fontSize: 70, casing: "none", letterSpacing: 0, lineHeight: 1.1, position: { x: 0.5, y: 0.72 },
      fill: solid("#FFFFFF"), shadows: READ,
      hero: { scale: 2.1, fontWeight: 900, rotate: 0 }, active: { effect: "none", color: "#FF6A2B", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps({ weight: false }), heroDrawn: true, fixedWordsPerCard: 3, fonts: ["Inter Tight", SERIF_FONT], Page: KineticCameraLayout,
  },
];

export const PREMIUM_B_LOOKS: LookSeed[] = [
  { id: "flip_3d_type", name: "3D Drum Flip", description: "Letters roll up out of depth on a lit 3D drum, settle with a soft overshoot, and the spoken word pops forward", category: "Premium", templateId: "pack_flip_3d",
    tags: ["3D flip", "Letter cascade", "Caps"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "glitch_slice", name: "Signal Tear", description: "Words tear in as sliced, RGB-split frames, snap clean, and the key word re-tears when spoken", category: "Premium", templateId: "pack_glitch_slice",
    tags: ["Glitch", "RGB split", "Caps"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "chrome_sweep", name: "Liquid Chrome", description: "Bevelled chrome caps with a specular sweep and a gold key word that catches the light when spoken", category: "Premium", templateId: "pack_chrome_sweep",
    tags: ["Chrome", "Light sweep", "Wide caps"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "echo_zoom", name: "Afterimage Zoom", description: "Words fly in from the camera trailing tinted echoes that collapse into them, then zoom out through the lens", category: "Premium", templateId: "pack_echo_zoom",
    tags: ["Echo trails", "Zoom", "Caps"], style: {}, settings: { maxWordsPerCard: 3 } },
  { id: "kinetic_camera", name: "Kinetic Camera", description: "A kinetic type lockup with a virtual camera that whips in and focuses each word as it is spoken", category: "Premium", templateId: "pack_kinetic_camera",
    tags: ["Camera moves", "Big word", "Serif mix"], style: {}, settings: { maxWordsPerCard: 3 } },
];
