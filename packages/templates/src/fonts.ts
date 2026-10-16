import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { fontStack, getFontEntry } from "./fontCatalog";

type GoogleFontModule = {
  getInfo?: () => { fonts: Record<string, Record<string, unknown>> };
  loadFont: (style?: string, options?: { weights?: string[]; subsets?: string[]; ignoreTooManyRequestsWarning?: boolean }) => {
    fontFamily: string;
    waitUntilDone: () => Promise<void>;
  };
};

/**
 * Explicit lazy loaders (bundlers need static import paths). Keyed by the family name used in styles.
 * Add new families here; anything missing falls back to the system stack without failing the render.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  Anton: () => import("@remotion/google-fonts/Anton"),
  "Alex Brush": () => import("@remotion/google-fonts/AlexBrush"),
  "Alfa Slab One": () => import("@remotion/google-fonts/AlfaSlabOne"),
  Allura: () => import("@remotion/google-fonts/Allura"),
  Arimo: () => import("@remotion/google-fonts/Arimo"),
  "Archivo Black": () => import("@remotion/google-fonts/ArchivoBlack"),
  "Baloo 2": () => import("@remotion/google-fonts/Baloo2"),
  Bangers: () => import("@remotion/google-fonts/Bangers"),
  "Barlow Semi Condensed": () => import("@remotion/google-fonts/BarlowSemiCondensed"),
  "Bebas Neue": () => import("@remotion/google-fonts/BebasNeue"),
  "Bodoni Moda": () => import("@remotion/google-fonts/BodoniModa"),
  Caveat: () => import("@remotion/google-fonts/Caveat"),
  Chewy: () => import("@remotion/google-fonts/Chewy"),
  Cinzel: () => import("@remotion/google-fonts/Cinzel"),
  "Comic Neue": () => import("@remotion/google-fonts/ComicNeue"),
  "Cormorant Garamond": () => import("@remotion/google-fonts/CormorantGaramond"),
  "Dancing Script": () => import("@remotion/google-fonts/DancingScript"),
  "DM Sans": () => import("@remotion/google-fonts/DMSans"),
  "DM Serif Display": () => import("@remotion/google-fonts/DMSerifDisplay"),
  Fraunces: () => import("@remotion/google-fonts/Fraunces"),
  "Fontdiner Swanky": () => import("@remotion/google-fonts/FontdinerSwanky"),
  Fredoka: () => import("@remotion/google-fonts/Fredoka"),
  Galindo: () => import("@remotion/google-fonts/Galindo"),
  "Great Vibes": () => import("@remotion/google-fonts/GreatVibes"),
  Inter: () => import("@remotion/google-fonts/Inter"),
  "IBM Plex Mono": () => import("@remotion/google-fonts/IBMPlexMono"),
  "Instrument Sans": () => import("@remotion/google-fonts/InstrumentSans"),
  "Instrument Serif": () => import("@remotion/google-fonts/InstrumentSerif"),
  "JetBrains Mono": () => import("@remotion/google-fonts/JetBrainsMono"),
  Jost: () => import("@remotion/google-fonts/Jost"),
  "Josefin Sans": () => import("@remotion/google-fonts/JosefinSans"),
  Kanit: () => import("@remotion/google-fonts/Kanit"),
  "Kaushan Script": () => import("@remotion/google-fonts/KaushanScript"),
  Lato: () => import("@remotion/google-fonts/Lato"),
  Lexend: () => import("@remotion/google-fonts/Lexend"),
  "Libre Baskerville": () => import("@remotion/google-fonts/LibreBaskerville"),
  "Lilita One": () => import("@remotion/google-fonts/LilitaOne"),
  "Luckiest Guy": () => import("@remotion/google-fonts/LuckiestGuy"),
  Manrope: () => import("@remotion/google-fonts/Manrope"),
  Merriweather: () => import("@remotion/google-fonts/Merriweather"),
  Montserrat: () => import("@remotion/google-fonts/Montserrat"),
  Mukta: () => import("@remotion/google-fonts/Mukta"),
  "Noto Color Emoji": () => import("@remotion/google-fonts/NotoColorEmoji"),
  Nunito: () => import("@remotion/google-fonts/Nunito"),
  Oswald: () => import("@remotion/google-fonts/Oswald"),
  Outfit: () => import("@remotion/google-fonts/Outfit"),
  Pacifico: () => import("@remotion/google-fonts/Pacifico"),
  "Passero One": () => import("@remotion/google-fonts/PasseroOne"),
  "Passion One": () => import("@remotion/google-fonts/PassionOne"),
  "Permanent Marker": () => import("@remotion/google-fonts/PermanentMarker"),
  "Playfair Display": () => import("@remotion/google-fonts/PlayfairDisplay"),
  "Plus Jakarta Sans": () => import("@remotion/google-fonts/PlusJakartaSans"),
  Poppins: () => import("@remotion/google-fonts/Poppins"),
  Righteous: () => import("@remotion/google-fonts/Righteous"),
  "Roboto Condensed": () => import("@remotion/google-fonts/RobotoCondensed"),
  Roboto: () => import("@remotion/google-fonts/Roboto"),
  "Rubik Microbe": () => import("@remotion/google-fonts/RubikMicrobe"),
  "Rubik Mono One": () => import("@remotion/google-fonts/RubikMonoOne"),
  "Russo One": () => import("@remotion/google-fonts/RussoOne"),
  Satisfy: () => import("@remotion/google-fonts/Satisfy"),
  Sora: () => import("@remotion/google-fonts/Sora"),
  "Space Mono": () => import("@remotion/google-fonts/SpaceMono"),
  // premium looks, part B
  "Big Shoulders": () => import("@remotion/google-fonts/BigShoulders"),
  "Inter Tight": () => import("@remotion/google-fonts/InterTight"),
  "Space Grotesk": () => import("@remotion/google-fonts/SpaceGrotesk"),
  Unbounded: () => import("@remotion/google-fonts/Unbounded"),
  "Tilt Neon": () => import("@remotion/google-fonts/TiltNeon"),
  VT323: () => import("@remotion/google-fonts/VT323"),
};

/** families whose looks set words in true italics (not the browser's slanted fake) */
const ITALIC_FAMILIES = new Set(["Instrument Serif", "Playfair Display", "Cormorant Garamond", "Bodoni Moda", "Merriweather", "Kanit", "Josefin Sans", "Montserrat", "Lato", "Fraunces", "Jost"]);

export const KNOWN_FONTS = Object.keys(LOADERS).filter((f) => f !== "Noto Color Emoji");
export const EMOJI_FONT = "Noto Color Emoji";

const started = new Map<string, Promise<void>>();

const WANT = [400, 500, 600, 700, 800, 900];
const CAPTION_WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];

/** Weights to fetch: the caption range the family offers, else whatever it has (display faces are often 400 only). */
function pickWeights(available: number[]): number[] {
  const hit = available.filter((w) => WANT.includes(w));
  return hit.length ? hit : available.slice(0, 3);
}

const hasDom = () => typeof document !== "undefined" && "fonts" in document && typeof FontFace !== "undefined";

/**
 * Google family from the CSS API (the browser gets woff2 for its own engine). Latin faces load now; other scripts
 * are registered and fetched by the browser only when a caption actually uses them.
 */
async function loadGoogleCss(family: string, weights: number[], alias = family, text?: string): Promise<void> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}${text ? "" : `:wght@${weights.join(";")}`}&display=block${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font css ${family}: ${res.status}`);
  const css = await res.text();
  const latin: Promise<FontFace>[] = [];
  for (const m of css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*{([^}]*)}/g)) {
    const subset = m[1] ?? "latin";
    const body = m[2]!;
    const src = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
    if (!src) continue;
    const weight = /font-weight:\s*([\d ]+);/.exec(body)?.[1]?.trim() ?? "400";
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    const face = new FontFace(alias, `url(${src})`, { weight, style: "normal", ...(range ? { unicodeRange: range } : {}) });
    document.fonts.add(face);
    if (subset === "latin" || subset === "latin-ext" || text) latin.push(face.load());
  }
  await Promise.all(latin);
}

async function loadHosted(family: string, id: string, weights: number[]): Promise<void> {
  await Promise.all(
    weights.map(async (w) => {
      const face = new FontFace(family, `url(https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${w}-normal.woff2)`, { weight: String(w), style: "normal" });
      document.fonts.add(face);
      await face.load();
    }),
  );
}

export function loadFontFamily(family: string): Promise<void> {
  const existing = started.get(family);
  if (existing) return existing;
  const loader = LOADERS[family];
  const entry = getFontEntry(family);
  const p = (async () => {
    if (loader) {
      const mod = (await loader()) as GoogleFontModule;
      // every caption weight the family really offers (300 thin to 900 black); asking for a missing one throws
      const info = mod.getInfo?.().fonts;
      const weightsOf = (style: string) => {
        const have = Object.keys(info?.[style] ?? {});
        return have.length ? CAPTION_WEIGHTS.filter((w) => have.includes(w)) : CAPTION_WEIGHTS;
      };
      const load = async (style: "normal" | "italic") => {
        try {
          await mod.loadFont(style, { weights: weightsOf(style), subsets: ["latin"], ignoreTooManyRequestsWarning: true }).waitUntilDone();
        } catch {
          // requested weights not offered by this family: load its defaults
          await mod.loadFont(style, { subsets: ["latin"], ignoreTooManyRequestsWarning: true }).waitUntilDone();
        }
      };
      await load("normal");
      if (ITALIC_FAMILIES.has(family) && info?.italic) await load("italic");
      return;
    }
    if (!entry || !hasDom()) return; // a font from this device (or unknown): the system draws it or falls back
    if (entry.source === "device") return loadFontFamily(entry.fallback!);
    if (entry.source === "hosted") return loadHosted(family, entry.fontsourceId!, pickWeights(entry.weights));
    return loadGoogleCss(family, pickWeights(entry.weights));
  })().catch(() => {
    started.delete(family); // allow a retry on the next mount
  });
  started.set(family, p);
  return p;
}

const previews = new Map<string, Promise<string>>();

/**
 * CSS family that draws `family`'s own name in the font picker without downloading the whole font: Google gives
 * a few-KB subset holding only those letters. Device fonts preview as themselves when installed, else as their
 * fallback; hosted fonts are small, so they load fully.
 */
export function loadFontPreview(family: string): Promise<string> {
  const hit = previews.get(family);
  if (hit) return hit;
  const entry = getFontEntry(family);
  const p = (async () => {
    if (!hasDom()) return fontStack(family);
    if (started.has(family) || !entry || entry.source === "hosted") {
      await loadFontFamily(family);
      return fontStack(family);
    }
    if (entry.source === "device") {
      if (deviceHasFont(family)) return fontStack(family);
      await loadFontFamily(entry.fallback!); // what will really show, so preview it whole
      return fontStack(family);
    }
    const alias = `ce-preview ${family}`;
    await loadGoogleCss(family, [], alias, [...new Set(family)].join(""));
    return `'${alias}', system-ui, sans-serif`;
  })().catch(() => fontStack(family));
  previews.set(family, p);
  return p;
}

const deviceCache = new Map<string, boolean>();

/** Whether a device font (any of its local names) is installed, by comparing glyph widths with generic fallbacks. */
export function deviceHasFont(family: string): boolean {
  const entry = getFontEntry(family);
  const names = entry?.source === "device" ? entry.local! : [family];
  const key = names.join("|");
  const cached = deviceCache.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return false;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return false;
  const sample = "mmmmmmmmmmlli WQ@#0123 AaBbGgRr";
  const width = (font: string) => {
    ctx.font = font;
    return ctx.measureText(sample).width;
  };
  // Windows quietly maps Helvetica/Times/Courier to Arial/Times New Roman/Courier New: that isn't the real font
  const SUBSTITUTES = ["Arial", "Times New Roman", "Courier New"];
  const found = names.some(
    (n) =>
      ["monospace", "serif", "sans-serif"].some((g) => width(`72px '${n}', ${g}`) !== width(`72px ${g}`)) &&
      (SUBSTITUTES.includes(n) || SUBSTITUTES.every((sub) => width(`72px '${n}', monospace`) !== width(`72px '${sub}', monospace`))),
  );
  deviceCache.set(key, found);
  return found;
}

/**
 * Blocks rendering until every family is loaded. Call ONCE near the composition root so frames are
 * never captured with fallback glyphs, and measurement runs on real metrics.
 */
export function useFontsReady(families: string[]): boolean {
  const key = [...new Set(families.filter(Boolean))].sort().join("|");
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Loading caption fonts", { timeoutInMilliseconds: 60000 }));

  useEffect(() => {
    let alive = true;
    Promise.all(key.split("|").filter(Boolean).map(loadFontFamily))
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => cancelRender(e));
    return () => {
      alive = false;
    };
  }, [key]);

  // release the frame only AFTER React has committed the caption pages that depend on `ready`. Continuing in the
  // same tick as setReady let renderers (notably the in-browser one) capture early frames with no captions.
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);

  return ready;
}
