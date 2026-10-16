---
name: captionseasy
description: Style captions for a video with CaptionsEasy. Turn timed words into designed, animated caption props (99 looks) for a Remotion timeline, or, with the optional add-ons, render captions into an MP4 / transparent overlay and transcribe speech locally. Use when an editing pipeline or user wants captions/subtitles styled (TikTok/Reels/Shorts, karaoke, subtitles) or needs caption style choices.
---

# CaptionsEasy: bring your words, get styled captions

`captionseasy` is tiny (no dependencies) and runs locally with no API keys. It needs Node.js 20 or newer.

## When to use

- You have word timings (`[{text, startMs, endMs}]`) and need captions that look designed.
- The user asks for caption styling: "TikTok style", "bold", "karaoke", "subtitle", a colour, a position or the pace.
- You need a captioned MP4 or a transparent caption layer. This needs the `captionseasy-render` add-on.
- You have no timings yet. The `captionseasy-transcribe` add-on produces them.

## Do this

1. **Pick a look.** Search the looks and choose one by number:
   ```bash
   npx -y captionseasy looks "<neon | minimal | karaoke | serif | one word | subtitle>" --json
   ```
   Safe defaults:
   - `12` Jumping Box: bold, social.
   - `105` Classic Subtitle: plain.
   - `13` Bouncy Single Word: one word at a time.

2. **Build the caption props** from your words. This step is instant, with no video and no rendering:
   ```bash
   npx -y captionseasy build --words words.json --look 12 --out props.json --json
   ```
   `props.json` holds `{ doc, style, settings }` for `CaptionedVideo` / `CaptionsOverlay` from `captionseasy/remotion`.

3. **Apply the user's changes** (colour, size, position, speed). Read the look's controls, then pass them with `--set`:
   ```bash
   npx -y captionseasy look 12 --json
   npx -y captionseasy build --words words.json --look 12 --set active.boxColor=#FF3366 --set position.y=0.6 --set maxWordsPerCard=2 --json
   ```
   Only keys listed by `look <n>` are accepted. An invalid key or value returns `{"error": {...}}` listing what is allowed; fix it and retry.

4. **Render a video file** (needs the add-on):
   ```bash
   npx -y -p captionseasy -p captionseasy-render captionseasy "<video>" --look 12 --words words.json --json
   npx -y -p captionseasy -p captionseasy-render captionseasy "<video>" --look 12 --words words.json --overlay --json
   ```
   - The first command writes an MP4 with the captions burned in.
   - The second writes a transparent ProRes `.mov`. Add `--format webm` for a VP9 `.webm` instead.

5. **No words yet?** Transcribe locally (needs the add-on; it downloads a ~200 MB model once):
   ```bash
   npx -y -p captionseasy -p captionseasy-transcribe captionseasy transcribe "<video>" --out words.json --json
   ```
   For speech that mixes Hindi and English, add `--language hinglish`.

## Notes

- Use absolute paths.
- An `ADDON_MISSING` error includes the exact install command in `details.install`.
- Pacing keys:
  - `maxWordsPerCard`: 2 for fast hooks, 6 or more for podcasts.
  - `pauseMs` and `holdMs`.
  - `gapBehavior=clear` blanks the screen during silences.
- MCP alternative: `npx -y captionseasy mcp` exposes `list_looks`, `describe_look`, `build_captions`, `caption_video` and `transcribe`.
