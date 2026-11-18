import React from "react";
import { Img } from "remotion";
import type { OverlayFont, OverlayItem, OverlayShape } from "@capseasy/shared";
import { SocialOverlayView } from "./social";

/**
 * The app's own overlay shape set: 110 simple geometric SVGs drawn for Captionit (not copied from any
 * icon library). One definition serves the composition render (preview + MP4 export) and the studio's
 * Elements gallery, so what the gallery shows is exactly what renders. No blend modes anywhere: the
 * in-browser renderer ignores mix-blend-mode, which would make preview and export diverge.
 *
 * Colour: every shape carries a fixed default `color` (its primary paint) in OVERLAY_SHAPE_META,
 * so the Stickers panel shows each sticker in its own colours instead of one flat cream — the
 * "black-and-white" look the owner flagged. The `color` prop on OverlayShapeSvg still overrides
 * the primary (the OverlayEditor colour control keeps working); fixed secondary paints live in
 * OVERLAY_SHAPE_ACCENTS below and never change. `category` + `tags` drive the Stickers search.
 */
export type StickerCategory =
  | "arrows" | "stars" | "hearts" | "faces" | "celebration" | "social"
  | "shapes" | "nature" | "food" | "animals" | "sport" | "music";

export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: "arrows", label: "Arrows" },
  { id: "stars", label: "Stars" },
  { id: "hearts", label: "Hearts" },
  { id: "faces", label: "Faces" },
  { id: "celebration", label: "Celebration" },
  { id: "social", label: "Social & CTA" },
  { id: "shapes", label: "Shapes" },
  { id: "nature", label: "Nature" },
  { id: "food", label: "Food" },
  { id: "animals", label: "Animals" },
  { id: "sport", label: "Sport" },
  { id: "music", label: "Music" },
];

export const OVERLAY_SHAPE_META: { id: OverlayShape; label: string; color: string; category: StickerCategory; tags: readonly string[] }[] = [
  { id: "ring", label: "Ring", color: "#FFFFEB", category: "shapes", tags: ["ring", "circle", "outline", "highlight"] },
  { id: "circle", label: "Circle", color: "#FFA946", category: "shapes", tags: ["circle", "dot", "round"] },
  { id: "arrow", label: "Arrow", color: "#FFA946", category: "arrows", tags: ["arrow", "right", "point", "direction", "next"] },
  { id: "check", label: "Check", color: "#34D399", category: "shapes", tags: ["check", "tick", "done", "correct", "yes"] },
  { id: "star", label: "Star", color: "#FFC531", category: "stars", tags: ["star", "favourite", "rating", "sparkle"] },
  { id: "heart", label: "Heart", color: "#FF4D6D", category: "hearts", tags: ["heart", "love", "like", "favourite"] },
  { id: "rectangle", label: "Rectangle", color: "#FFFFEB", category: "shapes", tags: ["rectangle", "box", "frame"] },
  { id: "scribble-underline", label: "Scribble underline", color: "#FFA946", category: "shapes", tags: ["underline", "scribble", "emphasis", "highlight"] },
  { id: "triangle", label: "Triangle", color: "#FFFFEB", category: "shapes", tags: ["triangle", "play", "point"] },
  { id: "rounded-rectangle", label: "Rounded rectangle", color: "#34D399", category: "shapes", tags: ["rectangle", "rounded", "box", "card"] },
  { id: "ellipse", label: "Ellipse", color: "#FF8FB1", category: "shapes", tags: ["ellipse", "oval", "round"] },
  { id: "diamond", label: "Diamond", color: "#22D3EE", category: "shapes", tags: ["diamond", "gem", "rhombus"] },
  { id: "chevron", label: "Chevron", color: "#FFA946", category: "arrows", tags: ["chevron", "arrow", "right", "next"] },
  { id: "double-arrow", label: "Double arrow", color: "#FFA946", category: "arrows", tags: ["arrow", "double", "fast", "forward"] },
  { id: "speech-bubble", label: "Speech bubble", color: "#FFFFFF", category: "social", tags: ["chat", "comment", "talk", "message", "bubble"] },
  { id: "underline-bar", label: "Underline bar", color: "#FFA946", category: "shapes", tags: ["underline", "bar", "line", "emphasis"] },
  { id: "corner-brackets", label: "Corner brackets", color: "#FFFFEB", category: "shapes", tags: ["corners", "focus", "frame", "crop"] },
  { id: "progress-bar", label: "Progress bar", color: "#34D399", category: "shapes", tags: ["progress", "bar", "loading", "percent"] },
  { id: "plus", label: "Plus", color: "#34D399", category: "shapes", tags: ["plus", "add", "more", "cross"] },
  { id: "cross", label: "Cross", color: "#FF4D6D", category: "shapes", tags: ["cross", "close", "x", "remove", "no"] },
  { id: "badge", label: "Badge", color: "#FFC531", category: "stars", tags: ["badge", "seal", "award", "stamp"] },
  // Studio stickers batch (2026-11-18): house-drawn sticker art, same SVG family
  { id: "burst", label: "Burst", color: "#FFA946", category: "stars", tags: ["burst", "pop", "impact", "pow", "star"] },
  { id: "bolt", label: "Lightning bolt", color: "#FFC531", category: "nature", tags: ["bolt", "lightning", "energy", "fast", "power"] },
  { id: "crown", label: "Crown", color: "#FFC531", category: "celebration", tags: ["crown", "king", "queen", "royal", "winner"] },
  { id: "flame", label: "Flame", color: "#FF7A1A", category: "nature", tags: ["flame", "fire", "hot", "lit", "trending"] },
  { id: "thumbs-up", label: "Thumbs up", color: "#FFC531", category: "social", tags: ["thumbs up", "like", "good", "approve", "yes"] },
  { id: "curved-arrow", label: "Curved arrow", color: "#FFA946", category: "arrows", tags: ["arrow", "curved", "turn", "back", "return"] },
  { id: "sun", label: "Sun", color: "#FFC531", category: "nature", tags: ["sun", "sunny", "day", "bright", "summer"] },
  { id: "explosion", label: "Explosion", color: "#FF6B35", category: "stars", tags: ["explosion", "boom", "burst", "wow", "impact"] },
  { id: "ribbon", label: "Ribbon", color: "#FF4D6D", category: "celebration", tags: ["ribbon", "award", "prize", "banner"] },
  { id: "tag", label: "Tag", color: "#FFC531", category: "shapes", tags: ["tag", "label", "price", "sale"] },
  { id: "pin", label: "Pin", color: "#FF4D6D", category: "shapes", tags: ["pin", "location", "map", "place"] },
  { id: "target", label: "Target", color: "#FF3B30", category: "sport", tags: ["target", "goal", "aim", "bullseye", "focus"] },
  // Studio stickers expansion (2026-11-18): 17 more house-drawn stickers, same SVG family
  { id: "megaphone", label: "Megaphone", color: "#FF4D6D", category: "social", tags: ["megaphone", "announce", "shout", "promo", "loud"] },
  { id: "music-note", label: "Music note", color: "#FF4D6D", category: "music", tags: ["music", "note", "song", "sound", "tune"] },
  { id: "mic", label: "Microphone", color: "#3B82F6", category: "music", tags: ["microphone", "mic", "voice", "record", "podcast", "sing"] },
  { id: "camera", label: "Camera", color: "#4A90D9", category: "social", tags: ["camera", "photo", "picture", "shoot"] },
  { id: "play", label: "Play", color: "#34D399", category: "social", tags: ["play", "watch", "video", "start"] },
  { id: "rocket", label: "Rocket", color: "#FF4D6D", category: "celebration", tags: ["rocket", "launch", "growth", "space", "fast"] },
  { id: "trophy", label: "Trophy", color: "#FFC531", category: "celebration", tags: ["trophy", "winner", "champion", "award", "first"] },
  { id: "gift", label: "Gift", color: "#FF4D6D", category: "celebration", tags: ["gift", "present", "birthday", "giveaway", "surprise"] },
  { id: "bell", label: "Bell", color: "#FFC531", category: "social", tags: ["bell", "notify", "alert", "reminder", "subscribe"] },
  { id: "clock", label: "Clock", color: "#FFFFFF", category: "shapes", tags: ["clock", "time", "watch", "hour", "timer"] },
  { id: "gem", label: "Gem", color: "#22D3EE", category: "shapes", tags: ["gem", "diamond", "jewel", "premium", "crystal"] },
  { id: "puzzle", label: "Puzzle piece", color: "#34D399", category: "shapes", tags: ["puzzle", "piece", "fit", "game"] },
  { id: "coffee", label: "Coffee", color: "#F2A541", category: "food", tags: ["coffee", "cup", "drink", "cafe", "morning"] },
  { id: "umbrella", label: "Umbrella", color: "#FF4D6D", category: "nature", tags: ["umbrella", "rain", "weather", "protect"] },
  { id: "key", label: "Key", color: "#FFC531", category: "shapes", tags: ["key", "unlock", "access", "secret"] },
  { id: "lock", label: "Lock", color: "#3B82F6", category: "shapes", tags: ["lock", "secure", "private", "safe"] },
  { id: "thumbs-down", label: "Thumbs down", color: "#FF7A1A", category: "social", tags: ["thumbs down", "dislike", "no", "bad"] },
  // Studio stickers expansion 2 (2026-11-18): 60 more colourful house-drawn stickers
  { id: "arrow-up", label: "Arrow up", color: "#FFA946", category: "arrows", tags: ["arrow", "up", "rise", "growth", "top"] },
  { id: "arrow-down", label: "Arrow down", color: "#FFA946", category: "arrows", tags: ["arrow", "down", "fall", "drop", "bottom"] },
  { id: "arrow-left", label: "Arrow left", color: "#FFA946", category: "arrows", tags: ["arrow", "left", "back", "previous"] },
  { id: "arrow-turn", label: "U-turn arrow", color: "#FFA946", category: "arrows", tags: ["arrow", "turn", "return", "back", "u-turn"] },
  { id: "sparkle", label: "Sparkle", color: "#FFC531", category: "stars", tags: ["sparkle", "shine", "twinkle", "star", "clean"] },
  { id: "shooting-star", label: "Shooting star", color: "#FFC531", category: "stars", tags: ["shooting star", "wish", "meteor", "night", "star"] },
  { id: "star-outline", label: "Star outline", color: "#FFC531", category: "stars", tags: ["star", "outline", "favourite", "rate"] },
  { id: "heart-broken", label: "Broken heart", color: "#FF4D6D", category: "hearts", tags: ["heart", "broken", "sad", "breakup"] },
  { id: "heart-sparkle", label: "Sparkling heart", color: "#FF4D6D", category: "hearts", tags: ["heart", "sparkle", "love", "crush", "adore"] },
  { id: "heart-arrow", label: "Heart with arrow", color: "#FF4D6D", category: "hearts", tags: ["heart", "arrow", "cupid", "love", "valentine"] },
  { id: "heart-outline", label: "Heart outline", color: "#FF4D6D", category: "hearts", tags: ["heart", "outline", "love", "like"] },
  { id: "face-smile", label: "Smiling face", color: "#FFC531", category: "faces", tags: ["face", "smile", "happy", "emoji", "joy"] },
  { id: "face-laugh", label: "Laughing face", color: "#FFC531", category: "faces", tags: ["face", "laugh", "funny", "lol", "emoji", "happy"] },
  { id: "face-wink", label: "Winking face", color: "#FFC531", category: "faces", tags: ["face", "wink", "cheeky", "emoji", "playful"] },
  { id: "face-love", label: "Face with heart eyes", color: "#FFC531", category: "faces", tags: ["face", "love", "heart eyes", "adore", "emoji"] },
  { id: "face-cool", label: "Cool face", color: "#FFC531", category: "faces", tags: ["face", "cool", "sunglasses", "awesome", "emoji"] },
  { id: "face-surprise", label: "Surprised face", color: "#FFC531", category: "faces", tags: ["face", "surprised", "wow", "shock", "emoji"] },
  { id: "face-sad", label: "Sad face", color: "#FFC531", category: "faces", tags: ["face", "sad", "cry", "tear", "emoji", "unhappy"] },
  { id: "face-sleepy", label: "Sleepy face", color: "#FFC531", category: "faces", tags: ["face", "sleepy", "tired", "zzz", "emoji", "bored"] },
  { id: "party-popper", label: "Party popper", color: "#FF4D6D", category: "celebration", tags: ["party", "popper", "confetti", "celebrate", "birthday"] },
  { id: "balloon", label: "Balloon", color: "#FF4D6D", category: "celebration", tags: ["balloon", "party", "birthday", "celebrate", "float"] },
  { id: "fireworks", label: "Fireworks", color: "#FFC531", category: "celebration", tags: ["fireworks", "party", "celebrate", "festival", "new year"] },
  { id: "cake", label: "Birthday cake", color: "#FF7AA2", category: "celebration", tags: ["cake", "birthday", "party", "celebrate", "sweet"] },
  { id: "bunting", label: "Bunting flags", color: "#FF4D6D", category: "celebration", tags: ["bunting", "flags", "party", "festival", "decorate"] },
  { id: "party-hat", label: "Party hat", color: "#FFA946", category: "celebration", tags: ["party hat", "birthday", "celebrate", "fun"] },
  { id: "share-arrow", label: "Share", color: "#34D399", category: "social", tags: ["share", "send", "forward", "repost"] },
  { id: "link", label: "Link", color: "#34D399", category: "social", tags: ["link", "chain", "url", "connect", "bio"] },
  { id: "hashtag", label: "Hashtag", color: "#34D399", category: "social", tags: ["hashtag", "tag", "topic", "trend", "social"] },
  { id: "chat-heart", label: "Chat heart", color: "#34D399", category: "social", tags: ["chat", "heart", "love", "comment", "message"] },
  { id: "hand-pointer", label: "Pointer hand", color: "#FFFFFF", category: "social", tags: ["pointer", "click", "tap", "cursor", "hand", "here"] },
  { id: "check-badge", label: "Verified badge", color: "#34D399", category: "social", tags: ["verified", "check", "badge", "official", "trusted"] },
  { id: "hexagon", label: "Hexagon", color: "#22D3EE", category: "shapes", tags: ["hexagon", "shape", "geometry"] },
  { id: "pentagon", label: "Pentagon", color: "#FFA946", category: "shapes", tags: ["pentagon", "shape", "geometry"] },
  { id: "octagon", label: "Octagon", color: "#FF4D6D", category: "shapes", tags: ["octagon", "shape", "geometry", "stop"] },
  { id: "blob", label: "Blob", color: "#34D399", category: "shapes", tags: ["blob", "organic", "shape", "splat"] },
  { id: "squiggle", label: "Squiggle", color: "#FFA946", category: "shapes", tags: ["squiggle", "wavy", "line", "doodle", "scribble"] },
  { id: "leaf", label: "Leaf", color: "#34D399", category: "nature", tags: ["leaf", "plant", "green", "eco", "nature"] },
  { id: "flower", label: "Flower", color: "#FF7AA2", category: "nature", tags: ["flower", "bloom", "petal", "spring", "nature"] },
  { id: "tree", label: "Tree", color: "#34D399", category: "nature", tags: ["tree", "forest", "plant", "nature", "green"] },
  { id: "mountain", label: "Mountain", color: "#3B82F6", category: "nature", tags: ["mountain", "peak", "hike", "nature", "snow"] },
  { id: "rainbow", label: "Rainbow", color: "#FF4D6D", category: "nature", tags: ["rainbow", "colour", "pride", "sky", "weather"] },
  { id: "pizza", label: "Pizza slice", color: "#FFC531", category: "food", tags: ["pizza", "slice", "food", "cheese", "yum"] },
  { id: "burger", label: "Burger", color: "#F5B544", category: "food", tags: ["burger", "food", "fast food", "yum", "hungry"] },
  { id: "ice-cream", label: "Ice cream", color: "#FF8FB1", category: "food", tags: ["ice cream", "cone", "dessert", "sweet", "summer"] },
  { id: "donut", label: "Donut", color: "#F5B544", category: "food", tags: ["donut", "doughnut", "sweet", "dessert", "food"] },
  { id: "strawberry", label: "Strawberry", color: "#FF4D6D", category: "food", tags: ["strawberry", "berry", "fruit", "food", "sweet"] },
  { id: "cupcake", label: "Cupcake", color: "#FF7AA2", category: "food", tags: ["cupcake", "muffin", "dessert", "sweet", "birthday"] },
  { id: "cat-face", label: "Cat face", color: "#FFA946", category: "animals", tags: ["cat", "kitten", "pet", "animal", "face"] },
  { id: "dog-face", label: "Dog face", color: "#D9A066", category: "animals", tags: ["dog", "puppy", "pet", "animal", "face"] },
  { id: "bird", label: "Bird", color: "#7DD3FC", category: "animals", tags: ["bird", "fly", "animal", "tweet", "nature"] },
  { id: "fish", label: "Fish", color: "#FFA946", category: "animals", tags: ["fish", "sea", "ocean", "animal", "swim"] },
  { id: "butterfly", label: "Butterfly", color: "#FF7AA2", category: "animals", tags: ["butterfly", "insect", "wings", "nature", "pretty"] },
  { id: "paw-print", label: "Paw print", color: "#FFA946", category: "animals", tags: ["paw", "print", "pet", "dog", "cat", "animal"] },
  { id: "football", label: "Football", color: "#FFFFFF", category: "sport", tags: ["football", "soccer", "ball", "sport", "goal"] },
  { id: "basketball", label: "Basketball", color: "#FF7A1A", category: "sport", tags: ["basketball", "ball", "sport", "hoop"] },
  { id: "medal", label: "Medal", color: "#FFC531", category: "sport", tags: ["medal", "winner", "award", "first", "sport", "champion"] },
  { id: "dumbbell", label: "Dumbbell", color: "#3B82F6", category: "sport", tags: ["dumbbell", "gym", "workout", "fitness", "strength"] },
  { id: "headphones", label: "Headphones", color: "#3B82F6", category: "music", tags: ["headphones", "music", "listen", "audio", "beats"] },
  { id: "guitar", label: "Guitar", color: "#F2A541", category: "music", tags: ["guitar", "music", "play", "song", "band"] },
  { id: "music-double", label: "Double music note", color: "#FF4D6D", category: "music", tags: ["music", "notes", "song", "melody", "tune"] },
];

const STROKE = 7;

/**
 * Fixed secondary paints per shape: the accents that make a sticker genuinely
 * multi-colour. The `color` prop is always the primary paint (user-recolourable
 * in the OverlayEditor); accents are part of the artwork and never change, so
 * panel preview, in-browser preview and MP4 export all render the same sticker.
 * Shapes without an entry render single-colour, exactly as before.
 */
const OVERLAY_SHAPE_ACCENTS: Partial<Record<OverlayShape, readonly string[]>> = {
  "speech-bubble": ["#34D399", "#FFA946", "#FF4D6D"],
  crown: ["#FF4D6D"],
  flame: ["#FFC531"],
  sun: ["#FF7A1A"],
  target: ["#FFFFFF"],
  camera: ["#FFC531"],
  rocket: ["#7DD3FC"],
  gem: ["#FFFFFF"],
  gift: ["#FFC531"],
  sparkle: ["#34D399"],
  "shooting-star": ["#FFFFFF"],
  "heart-sparkle": ["#FFC531"],
  "heart-arrow": ["#FFC531"],
  fireworks: ["#FF4D6D", "#34D399", "#7DD3FC"],
  cake: ["#FFFFFF", "#FFC531"],
  bunting: ["#FFC531", "#34D399"],
  "party-hat": ["#FF4D6D", "#34D399"],
  "chat-heart": ["#FFFFFF"],
  "check-badge": ["#FFFFFF"],
  rainbow: ["#FFC531", "#34D399"],
  pizza: ["#FF4D6D"],
  burger: ["#34D399", "#8B5E34"],
  "ice-cream": ["#E8A85C", "#FF4D6D"],
  donut: ["#FF8FB1"],
  strawberry: ["#FFC531", "#34D399"],
  cupcake: ["#7DD3FC", "#FF4D6D"],
  "cat-face": ["#FF4D6D"],
  "dog-face": ["#8B5E34", "#FFFFFF"],
  bird: ["#3B82F6", "#FFA946"],
  fish: ["#FF7A1A"],
  butterfly: ["#FFC531"],
  "paw-print": ["#FF4D6D"],
  medal: ["#FF4D6D", "#34D399"],
  dumbbell: ["#94A3B8"],
  guitar: ["#8B5E34"],
  mountain: ["#FFFFFF", "#7DD3FC"],
  tree: ["#8B5E34"],
  flower: ["#FFC531"],
  leaf: ["#141412"],
  "face-love": ["#FF4D6D"],
  "face-sad": ["#7DD3FC"],
  "face-sleepy": ["#34D399"],
  "face-laugh": ["#FF4D6D"],
  "party-popper": ["#FFC531", "#34D399", "#7DD3FC"],
  balloon: ["#FFFFFF"],
};

/** One shape, drawn in a 100x100 box; `color` paints the primary (stroke and fill, currentColor-style). */
export const OverlayShapeSvg: React.FC<{ shape: OverlayShape; color: string; size: number }> = ({ shape, color, size }) => {
  const strokeProps = { stroke: color, strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  // Fixed secondary paints for this shape (empty = single-colour, as before); a0/a1/a2 fall
  // back to `color` so a shape without accents renders exactly like it always did.
  const acc = OVERLAY_SHAPE_ACCENTS[shape] ?? [];
  const a0 = acc[0] ?? color;
  const a1 = acc[1] ?? color;
  const a2 = acc[2] ?? color;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
      {shape === "ring" ? <ellipse cx={50} cy={50} rx={38} ry={29} {...strokeProps} /> : null}
      {shape === "circle" ? <circle cx={50} cy={50} r={31} fill={color} /> : null}
      {shape === "arrow" ? (
        <>
          <path d="M14 50 H78" {...strokeProps} />
          <path d="M60 31 L80 50 L60 69" {...strokeProps} />
        </>
      ) : null}
      {shape === "check" ? <path d="M21 53 L41 73 L79 28" {...strokeProps} /> : null}
      {shape === "star" ? (
        <polygon
          fill={color}
          points="50,10 61.8,38.2 91.2,39.1 67.9,57.3 76.4,85.9 50,69.5 23.6,85.9 32.1,57.3 8.8,39.1 38.2,38.2"
        />
      ) : null}
      {shape === "heart" ? (
        <path
          fill={color}
          d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z"
        />
      ) : null}
      {shape === "rectangle" ? <rect x={16} y={27} width={68} height={46} rx={3} {...strokeProps} /> : null}
      {shape === "scribble-underline" ? <path d="M7 66 Q 14 54, 22 66 T 38 66 T 54 66 T 70 66 T 86 66 T 97 66" {...strokeProps} strokeWidth={6} /> : null}
      {shape === "triangle" ? <polygon points="50,17 86,80 14,80" {...strokeProps} /> : null}
      {shape === "rounded-rectangle" ? <rect x={14} y={25} width={72} height={50} rx={14} fill={color} /> : null}
      {shape === "ellipse" ? <ellipse cx={50} cy={50} rx={40} ry={27} fill={color} /> : null}
      {shape === "diamond" ? <polygon points="50,10 88,50 50,90 12,50" fill={color} /> : null}
      {shape === "chevron" ? <path d="M32 18 L66 50 L32 82" {...strokeProps} strokeWidth={10} /> : null}
      {shape === "double-arrow" ? (
        <>
          <path d="M22 18 L52 50 L22 82" {...strokeProps} strokeWidth={9} />
          <path d="M50 18 L80 50 L50 82" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "speech-bubble" ? (
        <>
          <path d="M18 14 H82 A10 10 0 0 1 92 24 V62 A10 10 0 0 1 82 72 H56 L34 90 V72 H18 A10 10 0 0 1 8 62 V24 A10 10 0 0 1 18 14 Z" fill={color} />
          <circle cx={31} cy={43} r={5.5} fill={a0} />
          <circle cx={50} cy={43} r={5.5} fill={a1} />
          <circle cx={69} cy={43} r={5.5} fill={a2} />
        </>
      ) : null}
      {shape === "underline-bar" ? <rect x={8} y={44} width={84} height={12} rx={6} fill={color} /> : null}
      {shape === "corner-brackets" ? (
        <>
          <path d="M28 8 H12 A4 4 0 0 0 8 12 V28" {...strokeProps} strokeWidth={8} />
          <path d="M72 8 H88 A4 4 0 0 1 92 12 V28" {...strokeProps} strokeWidth={8} />
          <path d="M28 92 H12 A4 4 0 0 1 8 88 V72" {...strokeProps} strokeWidth={8} />
          <path d="M72 92 H88 A4 4 0 0 0 92 88 V72" {...strokeProps} strokeWidth={8} />
        </>
      ) : null}
      {shape === "progress-bar" ? (
        <>
          <rect x={8} y={40} width={84} height={20} rx={10} {...strokeProps} strokeWidth={5} />
          <rect x={14} y={46} width={52} height={8} rx={4} fill={color} />
        </>
      ) : null}
      {shape === "plus" ? <path d="M50 16 V84 M16 50 H84" {...strokeProps} strokeWidth={11} /> : null}
      {shape === "cross" ? <path d="M26 26 L74 74 M74 26 L26 74" {...strokeProps} strokeWidth={11} /> : null}
      {shape === "badge" ? (
        <polygon
          fill={color}
          points="50,4 58,14 70,9 74,21 87,20 87,33 97,38 91,49 97,60 87,65 87,78 74,77 70,89 58,84 50,94 42,84 30,89 26,77 13,78 13,65 3,60 9,49 3,38 13,33 13,20 26,21 30,9 42,14"
        />
      ) : null}
      {shape === "burst" ? (
        <polygon
          fill={color}
          points="96,50 75.1,56.7 89.8,73 68.4,68.4 73,89.8 56.7,75.1 50,96 43.3,75.1 27,89.8 31.6,68.4 10.2,73 24.9,56.7 4,50 24.9,43.3 10.2,27 31.6,31.6 27,10.2 43.3,24.9 50,4 56.7,24.9 73,10.2 68.4,31.6 89.8,27 75.1,43.3"
        />
      ) : null}
      {shape === "bolt" ? <polygon fill={color} points="56,6 24,54 44,54 40,94 76,44 54,44" /> : null}
      {shape === "crown" ? (
        <>
          <polygon fill={color} points="12,74 12,36 30,50 50,22 70,50 88,36 88,74" />
          <rect x={12} y={78} width={76} height={9} rx={2} fill={color} />
          <circle cx={30} cy={82.5} r={2.6} fill={a0} />
          <circle cx={50} cy={82.5} r={2.6} fill={a0} />
          <circle cx={70} cy={82.5} r={2.6} fill={a0} />
        </>
      ) : null}
      {shape === "flame" ? (
        <>
          <path
            fill={color}
            d="M50 8 C58 24 72 34 72 54 A22 22 0 1 1 28 54 C28 44 34 40 38 32 C42 38 44 40 46 40 C44 28 46 16 50 8 Z"
          />
          <path fill={a0} d="M50 38 C54 46 60 50 60 58 A10 10 0 1 1 40 58 C40 52 44 50 46 45 C47 48 49 48 50 38 Z" />
        </>
      ) : null}
      {shape === "thumbs-up" ? (
        <>
          <rect x={26} y={48} width={48} height={38} rx={10} fill={color} />
          <path fill={color} d="M34 50 L34 34 Q34 22 46 22 Q54 22 52 32 L48 48 Z" />
        </>
      ) : null}
      {shape === "curved-arrow" ? (
        <>
          <path d="M14 78 Q 30 22 74 30" {...strokeProps} strokeWidth={9} />
          <path d="M60 20 L78 30 L62 44" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "sun" ? (
        <>
          <circle cx={50} cy={50} r={20} fill={color} />
          <path d="M50 8 V20 M50 80 V92 M8 50 H20 M80 50 H92 M20 20 L29 29 M71 71 L80 80 M80 20 L71 29 M29 71 L20 80" stroke={a0} strokeWidth={7} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "explosion" ? (
        <polygon
          fill={color}
          points="94,50 77.7,61.5 81,81 61.5,77.7 50,94 38.5,77.7 19,81 22.3,61.5 6,50 22.3,38.5 19,19 38.5,22.3 50,6 61.5,22.3 81,19 77.7,38.5"
        />
      ) : null}
      {shape === "ribbon" ? <path fill={color} d="M12 24 H88 V56 L50 72 L12 56 Z" /> : null}
      {shape === "tag" ? (
        <>
          <path fill={color} d="M14 14 H56 L88 46 L46 88 L14 56 Z" />
          <circle cx={32} cy={32} r={7} fill="#141412" />
        </>
      ) : null}
      {shape === "pin" ? (
        <>
          <path fill={color} d="M50 6 A26 26 0 0 1 76 32 C76 52 50 92 50 92 C50 92 24 52 24 32 A26 26 0 0 1 50 6 Z" />
          <circle cx={50} cy={32} r={10} fill="#141412" />
        </>
      ) : null}
      {shape === "target" ? (
        <>
          <circle cx={50} cy={50} r={40} {...strokeProps} strokeWidth={8} />
          <circle cx={50} cy={50} r={24} stroke={a0} strokeWidth={8} fill="none" />
          <circle cx={50} cy={50} r={9} fill={color} />
        </>
      ) : null}
      {shape === "megaphone" ? (
        <>
          <polygon fill={color} points="18,40 70,22 70,78 18,60" />
          <rect x={26} y={60} width={13} height={26} rx={3} fill={color} />
          <path d="M80 36 Q88 50 80 64" {...strokeProps} strokeWidth={6} />
        </>
      ) : null}
      {shape === "music-note" ? (
        <>
          <rect x={58} y={12} width={8} height={60} fill={color} />
          <polygon fill={color} points="66,12 88,24 82,46 66,36" />
          <ellipse cx={47} cy={74} rx={15} ry={10} fill={color} transform="rotate(-18 47 74)" />
        </>
      ) : null}
      {shape === "mic" ? (
        <>
          <rect x={36} y={8} width={28} height={46} rx={14} fill={color} />
          <path d="M38 22 H62 M38 31 H62 M38 40 H62" stroke="#141412" strokeWidth={4} strokeLinecap="round" />
          <path d="M50 54 V72" {...strokeProps} />
          <path d="M34 80 H66" {...strokeProps} />
        </>
      ) : null}
      {shape === "camera" ? (
        <>
          <rect x={34} y={24} width={32} height={12} rx={3} fill={color} />
          <rect x={10} y={34} width={80} height={48} rx={8} fill={color} />
          <circle cx={50} cy={58} r={15} fill="#141412" />
          <circle cx={50} cy={58} r={6} fill={a0} />
        </>
      ) : null}
      {shape === "play" ? (
        <>
          <circle cx={50} cy={50} r={38} {...strokeProps} strokeWidth={8} />
          <polygon fill={color} points="41,30 73,50 41,70" />
        </>
      ) : null}
      {shape === "rocket" ? (
        <>
          <polygon fill={color} points="32,50 14,74 32,66" />
          <polygon fill={color} points="68,50 86,74 68,66" />
          <path fill={color} d="M50 6 C64 20 69 38 69 56 L31 56 C31 38 36 20 50 6 Z" />
          <circle cx={50} cy={38} r={8} fill={a0} />
          <polygon fill={color} points="41,56 50,80 59,56" />
        </>
      ) : null}
      {shape === "trophy" ? (
        <>
          <path d="M28 18 Q10 18 12 32 Q14 44 28 42" {...strokeProps} />
          <path d="M72 18 Q90 18 88 32 Q86 44 72 42" {...strokeProps} />
          <path fill={color} d="M28 12 H72 V40 Q72 58 50 58 Q28 58 28 40 Z" />
          <rect x={46} y={58} width={8} height={14} fill={color} />
          <rect x={34} y={72} width={32} height={10} rx={3} fill={color} />
        </>
      ) : null}
      {shape === "gift" ? (
        <>
          <ellipse cx={37} cy={23} rx={13} ry={8} fill={color} transform="rotate(-28 37 23)" />
          <ellipse cx={63} cy={23} rx={13} ry={8} fill={color} transform="rotate(28 63 23)" />
          <rect x={12} y={32} width={76} height={14} rx={4} fill={color} />
          <rect x={16} y={46} width={68} height={38} rx={4} fill={color} />
          <rect x={45} y={32} width={10} height={52} fill={a0} />
        </>
      ) : null}
      {shape === "bell" ? (
        <>
          <circle cx={50} cy={11} r={5} fill={color} />
          <path fill={color} d="M50 16 C66 22 78 36 78 54 V64 H22 V54 C22 36 34 22 50 16 Z" />
          <rect x={20} y={64} width={60} height={6} rx={3} fill={color} />
          <circle cx={50} cy={78} r={7} fill={color} />
        </>
      ) : null}
      {shape === "clock" ? (
        <>
          <circle cx={50} cy={50} r={38} {...strokeProps} strokeWidth={8} />
          <path d="M50 50 V28" {...strokeProps} strokeWidth={8} />
          <path d="M50 50 L68 61" {...strokeProps} strokeWidth={8} />
        </>
      ) : null}
      {shape === "gem" ? (
        <>
          <polygon fill={color} points="50,10 86,38 50,90 14,38" />
          <path d="M14 38 H86 M50 10 L36 38 L50 90 M50 10 L64 38 L50 90" stroke={a0} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.8} />
        </>
      ) : null}
      {shape === "puzzle" ? (
        <>
          <rect x={20} y={28} width={60} height={52} rx={6} fill={color} />
          <circle cx={50} cy={28} r={11} fill={color} />
          <circle cx={80} cy={54} r={11} fill={color} />
        </>
      ) : null}
      {shape === "coffee" ? (
        <>
          <path d="M38 26 Q34 20 38 14 M54 26 Q50 20 54 14" {...strokeProps} strokeWidth={5} />
          <path d="M72 44 Q90 44 90 56 Q90 68 72 68" {...strokeProps} />
          <path fill={color} d="M22 34 H72 V70 Q72 82 60 82 H34 Q22 82 22 70 Z" />
        </>
      ) : null}
      {shape === "umbrella" ? (
        <>
          <path fill={color} d="M8 52 A42 42 0 0 1 92 52 Q80 44 70 52 Q60 44 50 52 Q40 44 30 52 Q20 44 8 52 Z" />
          <path d="M50 52 V86 Q50 94 42 94 Q36 94 36 88" {...strokeProps} />
        </>
      ) : null}
      {shape === "key" ? (
        <>
          <circle cx={28} cy={32} r={15} {...strokeProps} strokeWidth={8} />
          <path d="M40 44 L84 88" {...strokeProps} strokeWidth={9} />
          <path d="M62 62 L72 52 M74 74 L84 64" {...strokeProps} />
        </>
      ) : null}
      {shape === "lock" ? (
        <>
          <path d="M32 44 V34 A18 18 0 0 1 68 34 V44" {...strokeProps} strokeWidth={8} />
          <rect x={20} y={44} width={60} height={40} rx={8} fill={color} />
          <circle cx={50} cy={60} r={6} fill="#141412" />
          <rect x={47} y={62} width={6} height={12} fill="#141412" />
        </>
      ) : null}
      {shape === "thumbs-down" ? (
        <>
          <rect x={26} y={14} width={48} height={38} rx={10} fill={color} />
          <path fill={color} d="M34 50 L34 66 Q34 78 46 78 Q54 78 52 68 L48 52 Z" />
        </>
      ) : null}
      {/* Studio stickers expansion 2 (2026-11-18): 60 more colourful house-drawn stickers */}
      {shape === "arrow-up" ? (
        <>
          <path d="M50 84 V20" {...strokeProps} strokeWidth={9} />
          <path d="M30 40 L50 18 L70 40" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "arrow-down" ? (
        <>
          <path d="M50 16 V80" {...strokeProps} strokeWidth={9} />
          <path d="M30 60 L50 82 L70 60" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "arrow-left" ? (
        <>
          <path d="M84 50 H20" {...strokeProps} strokeWidth={9} />
          <path d="M40 30 L18 50 L40 70" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "arrow-turn" ? (
        <>
          <path d="M78 22 V54 A24 24 0 0 1 54 78 H26" {...strokeProps} strokeWidth={9} />
          <path d="M40 64 L24 78 L40 92" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "sparkle" ? (
        <>
          <polygon fill={color} points="50,6 60,40 94,50 60,60 50,94 40,60 6,50 40,40" />
          <polygon fill={a0} points="78,10 81,20 91,23 81,26 78,36 75,26 65,23 75,20" />
        </>
      ) : null}
      {shape === "shooting-star" ? (
        <>
          <path d="M14 78 L58 34 M24 84 L64 44 M38 88 L70 56" stroke={a0} strokeWidth={5} strokeLinecap="round" />
          <polygon fill={color} points="74,8 79,24 95,28 80,36 75,52 69,36 53,32 68,25" />
        </>
      ) : null}
      {shape === "star-outline" ? (
        <polygon
          fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round"
          points="50,10 61.8,38.2 91.2,39.1 67.9,57.3 76.4,85.9 50,69.5 23.6,85.9 32.1,57.3 8.8,39.1 38.2,38.2"
        />
      ) : null}
      {shape === "heart-broken" ? (
        <>
          <path
            fill={color}
            d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z"
          />
          <path d="M50 22 L44 36 L54 46 L46 58 L52 72" stroke="#141412" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : null}
      {shape === "heart-sparkle" ? (
        <>
          <path
            fill={color}
            d="M46 86 C24 69 13 56 13 42 C13 30 21 22 32 22 C39 22 44 26 46 31 C48 26 53 22 60 22 C71 22 79 30 79 42 C79 56 68 69 46 86 Z"
          />
          <polygon fill={a0} points="82,8 85,17 94,20 85,23 82,32 79,23 70,20 79,17" />
        </>
      ) : null}
      {shape === "heart-arrow" ? (
        <>
          <path
            fill={color}
            d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z"
          />
          <path d="M10 82 L88 20" stroke={a0} strokeWidth={6} strokeLinecap="round" />
          <path d="M72 16 L90 18 L86 36" stroke={a0} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : null}
      {shape === "heart-outline" ? (
        <path
          fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round"
          d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z"
        />
      ) : null}
      {shape === "face-smile" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <circle cx={36} cy={42} r={4.5} fill="#141412" />
          <circle cx={64} cy={42} r={4.5} fill="#141412" />
          <path d="M34 58 Q50 72 66 58" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "face-laugh" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <path d="M28 40 Q36 32 44 40 M56 40 Q64 32 72 40" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
          <path fill="#141412" d="M32 56 Q50 52 68 56 Q66 74 50 74 Q34 74 32 56 Z" />
          <ellipse cx={50} cy={69} rx={8} ry={4.5} fill={a0} />
        </>
      ) : null}
      {shape === "face-wink" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <circle cx={36} cy={42} r={4.5} fill="#141412" />
          <path d="M56 42 Q64 36 72 42" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
          <path d="M34 58 Q50 72 66 58" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "face-love" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <path fill={a0} d="M36 46 C28 39 25 33 25 28 C25 23 29 20 33 20 C35 20 37 21 38 23 C39 21 41 20 43 20 C47 20 50 23 50 28 C50 33 47 39 36 46 Z" />
          <path fill={a0} d="M64 46 C56 39 53 33 53 28 C53 23 57 20 61 20 C63 20 65 21 66 23 C67 21 69 20 71 20 C75 20 78 23 78 28 C78 33 75 39 64 46 Z" />
          <path d="M36 60 Q50 72 64 60" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "face-cool" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <rect x={22} y={38} width={24} height={14} rx={5} fill="#141412" />
          <rect x={54} y={38} width={24} height={14} rx={5} fill="#141412" />
          <rect x={44} y={43} width={12} height={4} fill="#141412" />
          <path d="M36 62 Q50 72 64 62" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "face-surprise" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <circle cx={36} cy={40} r={6} fill="#141412" />
          <circle cx={64} cy={40} r={6} fill="#141412" />
          <path d="M28 28 Q36 24 44 28 M56 28 Q64 24 72 28" stroke="#141412" strokeWidth={4} strokeLinecap="round" fill="none" />
          <ellipse cx={50} cy={64} rx={8} ry={10} fill="#141412" />
        </>
      ) : null}
      {shape === "face-sad" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <circle cx={36} cy={42} r={4.5} fill="#141412" />
          <circle cx={64} cy={42} r={4.5} fill="#141412" />
          <path d="M36 66 Q50 54 64 66" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
          <path fill={a0} d="M74 54 C78 60 78 66 74 70 C70 66 70 60 74 54 Z" />
        </>
      ) : null}
      {shape === "face-sleepy" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <path d="M28 42 Q36 48 44 42 M56 42 Q64 48 72 42" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
          <path d="M40 62 Q50 68 60 62" stroke="#141412" strokeWidth={5} strokeLinecap="round" fill="none" />
          <path d="M76 14 L84 14 L76 22 L84 22" stroke={a0} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : null}
      {shape === "party-popper" ? (
        <>
          <polygon fill={a0} points="14,10 22,10 20,20 12,20" />
          <circle cx={34} cy={14} r={3.5} fill={a1} />
          <circle cx={66} cy={12} r={3.5} fill={a2} />
          <polygon fill={a1} points="78,8 86,8 84,18 76,18" />
          <circle cx={50} cy={8} r={3.5} fill={a0} />
          <polygon fill={color} points="26,34 74,34 50,90" />
          <path d="M38 52 L62 52 M43 66 L57 66" stroke="#141412" strokeWidth={4} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "balloon" ? (
        <>
          <path d="M50 76 C50 82 46 86 42 88" stroke="#141412" strokeWidth={4} strokeLinecap="round" fill="none" />
          <polygon fill={color} points="50,74 42,82 58,82" />
          <ellipse cx={50} cy={42} rx={30} ry={34} fill={color} />
          <ellipse cx={38} cy={30} rx={8} ry={12} fill={a0} opacity={0.7} transform="rotate(-20 38 30)" />
        </>
      ) : null}
      {shape === "fireworks" ? (
        <>
          <circle cx={50} cy={50} r={6} fill={color} />
          <path d="M50 14 V30 M50 70 V86 M14 50 H30 M70 50 H86 M25 25 L36 36 M64 64 L75 75 M75 25 L64 36 M36 64 L25 75" stroke={a0} strokeWidth={6} strokeLinecap="round" />
          <path d="M50 6 V10 M50 90 V94 M6 50 H10 M90 50 H94" stroke={a1} strokeWidth={6} strokeLinecap="round" />
          <circle cx={50} cy={50} r={2.5} fill={a2} />
        </>
      ) : null}
      {shape === "cake" ? (
        <>
          <rect x={44} y={10} width={4} height={16} fill={a1} />
          <rect x={56} y={10} width={4} height={16} fill={a1} />
          <circle cx={46} cy={9} r={3.5} fill={a1} />
          <circle cx={58} cy={9} r={3.5} fill={a1} />
          <rect x={20} y={26} width={60} height={12} rx={4} fill={a0} />
          <rect x={16} y={38} width={68} height={34} rx={4} fill={color} />
          <rect x={12} y={72} width={76} height={8} rx={4} fill={a1} />
        </>
      ) : null}
      {shape === "bunting" ? (
        <>
          <path d="M8 22 Q50 44 92 22" stroke="#141412" strokeWidth={4} strokeLinecap="round" fill="none" />
          <polygon fill={color} points="20,26 34,28 27,44" />
          <polygon fill={a0} points="43,31 57,31 50,47" />
          <polygon fill={a1} points="66,28 80,26 73,42" />
        </>
      ) : null}
      {shape === "party-hat" ? (
        <>
          <polygon fill={color} points="50,8 82,82 18,82" />
          <path d="M38 38 L62 38 M30 58 L70 58" stroke={a0} strokeWidth={6} strokeLinecap="round" />
          <circle cx={50} cy={8} r={8} fill={a1} />
        </>
      ) : null}
      {shape === "share-arrow" ? (
        <>
          <path d="M28 50 L66 26 M28 50 L66 74" stroke={color} strokeWidth={6} strokeLinecap="round" />
          <circle cx={24} cy={50} r={10} fill={color} />
          <circle cx={72} cy={22} r={10} fill={color} />
          <circle cx={72} cy={78} r={10} fill={color} />
        </>
      ) : null}
      {shape === "link" ? (
        <>
          <rect x={14} y={38} width={36} height={24} rx={12} {...strokeProps} strokeWidth={8} transform="rotate(-45 32 50)" />
          <rect x={50} y={38} width={36} height={24} rx={12} {...strokeProps} strokeWidth={8} transform="rotate(-45 68 50)" />
        </>
      ) : null}
      {shape === "hashtag" ? (
        <path d="M40 14 L30 86 M64 14 L54 86 M14 36 H86 M14 62 H86" {...strokeProps} strokeWidth={9} />
      ) : null}
      {shape === "chat-heart" ? (
        <>
          <path d="M18 14 H82 A10 10 0 0 1 92 24 V62 A10 10 0 0 1 82 72 H56 L34 90 V72 H18 A10 10 0 0 1 8 62 V24 A10 10 0 0 1 18 14 Z" fill={color} />
          <path fill={a0} d="M50 66 C36 55 30 47 30 39 C30 32 35 28 41 28 C45 28 48 30 50 33 C52 30 55 28 59 28 C65 28 70 32 70 39 C70 47 64 55 50 66 Z" />
        </>
      ) : null}
      {shape === "hand-pointer" ? (
        <path
          fill={color} stroke="#141412" strokeWidth={4} strokeLinejoin="round"
          d="M36 10 L36 60 L48 50 L56 68 L64 64 L56 46 L72 46 Z"
        />
      ) : null}
      {shape === "check-badge" ? (
        <>
          <circle cx={50} cy={50} r={38} fill={color} />
          <path d="M34 51 L46 63 L68 38" stroke={a0} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : null}
      {shape === "hexagon" ? <polygon fill={color} points="50,8 86,29 86,71 50,92 14,71 14,29" /> : null}
      {shape === "pentagon" ? <polygon fill={color} points="50,8 90,38 75,88 25,88 10,38" /> : null}
      {shape === "octagon" ? <polygon fill={color} points="32,10 68,10 90,32 90,68 68,90 32,90 10,68 10,32" /> : null}
      {shape === "blob" ? (
        <path fill={color} d="M52 6 C74 10 94 28 90 52 C86 76 68 94 46 90 C24 86 6 68 10 46 C14 24 30 2 52 6 Z" />
      ) : null}
      {shape === "squiggle" ? (
        <path d="M8 54 Q 20 30, 32 54 T 56 54 T 80 54 T 96 54" {...strokeProps} strokeWidth={9} />
      ) : null}
      {shape === "leaf" ? (
        <>
          <path fill={color} d="M84 14 C52 18 22 42 16 80 C54 76 80 48 84 14 Z" />
          <path d="M26 70 L74 24" stroke={a0} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "flower" ? (
        <>
          <ellipse cx={50} cy={22} rx={12} ry={16} fill={color} />
          <ellipse cx={50} cy={78} rx={12} ry={16} fill={color} />
          <ellipse cx={22} cy={50} rx={16} ry={12} fill={color} />
          <ellipse cx={78} cy={50} rx={16} ry={12} fill={color} />
          <ellipse cx={30} cy={30} rx={12} ry={12} fill={color} transform="rotate(-45 30 30)" />
          <ellipse cx={70} cy={30} rx={12} ry={12} fill={color} transform="rotate(45 70 30)" />
          <ellipse cx={30} cy={70} rx={12} ry={12} fill={color} transform="rotate(45 30 70)" />
          <ellipse cx={70} cy={70} rx={12} ry={12} fill={color} transform="rotate(-45 70 70)" />
          <circle cx={50} cy={50} r={12} fill={a0} />
        </>
      ) : null}
      {shape === "tree" ? (
        <>
          <rect x={45} y={66} width={10} height={22} fill={a0} />
          <circle cx={50} cy={30} r={20} fill={color} />
          <circle cx={32} cy={52} r={16} fill={color} />
          <circle cx={68} cy={52} r={16} fill={color} />
        </>
      ) : null}
      {shape === "mountain" ? (
        <>
          <polygon fill={a1} points="6,84 34,34 58,84" />
          <polygon fill={color} points="34,84 62,22 92,84" />
          <polygon fill={a0} points="62,22 72,40 66,44 60,38 54,46 50,40" />
        </>
      ) : null}
      {shape === "rainbow" ? (
        <>
          <path d="M16 80 A34 34 0 0 1 84 80" stroke={color} strokeWidth={9} strokeLinecap="round" fill="none" />
          <path d="M26 80 A24 24 0 0 1 74 80" stroke={a0} strokeWidth={9} strokeLinecap="round" fill="none" />
          <path d="M36 80 A14 14 0 0 1 64 80" stroke={a1} strokeWidth={9} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "pizza" ? (
        <>
          <polygon fill={color} points="50,90 12,32 88,32" />
          <path d="M12 32 A40 40 0 0 1 88 32" stroke="#D97706" strokeWidth={9} strokeLinecap="round" fill="none" />
          <circle cx={42} cy={52} r={6} fill={a0} />
          <circle cx={60} cy={48} r={6} fill={a0} />
          <circle cx={50} cy={68} r={6} fill={a0} />
        </>
      ) : null}
      {shape === "burger" ? (
        <>
          <path fill={color} d="M16 44 A34 22 0 0 1 84 44 Z" />
          <path d="M14 50 Q 22 44, 30 50 T 46 50 T 62 50 T 78 50 T 88 50" stroke={a0} strokeWidth={5} strokeLinecap="round" fill="none" />
          <rect x={14} y={56} width={72} height={10} rx={5} fill={a1} />
          <rect x={18} y={70} width={64} height={12} rx={6} fill={color} />
        </>
      ) : null}
      {shape === "ice-cream" ? (
        <>
          <polygon fill={a0} points="32,52 68,52 50,90" />
          <path d="M40 62 L58 68 M42 72 L56 76" stroke="#141412" strokeWidth={3} strokeLinecap="round" />
          <circle cx={50} cy={36} r={20} fill={color} />
          <circle cx={50} cy={14} r={5} fill={a1} />
        </>
      ) : null}
      {shape === "donut" ? (
        <>
          <circle cx={50} cy={50} r={38} fill={color} />
          <circle cx={50} cy={50} r={26} fill={a0} />
          <circle cx={50} cy={50} r={10} fill="#141412" />
          <rect x={28} y={30} width={10} height={4} rx={2} fill="#FFFFFF" transform="rotate(30 33 32)" />
          <rect x={62} y={28} width={10} height={4} rx={2} fill="#FFFFFF" transform="rotate(-20 67 30)" />
          <rect x={66} y={58} width={10} height={4} rx={2} fill="#FFFFFF" transform="rotate(40 71 60)" />
          <rect x={30} y={62} width={10} height={4} rx={2} fill="#FFFFFF" transform="rotate(-35 35 64)" />
        </>
      ) : null}
      {shape === "strawberry" ? (
        <>
          <path fill={color} d="M50 88 C30 70 18 54 18 38 C18 26 28 20 50 20 C72 20 82 26 82 38 C82 54 70 70 50 88 Z" />
          <ellipse cx={38} cy={44} rx={3} ry={5} fill={a0} />
          <ellipse cx={62} cy={44} rx={3} ry={5} fill={a0} />
          <ellipse cx={50} cy={58} rx={3} ry={5} fill={a0} />
          <ellipse cx={40} cy={66} rx={3} ry={5} fill={a0} />
          <ellipse cx={60} cy={66} rx={3} ry={5} fill={a0} />
          <polygon fill={a1} points="50,20 34,8 46,18 50,6 54,18 66,8" />
        </>
      ) : null}
      {shape === "cupcake" ? (
        <>
          <circle cx={50} cy={30} r={18} fill={color} />
          <circle cx={50} cy={14} r={5} fill={a1} />
          <polygon fill={a0} points="30,48 70,48 64,86 36,86" />
          <path d="M40 52 L38 82 M50 52 L50 82 M60 52 L62 82" stroke="#141412" strokeWidth={3} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "cat-face" ? (
        <>
          <polygon fill={color} points="24,44 18,12 44,28" />
          <polygon fill={color} points="76,44 82,12 56,28" />
          <circle cx={50} cy={56} r={30} fill={color} />
          <circle cx={38} cy={52} r={4} fill="#141412" />
          <circle cx={62} cy={52} r={4} fill="#141412" />
          <polygon fill={a0} points="50,60 44,66 56,66" />
          <path d="M44 70 Q50 74 56 70" stroke="#141412" strokeWidth={3.5} strokeLinecap="round" fill="none" />
          <path d="M14 56 H28 M14 66 L28 62 M72 56 H86 M72 62 L86 66" stroke="#141412" strokeWidth={3} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "dog-face" ? (
        <>
          <ellipse cx={22} cy={48} rx={12} ry={22} fill={a0} transform="rotate(12 22 48)" />
          <ellipse cx={78} cy={48} rx={12} ry={22} fill={a0} transform="rotate(-12 78 48)" />
          <circle cx={50} cy={54} r={30} fill={color} />
          <ellipse cx={50} cy={66} rx={16} ry={11} fill={a1} />
          <circle cx={38} cy={48} r={4} fill="#141412" />
          <circle cx={62} cy={48} r={4} fill="#141412" />
          <ellipse cx={50} cy={60} rx={6} ry={4.5} fill="#141412" />
          <path d="M50 64 V70 M44 70 Q50 75 56 70" stroke="#141412" strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "bird" ? (
        <>
          <polygon fill={a1} points="18,52 6,44 10,58" />
          <ellipse cx={52} cy={54} rx={30} ry={24} fill={color} />
          <ellipse cx={44} cy={58} rx={14} ry={9} fill={a0} transform="rotate(-18 44 58)" />
          <polygon fill={a1} points="80,48 94,52 80,58" />
          <circle cx={70} cy={42} r={4.5} fill="#141412" />
        </>
      ) : null}
      {shape === "fish" ? (
        <>
          <polygon fill={a0} points="16,50 34,34 34,66" />
          <ellipse cx={54} cy={50} rx={30} ry={22} fill={color} />
          <path d="M44 34 Q54 28 64 34" stroke="#141412" strokeWidth={3.5} strokeLinecap="round" fill="none" />
          <circle cx={74} cy={46} r={4} fill="#141412" />
        </>
      ) : null}
      {shape === "butterfly" ? (
        <>
          <ellipse cx={32} cy={36} rx={16} ry={20} fill={color} transform="rotate(-24 32 36)" />
          <ellipse cx={68} cy={36} rx={16} ry={20} fill={color} transform="rotate(24 68 36)" />
          <ellipse cx={34} cy={68} rx={13} ry={16} fill={color} transform="rotate(20 34 68)" />
          <ellipse cx={66} cy={68} rx={13} ry={16} fill={color} transform="rotate(-20 66 68)" />
          <circle cx={30} cy={34} r={4} fill={a0} />
          <circle cx={70} cy={34} r={4} fill={a0} />
          <rect x={46} y={26} width={8} height={48} rx={4} fill="#141412" />
          <path d="M48 26 Q40 14 32 12 M52 26 Q60 14 68 12" stroke="#141412" strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "paw-print" ? (
        <>
          <ellipse cx={50} cy={66} rx={22} ry={17} fill={color} />
          <ellipse cx={28} cy={38} rx={8} ry={11} fill={a0} />
          <ellipse cx={50} cy={30} rx={8} ry={11} fill={a0} />
          <ellipse cx={72} cy={38} rx={8} ry={11} fill={a0} />
        </>
      ) : null}
      {shape === "football" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} stroke="#141412" strokeWidth={4} />
          <polygon fill="#141412" points="50,38 61,46 57,59 43,59 39,46" />
          <path d="M50 38 L50 14 M61 46 L82 40 M57 59 L70 76 M43 59 L30 76 M39 46 L18 40" stroke="#141412" strokeWidth={4} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "basketball" ? (
        <>
          <circle cx={50} cy={50} r={40} fill={color} />
          <path d="M10 50 H90 M50 10 V90 M22 22 Q50 50 22 78 M78 22 Q50 50 78 78" stroke="#141412" strokeWidth={4} strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {shape === "medal" ? (
        <>
          <polygon fill={a0} points="34,8 48,8 42,34 28,34" />
          <polygon fill={a1} points="52,8 66,8 72,34 58,34" />
          <circle cx={50} cy={62} r={26} fill={color} />
          <polygon fill="#FFFFFF" points="50,48 54,58 65,58 56,64 59,75 50,68 41,75 44,64 35,58 46,58" />
        </>
      ) : null}
      {shape === "dumbbell" ? (
        <>
          <rect x={10} y={28} width={16} height={44} rx={5} fill={color} />
          <rect x={74} y={28} width={16} height={44} rx={5} fill={color} />
          <rect x={26} y={44} width={48} height={12} rx={4} fill={a0} />
        </>
      ) : null}
      {shape === "headphones" ? (
        <>
          <path d="M22 62 V46 A28 28 0 0 1 78 46 V62" stroke={color} strokeWidth={9} strokeLinecap="round" fill="none" />
          <rect x={14} y={58} width={18} height={28} rx={7} fill={color} />
          <rect x={68} y={58} width={18} height={28} rx={7} fill={color} />
        </>
      ) : null}
      {shape === "guitar" ? (
        <>
          <rect x={56} y={12} width={10} height={44} rx={3} fill={a0} transform="rotate(28 61 34)" />
          <circle cx={42} cy={62} r={24} fill={color} />
          <circle cx={42} cy={62} r={9} fill="#141412" />
          <path d="M58 44 L34 72 M62 38 L38 66" stroke="#141412" strokeWidth={2.5} strokeLinecap="round" />
        </>
      ) : null}
      {shape === "music-double" ? (
        <>
          <rect x={30} y={14} width={7} height={56} fill={color} />
          <rect x={62} y={26} width={7} height={44} fill={color} />
          <polygon fill={color} points="37,14 66,26 62,42 37,32" />
          <ellipse cx={22} cy={74} rx={13} ry={9} fill={color} transform="rotate(-18 22 74)" />
          <ellipse cx={54} cy={74} rx={13} ry={9} fill={color} transform="rotate(-18 54 74)" />
        </>
      ) : null}
    </svg>
  );
};

/** Base box (reference px at a 1080 short edge) a shape overlay occupies before the item's scale. */
export const SHAPE_BASE_PX = 240;
/** Base width (reference px at a 1080 short edge) an image overlay occupies before the item's scale. */
export const IMAGE_BASE_PX = 360;

/**
 * Package 3 item I.5 — overlay entrance/exit animation, in the SAME motion system as the
 * captions' In/Out: the preset ids come from the shared ENTRANCES / EXITS vocabulary and
 * speed is the same multiplier semantics (base duration ÷ speed). Only the box-applicable
 * presets are offered for overlays — an overlay is one box, so the letter-level presets
 * (typewriter, scramble, the letter animators…) stay caption-only. The math mirrors the
 * caption entranceStyle/exitStyle formulas for these types (same distances, same tails),
 * applied to a wrapper div so it composes with the item's own position/rotation/scale
 * and with a social graphic's internal animation.
 */
export const OVERLAY_ENTER_ANIMS = [
  { id: "none", label: "No entrance" },
  { id: "fade", label: "Fade in" },
  { id: "rise", label: "Rise" },
  { id: "drop", label: "Drop" },
  { id: "pop", label: "Pop" },
  { id: "zoom", label: "Zoom" },
  { id: "slide-left", label: "Slide from left" },
  { id: "slide-right", label: "Slide from right" },
  { id: "blur-in", label: "Blur in" },
  { id: "flip", label: "Flip" },
  { id: "elastic", label: "Elastic" },
  { id: "wave", label: "Wave" },
] as const;
export const OVERLAY_EXIT_ANIMS = [
  { id: "none", label: "No exit" },
  { id: "fade", label: "Fade out" },
  { id: "fall", label: "Fall" },
  { id: "zoom-out", label: "Zoom out" },
  { id: "blur-out", label: "Blur out" },
  { id: "slide-up", label: "Slide up" },
] as const;

const OVERLAY_ENTER_BASE_MS = 320;
const OVERLAY_EXIT_BASE_MS = 240;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
const springOut = (t: number) => {
  const c = 1.2;
  const u = t - 1;
  return Math.min(1, Math.max(0, 1 + (c + 1) * u * u * u + c * u * u));
};

/** The wrapper style for an overlay item at `localMs` inside its own window ({} = settled / no animation). */
export function overlayAnimStyle(item: OverlayItem, localMs: number): React.CSSProperties {
  const windowMs = Math.max(1, item.endMs - item.startMs);
  const enter = item.enterAnim;
  if (enter && enter !== "none") {
    const dur = Math.min(windowMs, OVERLAY_ENTER_BASE_MS / (item.enterSpeed ?? 1));
    if (localMs < dur) {
      const p = easeOutCubic(Math.max(0, localMs) / dur);
      switch (enter) {
        case "fade": return { opacity: p };
        case "rise": return { opacity: p, transform: `translateY(${((1 - p) * 26).toFixed(2)}px)` };
        case "drop": return { opacity: p, transform: `translateY(${(-(1 - p) * 26).toFixed(2)}px)` };
        case "pop": return { opacity: Math.min(1, p * 1.6), transform: `scale(${(0.6 + 0.4 * springOut(Math.max(0, localMs) / dur)).toFixed(3)})` };
        case "zoom": return { opacity: p, transform: `scale(${(0.8 + 0.2 * p).toFixed(3)})` };
        case "slide-left": return { opacity: p, transform: `translateX(${(-(1 - p) * 40).toFixed(2)}px)` };
        case "slide-right": return { opacity: p, transform: `translateX(${((1 - p) * 40).toFixed(2)}px)` };
        case "blur-in": return { opacity: p, filter: `blur(${((1 - p) * 8).toFixed(2)}px)` };
        case "flip": return { opacity: p, transform: `perspective(600px) rotateX(${((1 - p) * -70).toFixed(2)}deg)` };
        case "elastic": return { opacity: Math.min(1, p * 1.6), transform: `scale(${(0.55 + 0.45 * springOut(Math.max(0, localMs) / dur)).toFixed(3)})` };
        case "wave": return { opacity: p, transform: `translateY(${((1 - p) * 18).toFixed(2)}px) rotate(${((1 - p) * -3).toFixed(2)}deg)` };
        default: return { opacity: p };
      }
    }
  }
  const exit = item.exitAnim;
  if (exit && exit !== "none") {
    const dur = Math.min(windowMs, OVERLAY_EXIT_BASE_MS / (item.exitSpeed ?? 1));
    const remaining = windowMs - localMs;
    if (remaining < dur && remaining >= 0) {
      const q = easeInCubic(1 - remaining / dur);
      switch (exit) {
        case "fade": return { opacity: 1 - q };
        case "fall": return { opacity: 1 - q, transform: `translateY(${(q * 26).toFixed(2)}px)` };
        case "zoom-out": return { opacity: 1 - q, transform: `scale(${(1 - 0.2 * q).toFixed(3)})` };
        case "blur-out": return { opacity: 1 - q, filter: `blur(${(q * 8).toFixed(2)}px)` };
        case "slide-up": return { opacity: 1 - q, transform: `translateY(${(-q * 26).toFixed(2)}px)` };
        default: return { opacity: 1 - q };
      }
    }
  }
  return {};
}
/** Default text size (reference px at a 1080 short edge) when an item carries no fontSize. */
export const TEXT_DEFAULT_FONT_PX = 64;

/**
 * Text-overlay typefaces (2026-11-18, for the 50-title registry): system font stacks only —
 * no webfont downloads, no licences to clear. Absent `font` = sans, the pre-existing look.
 */
export const OVERLAY_FONT_STACKS: Record<OverlayFont, string> = {
  sans: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
  hand: "'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive",
};
export const OVERLAY_FONT_OPTIONS: { id: OverlayFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
  { id: "hand", label: "Handwritten" },
];

/**
 * One overlay item, centre-anchored at (x, y) fractions of the canvas. `sc` is the composition's
 * scale factor (short edge / 1080), so sizes follow the same reference-px convention as captions.
 */
export const OverlayView: React.FC<{ item: OverlayItem; sc: number; assetSrc?: string; memberAssetSrcs?: string[]; localMs?: number }> = ({ item, sc, assetSrc, memberAssetSrcs, localMs = 0 }) => {
  const wrap: React.CSSProperties = {
    position: "absolute",
    left: `${item.x * 100}%`,
    top: `${item.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`,
    pointerEvents: "none",
    // whole-item opacity (absent = untouched, so existing items render identically)
    ...(item.opacity !== undefined ? { opacity: item.opacity } : {}),
  };
  // Package 3 item I.5: entrance/exit animation wraps the content in one extra div, and
  // ONLY when the item carries an animation — items without one render exactly as before.
  const animated = Boolean((item.enterAnim && item.enterAnim !== "none") || (item.exitAnim && item.exitAnim !== "none"));
  const frame = (node: React.ReactNode) => (
    // text keeps its canvas-relative max-width on the positioned frame, as before the split
    <div style={item.kind === "text" ? { ...wrap, maxWidth: "86%" } : wrap}>{animated ? <div style={overlayAnimStyle(item, localMs)}>{node}</div> : node}</div>
  );
  if (item.kind === "social") {
    // animated Social Media graphic: phases derive from the item's own window (localMs is the time
    // inside its Sequence, supplied by CaptionedVideo from the frame — never a wall clock)
    if (!item.variant) return null;
    return frame(<SocialOverlayView item={item} sc={sc} localMs={localMs} assetSrc={assetSrc} memberAssetSrcs={memberAssetSrcs} />);
  }
  if (item.kind === "text") {
    return frame(
      <div
        style={{
          fontFamily: OVERLAY_FONT_STACKS[item.font ?? "sans"],
          fontWeight: 700,
          fontSize: (item.fontSize ?? TEXT_DEFAULT_FONT_PX) * sc,
          lineHeight: 1.15,
          color: item.color,
          textAlign: "center",
          whiteSpace: "pre-wrap",
          maxWidth: "86%",
        }}
      >
        {item.text ?? ""}
      </div>,
    );
  }
  if (item.kind === "image") {
    // device-local bytes: without a resolved URL in this rendering context there is nothing honest
    // to draw (server renders cannot see IndexedDB) — skip rather than paint a broken image.
    if (!assetSrc) return null;
    return frame(<Img src={assetSrc} alt={item.assetName ?? ""} style={{ display: "block", width: IMAGE_BASE_PX * sc, height: "auto" }} />);
  }
  if (!item.shape) return null;
  return frame(<OverlayShapeSvg shape={item.shape} color={item.color} size={SHAPE_BASE_PX * sc} />);
};
