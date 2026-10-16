import type { CaptionStyleV2, ProjectSettings } from "@capseasy/shared";

export interface LookSeed {
  id: string;
  name: string;
  description: string;
  category: string;
  templateId: string;
  /** partial style; completed with the template's defaults by the registry */
  style: Partial<CaptionStyleV2>;
  settings: Partial<ProjectSettings>;
  /** gallery traits ("Caps", "Box highlight"); pack looks carry their own */
  tags?: string[];
}

const outline = (width: number, color = "#000000") => ({ enabled: true, width, color });
const hardShadow = (y: number, color = "#000000") => [{ x: 0, y, blur: 0, color }];
const soft = [{ x: 0, y: 4, blur: 10, color: "rgba(0,0,0,0.55)" }];

/** 32 new looks across the new layouts. */
export const NEW_LOOKS: LookSeed[] = [
  // ---------- Viral: lit from within (layered glow inside and around the letters)
  { id: "soft_glow", name: "Soft Glow", description: "Rounded lowercase words rising out of a blur with a soft white bloom", category: "Viral", templateId: "glow_flow",
    style: { fontId: "Nunito", fontWeight: 700, fontSize: 66, casing: "lower" }, settings: { maxWordsPerCard: 4 } },
  { id: "neon_duo", name: "Neon Caps + Script", description: "Red neon caps lit from inside, with a white italic line laid over them", category: "Viral", templateId: "glow_duo",
    style: {}, settings: { maxWordsPerCard: 4 } },
  { id: "serif_behind", name: "Giant Serif Behind", description: "The key word burns huge in red serif behind the rest of the line", category: "Viral", templateId: "glow_behind",
    style: {}, settings: { maxWordsPerCard: 4 } },
  { id: "ice_duo", name: "Italic Over Ice Caps", description: "An italic serif word resting on glowing ice-blue caps", category: "Viral", templateId: "glow_duo",
    style: {
      fontId: "Montserrat", fontWeight: 900, fontSize: 104, casing: "upper", fill: { type: "solid", color: "#A8DDFF" }, glow: { enabled: true, color: "#3EA6FF", radius: 18, intensity: 0.95 },
      hero: { fontId: "Playfair Display", fontWeight: 700, scale: 0.74, fill: { type: "solid", color: "#FFFFFF" }, rotate: -3 },
      active: { effect: "glow", color: "#D6F1FF", scale: 1, boxRadius: 12 }, templateOptions: { duoOrder: "accent-first", depth: 0.38, overlap: 0.4, accentShadow: 0.75 },
    }, settings: { maxWordsPerCard: 4 } },
  { id: "serif_accent_glow", name: "Serif Accent Glow", description: "Clean bold words with the key word in italic serif, all in a soft halo of light", category: "Viral", templateId: "glow_flow",
    style: {
      fontId: "Manrope", fontWeight: 800, fontSize: 64, casing: "lower", glow: { enabled: true, color: "#FFFFFF", radius: 16, intensity: 0.6 },
      hero: { fontId: "Instrument Serif", fontWeight: 400, scale: 1.18, fill: { type: "solid", color: "#FFFFFF" }, rotate: 0 },
      templateOptions: { accentHero: true, halo: 1, depth: 0.1, glare: 0.3 },
    }, settings: { maxWordsPerCard: 4 } },

  { id: "metal_script", name: "Metal Slam + Script", description: "Brushed-metal caps slam in letter by letter with a crack of light, then the key word is written on in a green script", category: "Viral", templateId: "metal_script",
    style: {}, settings: { maxWordsPerCard: 3 } },

  // ---------- Viral
  { id: "hormozi_box", name: "Hormozi Box", description: "Montserrat caps with a green box that jumps word to word", category: "Viral", templateId: "boxed_word",
    style: { fontId: "Montserrat", fontWeight: 900, fontSize: 58, casing: "upper", stroke: outline(3), active: { effect: "box", color: "#000000", boxColor: "#22C55E", scale: 1.06, boxRadius: 14 } }, settings: { maxWordsPerCard: 3 } },
  { id: "beast_bounce", name: "Beast Bounce", description: "Chunky yellow words with a hard shadow and alternating tilt", category: "Viral", templateId: "word_by_word",
    style: { fontId: "Luckiest Guy", fontWeight: 400, fontSize: 70, casing: "upper", fill: { type: "solid", color: "#FFF200" }, stroke: outline(6), shadows: hardShadow(8), active: { effect: "scale-up", color: "#FFFFFF", scale: 1.12, boxRadius: 12 }, templateOptions: { tilt: 3 } }, settings: { maxWordsPerCard: 1 } },
  { id: "karaoke_fill", name: "Karaoke Fill", description: "Whole line on screen; words fill yellow as they're sung", category: "Viral", templateId: "karaoke",
    style: { fontId: "Poppins", fontWeight: 800, fontSize: 56, stroke: outline(3), active: { effect: "fill-sweep", color: "#FFD400", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 5 } },
  { id: "pop_clean", name: "Pop Clean", description: "Clean Poppins with a pink scale-up on the spoken word", category: "Viral", templateId: "sentence_highlight",
    style: { fontId: "Poppins", fontWeight: 800, fontSize: 56, stroke: outline(2.5), shadows: soft, active: { effect: "pop", color: "#FF3B6B", scale: 1.15, boxRadius: 12 }, entrance: { type: "rise", durationMs: 200, stagger: "none", easing: "outExpo" } }, settings: { maxWordsPerCard: 3 } },
  { id: "gradient_pop", name: "Gradient Pop", description: "One word at a time in a sunset gradient", category: "Viral", templateId: "word_by_word",
    style: { fontId: "Poppins", fontWeight: 900, fontSize: 72, casing: "upper", fill: { type: "gradient", stops: [{ color: "#FF8A00", at: 0 }, { color: "#FF2D95", at: 0.55 }, { color: "#7A5CFF", at: 1 }], angle: 120 }, stroke: outline(0), shadows: soft, active: { effect: "scale-up", color: "#FFFFFF", scale: 1.1, boxRadius: 12 } }, settings: { maxWordsPerCard: 1 } },
  { id: "emoji_react", name: "Emoji React", description: "Rounded bold text with emoji popping above key words", category: "Viral", templateId: "sentence_highlight",
    style: { fontId: "Nunito", fontWeight: 900, fontSize: 56, stroke: outline(3), active: { effect: "pop", color: "#FFC700", scale: 1.12, boxRadius: 12 }, emoji: { enabled: true, size: 1.1, animation: "pop" } }, settings: { maxWordsPerCard: 3 } },
  { id: "outline_fill", name: "Outline Fill", description: "Hollow outlined words that fill in as they're spoken", category: "Viral", templateId: "sentence_highlight",
    style: { fontId: "Archivo Black", fontWeight: 400, fontSize: 60, casing: "upper", templateOptions: { reveal: "all" }, fill: { type: "solid", color: "transparent" }, stroke: outline(3, "#FFFFFF"), active: { effect: "outline-fill", color: "#FFFFFF", scale: 1.04, boxRadius: 12 } }, settings: { maxWordsPerCard: 3 } },
  { id: "bold_pill", name: "Bold Pill", description: "White words on a dark pill, spoken word in lime", category: "Viral", templateId: "boxed_word",
    style: { fontId: "Montserrat", fontWeight: 800, fontSize: 50, casing: "none", background: { type: "pill", color: "#2A2A35", opacity: 0.92, padding: 16, radius: 100, blur: 0 }, active: { effect: "color", color: "#B6FF3B", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 4 } },

  // ---------- Fun
  { id: "comic_burst", name: "Comic Burst", description: "Comic-book Bangers with a red drop shadow and a big tilt", category: "Fun", templateId: "word_by_word",
    style: { fontId: "Bangers", fontWeight: 400, fontSize: 80, casing: "upper", fill: { type: "solid", color: "#FFE600" }, stroke: outline(5), shadows: hardShadow(7, "#E11D48"), active: { effect: "scale-up", color: "#FFFFFF", scale: 1.15, boxRadius: 12 }, templateOptions: { tilt: 6 } }, settings: { maxWordsPerCard: 1 } },
  { id: "wave_bounce", name: "Wave", description: "Playful Fredoka; the spoken word hops", category: "Fun", templateId: "sentence_highlight",
    style: { fontId: "Fredoka", fontWeight: 700, fontSize: 56, stroke: outline(3), active: { effect: "bounce", color: "#7CFFB2", scale: 1.1, boxRadius: 12 } }, settings: { maxWordsPerCard: 4 } },
  { id: "storytime", name: "Storytime", description: "Soft rounded words with a pastel box on the spoken word", category: "Fun", templateId: "boxed_word",
    style: { fontId: "Nunito", fontWeight: 800, fontSize: 52, casing: "none", fill: { type: "solid", color: "#FFFFFF" }, stroke: outline(2, "#3B2F5C"), active: { effect: "box", color: "#3B2F5C", boxColor: "#FFC8DD", scale: 1.04, boxRadius: 18 } }, settings: { maxWordsPerCard: 4 } },
  { id: "chat_bubble", name: "Chat Bubble", description: "iMessage-style blue bubbles", category: "Fun", templateId: "chat_bubble",
    style: {}, settings: { maxWordsPerCard: 7 } },
  { id: "chat_bubble_green", name: "WhatsApp Bubble", description: "Green chat bubbles with dark text", category: "Fun", templateId: "chat_bubble",
    style: { fill: { type: "solid", color: "#0B141A" }, active: { effect: "color", color: "#0B141A", scale: 1, boxRadius: 12 }, background: { type: "bubble", color: "#D9FDD3", opacity: 1, padding: 22, radius: 26, blur: 0 } }, settings: { maxWordsPerCard: 7 } },
  { id: "scribble", name: "Scribble", description: "Hand-written marker words with a yellow highlight", category: "Fun", templateId: "highlighter",
    style: { fontId: "Permanent Marker", fontWeight: 400, fontSize: 56, background: { type: "none", color: "#000000", opacity: 0, padding: 12, radius: 12, blur: 0 }, fill: { type: "solid", color: "#FFFFFF" }, stroke: outline(3), inactiveOpacity: 0.5, active: { effect: "marker", color: "#F59E0B", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 4 } },

  // ---------- Clean
  { id: "minimal_pro", name: "Minimal Pro", description: "Calm Inter; upcoming words dimmed, soft blur pill", category: "Clean", templateId: "sentence_highlight",
    style: { fontId: "Inter", fontWeight: 600, fontSize: 48, templateOptions: { reveal: "all" }, inactiveOpacity: 0.45, active: { effect: "scale-up", color: "#FFFFFF", scale: 1.04, boxRadius: 12 }, background: { type: "pill", color: "#FFFFFF", opacity: 0.16, padding: 16, radius: 100, blur: 14 }, entrance: { type: "fade", durationMs: 160, stagger: "none", easing: "outCubic" } }, settings: { maxWordsPerCard: 6 } },
  { id: "netflix_sub", name: "Subtitle", description: "Film-style white subtitles with a soft shadow, no motion", category: "Clean", templateId: "subtitle_bar",
    style: { fontId: "Inter", fontWeight: 500, fontSize: 42, shadows: [{ x: 0, y: 2, blur: 6, color: "rgba(0,0,0,0.9)" }], background: { type: "bar", color: "#000000", opacity: 0, padding: 12, radius: 0, blur: 0 }, entrance: { type: "none", durationMs: 0, stagger: "none", easing: "linear" } }, settings: { maxWordsPerCard: 12, maxLines: 2, maxCharsPerLine: 42 } },
  { id: "lower_third", name: "Broadcast", description: "News-style lower third with an accent strip", category: "Clean", templateId: "subtitle_bar",
    style: { fontId: "Roboto Condensed", fontWeight: 700, fontSize: 44, align: "left", maxWidth: 0.82, position: { x: 0.5, y: 0.82 }, active: { effect: "color", color: "#38BDF8", scale: 1, boxRadius: 12 }, background: { type: "bar", color: "#0B1B3A", opacity: 0.88, padding: 18, radius: 6, blur: 0 }, templateOptions: { accentStrip: true }, entrance: { type: "slide-left", durationMs: 260, stagger: "none", easing: "outExpo" } }, settings: { maxWordsPerCard: 8, maxLines: 2 } },
  { id: "read_along", name: "Read Along", description: "Full line visible; words light up white as they're read", category: "Clean", templateId: "karaoke",
    style: { fontId: "Inter", fontWeight: 700, fontSize: 52, inactiveOpacity: 0.35, stroke: outline(0), shadows: soft, active: { effect: "fill-sweep", color: "#FFFFFF", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 6 } },

  // ---------- Podcast
  { id: "podcast_duo", name: "Podcast Duo", description: "Readable Manrope with a sky-blue spoken word", category: "Podcast", templateId: "sentence_highlight",
    style: { fontId: "Manrope", fontWeight: 800, fontSize: 48, templateOptions: { reveal: "all" }, inactiveOpacity: 0.7, stroke: outline(2), active: { effect: "color", color: "#38BDF8", scale: 1, boxRadius: 12 }, entrance: { type: "fade", durationMs: 140, stagger: "none", easing: "outCubic" } }, settings: { maxWordsPerCard: 7, maxLines: 2 } },

  // ---------- Luxury / Cinematic
  { id: "luxe_serif", name: "Luxe Serif", description: "Italic Cormorant revealed with a slow wipe", category: "Luxury", templateId: "sentence_clean",
    style: { fontId: "Cormorant Garamond", fontWeight: 600, fontStyle: "italic", fontSize: 58, fill: { type: "solid", color: "#F8F1E3" }, shadows: soft, entrance: { type: "mask-reveal", durationMs: 600, stagger: "none", easing: "inOutCubic" }, active: { effect: "none", color: "#E5C158", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 5 } },
  { id: "motivational", name: "Motivational", description: "Tall Bebas Neue with wide tracking, one word at a time", category: "Cinematic", templateId: "word_by_word",
    style: { fontId: "Bebas Neue", fontWeight: 400, fontSize: 90, letterSpacing: 6, casing: "upper", shadows: soft, active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 1 } },
  { id: "film_noir", name: "Noir", description: "Playfair on a dark band, blurs into focus", category: "Cinematic", templateId: "subtitle_bar",
    style: { fontId: "Playfair Display", fontWeight: 700, fontSize: 46, background: { type: "bar", color: "#2B2B2E", opacity: 0.88, padding: 16, radius: 0, blur: 0 }, maxWidth: 1, entrance: { type: "blur-in", durationMs: 350, stagger: "none", easing: "outCubic" } }, settings: { maxWordsPerCard: 8, maxLines: 2 } },
  { id: "kinetic_mix", name: "Kinetic", description: "Stacked words; the key word huge, tilted and yellow", category: "Cinematic", templateId: "kinetic",
    style: {}, settings: { maxWordsPerCard: 5 } },

  // ---------- Retro / Tech
  { id: "retro_vhs", name: "VHS", description: "Pixel VT323 with a red/cyan colour split", category: "Retro", templateId: "sentence_highlight",
    style: { fontId: "VT323", fontWeight: 400, fontSize: 64, casing: "upper", shadows: [{ x: -3, y: 0, blur: 0, color: "rgba(255,0,60,0.85)" }, { x: 3, y: 0, blur: 0, color: "rgba(0,229,255,0.85)" }], active: { effect: "color", color: "#FFF45C", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 4 } },
  { id: "retro_3d", name: "Retro 3D", description: "Pink Rubik Mono One with a stacked 3D extrusion", category: "Retro", templateId: "word_by_word",
    style: { fontId: "Rubik Mono One", fontWeight: 400, fontSize: 64, fill: { type: "solid", color: "#FF5CA8" }, shadows: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: i, y: i, blur: 0, color: i === 8 ? "#1A0B2E" : "#7A1E5A" })), active: { effect: "scale-up", color: "#FFE3F1", scale: 1.1, boxRadius: 12 } }, settings: { maxWordsPerCard: 1 } },
  { id: "neon_sign", name: "Neon", description: "Glowing Tilt Neon tubes in pink and cyan", category: "Retro", templateId: "sentence_highlight",
    style: { fontId: "Tilt Neon", fontWeight: 400, fontSize: 60, fill: { type: "solid", color: "#FFD6F5" }, glow: { enabled: true, color: "#FF2BD6", radius: 14, intensity: 1 }, active: { effect: "glow", color: "#00F0FF", scale: 1.05, boxRadius: 12 } }, settings: { maxWordsPerCard: 3 } },
  { id: "terminal", name: "Terminal", description: "Green monospace typed out with a blinking cursor", category: "Tech", templateId: "typewriter",
    style: { fontId: "JetBrains Mono", fontWeight: 700, fontSize: 48, fill: { type: "solid", color: "#00FF66" }, glow: { enabled: true, color: "#00FF66", radius: 8, intensity: 0.5 }, background: { type: "box", color: "#0E2C1B", opacity: 0.92, padding: 16, radius: 8, blur: 0 } }, settings: { maxWordsPerCard: 6 } },
  { id: "gaming_hud", name: "Gaming HUD", description: "Russo One caps with a violet box on the spoken word", category: "Tech", templateId: "boxed_word",
    style: { fontId: "Russo One", fontWeight: 400, fontSize: 54, casing: "upper", stroke: outline(3, "#0B0B1A"), active: { effect: "box", color: "#FFFFFF", boxColor: "#7C3AED", scale: 1.08, boxRadius: 6 } }, settings: { maxWordsPerCard: 3 } },

  // ---------- Education
  { id: "highlighter_card", name: "Highlighter", description: "Dark text on a white card with a yellow marker", category: "Education", templateId: "highlighter",
    style: {}, settings: { maxWordsPerCard: 5 } },
  { id: "explainer", name: "Explainer", description: "Lexend (built for readability) with an underline sweep", category: "Education", templateId: "sentence_highlight",
    style: { fontId: "Lexend", fontWeight: 800, fontSize: 52, stroke: outline(2.5), active: { effect: "underline", color: "#38BDF8", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 4 } },

  // ---------- Regional
  { id: "desi_bold", name: "Desi Bold", description: "Baloo body with a saffron Anton hero, Hinglish-friendly", category: "Regional", templateId: "staggered_3line",
    style: { fontId: "Baloo 2", fontWeight: 800, fontSize: 52, active: { effect: "color", color: "#FF9933", scale: 1.08, boxRadius: 12 }, hero: { fontId: "Anton", fontWeight: 900, scale: 1.6, rotate: 0 }, stroke: outline(2.5) }, settings: { maxWordsPerCard: 5 } },
  { id: "desi_clean", name: "Desi Clean", description: "Mukta (supports Devanagari) with an amber spoken word", category: "Regional", templateId: "sentence_highlight",
    style: { fontId: "Mukta", fontWeight: 700, fontSize: 54, stroke: outline(2.5), active: { effect: "color", color: "#FFB703", scale: 1, boxRadius: 12 } }, settings: { maxWordsPerCard: 4 } },
];
