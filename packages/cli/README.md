# captionseasy

[![npm](https://img.shields.io/npm/v/captionseasy)](https://www.npmjs.com/package/captionseasy) [![downloads](https://img.shields.io/npm/dm/captionseasy)](https://www.npmjs.com/package/captionseasy) [![GitHub stars](https://img.shields.io/github/stars/Ishaan-Gpt/Captions-Easy?style=social)](https://github.com/Ishaan-Gpt/Captions-Easy) [![license](https://img.shields.io/npm/l/captionseasy)](./LICENSE)

**Bring your words, get styled captions.** CaptionsEasy is a caption style layer for developers and AI editing agents: 99 designed, animated caption looks, a validator that turns timed words + a look into ready-to-render caption props, the React/Remotion components that draw them, a CLI and an MCP server.

- **Tiny and dependency-free.** `npm i captionseasy` adds one package, about 1.6 MB, with zero runtime dependencies.
- **Designed looks, not settings soup.** Every look has a permanent number (`#12 Jumping Box`, `#105 Classic Subtitle`). Each look lists the few controls it really responds to. Anything else is rejected with a clear error instead of silently doing nothing.
- **Agent-ready.** Every CLI command has `--json`. The MCP tools take JSON and return JSON.
- **Runs 100% locally, free.** No servers and no API keys. Rendering and speech-to-text are **optional add-ons** that also run on your machine.

## 30-second quickstart

You already have word timings, for example from your editor, your ASR or your agent:

```json
[{ "text": "Stop", "startMs": 380, "endMs": 840 }, { "text": "scrolling", "startMs": 840, "endMs": 1080 }]
```

```bash
npx captionseasy looks bold                     # pick a look (search: neon, karaoke, subtitle, "one word" ...)
npx captionseasy look 12                        # what can I change on look #12?
npx captionseasy build --words words.json --look 12 --set active.boxColor=#FF3366 --out props.json
```

`props.json` holds `{ doc, style, settings }`, validated and complete. Render it with the CaptionsEasy composition in your own Remotion timeline (see [Use the props in Remotion](#use-the-props-in-remotion)). If you would rather get a finished video file, add [rendering](#optional-rendering-captionseasy-render).

## Library

```ts
import { listLooks, describeLook, buildCaptions } from "captionseasy";

listLooks({ query: "bold" });   // [{ number, id, name, section, tags, description, layout, wordsPerCard }]
describeLook(12);               // { ...summary, defaults, controls: [{ key, type, min, max, options, default, dependsOn }], settings: [...] }

const props = buildCaptions({
  words,                                                    // [{ text, startMs, endMs }]
  look: 12,                                                 // number or id ("hormozi_box")
  overrides: { "active.boxColor": "#FF3366", "position.y": 0.6 },
  settings: { maxWordsPerCard: 2 },                         // pacing
});
// { doc, style, settings, look: { number, id, name }, warnings }
```

Errors are `CaptionsEasyError` objects with a stable `code`: `UNKNOWN_LOOK`, `BAD_OVERRIDE`, `BAD_SETTINGS`, `BAD_WORDS`, `BAD_ARGS`, `FILE_NOT_FOUND`, `ADDON_MISSING`, `NO_AUDIO`, `NO_VIDEO`, `TRANSCRIBE_FAILED` or `RENDER_FAILED`. The `details` field carries machine-readable context, such as the valid keys, the allowed range or the install command.

**Overrides** can be flat dot paths (`{"active.color": "#FF3366"}`) or nested objects. Colours can be written as `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`/`rgba()`/`hsl()`, or a basic name.

A control with `dependsOn` only works once another key is set:
- Harmless switches (outline, shadow, glow, background, gradient) are turned on for you, with a warning.
- Switches that change the motion are never turned on for you; you get an error saying what to set.

## Use the props in Remotion

`captionseasy/remotion` exports the same composition the CaptionsEasy studio uses. Its peer dependencies are `react` and `remotion` (^4.0.484).

```tsx
import { Composition } from "remotion";
import { CaptionedVideo, CaptionsOverlay, calculateMetadata } from "captionseasy/remotion";

// captions only, transparent: put it on a track above your video
<Composition id="Captions" component={CaptionsOverlay} calculateMetadata={calculateMetadata}
  fps={30} width={1080} height={1920} durationInFrames={300}
  defaultProps={{ ...props, media: { width: 1080, height: 1920, fps: 30, durationMs: 10000 } }} />

// or captions burned over a video
<CaptionedVideo src={staticFile("talk.mp4")} media={{ width: 1080, height: 1920, fps: 30, durationMs: 10000 }} {...props} />
```

`CaptionsEasyCompositions` registers both compositions (`CaptionedVideo`, `CaptionsOverlay`). Fonts load from Google Fonts while rendering (free, no key).

## CLI

```text
captionseasy looks [query] [--tag <tag>] [--section <id>]   list the looks
captionseasy look <number|id>                             one look: defaults + the controls it honours
captionseasy build --words <words.json> --look <n|id> [--set key=value ...] [--out props.json]
captionseasy mcp                                          MCP server on stdio
captionseasy <video> --look <n|id> [--words w.json] ...   render a video          (add-on captionseasy-render)
captionseasy transcribe <video> [--out words.json]        speech to timed words   (add-on captionseasy-transcribe)
```

| option | meaning |
| --- | --- |
| `--look, -l <n\|id>` | look number (`12`) or id (`hormozi_box`) |
| `--words <file.json>` | `[{text,startMs,endMs}]` or `{ "words": [...] }` |
| `--set key=value` | change the look, repeatable. Style keys and pacing keys (`maxWordsPerCard`, `pauseMs`, `gapBehavior` ...) both come from `captionseasy look <n>` |
| `--overlay` / `--format mov\|webm` | render transparent captions only (ProRes 4444 `.mov`, or VP9 `.webm`) |
| `--out, -o <path>` | output file |
| `--language en\|hinglish\|auto` | speech language when transcribing |
| `--json` | one JSON document on stdout. Progress goes to stderr. Errors are printed as `{"error":{"code","message","details"}}` and exit with code 1 |

## MCP server

The tools are **`list_looks`**, **`describe_look`**, **`build_captions`**, **`caption_video`** and **`transcribe`**. All take JSON and use local file paths.
- `build_captions` works with the core package alone.
- `caption_video` and `transcribe` need their add-on. Without it they return `ADDON_MISSING` with the exact install command.

To add it to Claude Code:

```bash
claude mcp add captionseasy -- npx -y captionseasy mcp
# with video rendering:
claude mcp add captionseasy -- npx -y -p captionseasy -p captionseasy-render captionseasy mcp
```

For Cursor (`~/.cursor/mcp.json`), Claude Desktop, or any client that takes the usual shape:

```json
{ "mcpServers": { "captionseasy": { "command": "npx", "args": ["-y", "captionseasy", "mcp"] } } }
```

On Windows, if your client cannot start `npx` directly, use `"command": "cmd", "args": ["/c", "npx", "-y", "captionseasy", "mcp"]`.

## Optional: rendering (`captionseasy-render`)

```bash
npm i captionseasy captionseasy-render        # ~75 MB; a headless Chrome (~100 MB) downloads on first render
npx captionseasy talk.mp4 --look 12 --words talk.words.json               # -> talk.captioned.mp4
npx captionseasy talk.mp4 --look 12 --words talk.words.json --overlay     # -> talk.captions.mov (alpha)
# without a local install:
npx -p captionseasy -p captionseasy-render captionseasy talk.mp4 --look 12 --words talk.words.json
```

```ts
import { render } from "captionseasy";   // loads captionseasy-render on demand
await render({ video: "talk.mp4", words, look: 12, mode: "overlay", overlayFormat: "webm", out: "captions.webm" });
// { out, mode, durationMs, width, height, fps, look, words, renderMs, warnings }
```

- **Burn mode** writes an H.264 MP4 with the original audio.
- **Overlay mode** writes ProRes 4444 `.mov` or VP9 `.webm`, both with an alpha channel, at the video's size and length.
- The add-on ships the composition pre-bundled, so no webpack runs on your machine. It uses the ffmpeg that comes with Remotion.

## Optional: transcription (`captionseasy-transcribe`)

No word timings yet? This add-on runs Whisper locally, using `whisper-base` with word timestamps through transformers.js on onnxruntime-node.
- onnxruntime-node ships prebuilt binaries, so nothing is compiled.
- The add-on is about 540 MB installed, plus a speech model downloaded once into your user cache (about 200 MB for English, about 77 MB for Hinglish).

```bash
npm i captionseasy captionseasy-transcribe
npx captionseasy transcribe talk.mp4 --out talk.words.json       # [{ text, startMs, endMs }]
```

With both add-ons installed, `captionseasy talk.mp4 --look 12` transcribes and renders in one step.

## JSON shapes

```jsonc
// describe_look / captionseasy look 12 --json (trimmed)
{ "number": 12, "id": "hormozi_box", "name": "Jumping Box", "section": "popular", "layout": "sentence", "wordsPerCard": 3,
  "defaults": { "fontSize": 58, "active.boxColor": "#22C55E", "position.y": 0.72 },
  "controls": [
    { "key": "fontSize", "label": "Size", "type": "number", "min": 24, "max": 140, "step": 1, "default": 58 },
    { "key": "active.effect", "label": "Spoken-word effect", "type": "enum", "options": ["none", "color", "box"], "default": "box" },
    { "key": "stroke.width", "label": "Outline width", "type": "number", "min": 1, "max": 16, "default": 3, "dependsOn": "stroke.enabled=true" }
  ],
  "settings": [{ "key": "maxWordsPerCard", "type": "number", "min": 1, "max": 12, "default": 3 }] }

// build_captions / buildCaptions
{ "doc": { "version": 2, "language": "en", "words": [{ "id": "a1b2c3d4e5f6", "text": "Stop", "startMs": 380, "endMs": 840 }] },
  "style": { "templateId": "boxed_word", "fontId": "Montserrat", "...": "every field filled in" },
  "settings": { "maxWordsPerCard": 3, "pauseMs": 400, "...": "..." },
  "look": { "number": 12, "id": "hormozi_box", "name": "Jumping Box" }, "warnings": [] }

// any error
{ "error": { "code": "BAD_OVERRIDE", "message": "Unknown style key \"wobble\". Jumping Box (#12) accepts: fontId, fontSize, ...", "details": { "validKeys": ["fontId", "..."] } } }
```

## Licences

- captionseasy: MIT (see LICENSE).
- Rendering uses [Remotion](https://www.remotion.dev). Remotion is free for individuals and for companies of up to 3 people; larger companies need a [Remotion company licence](https://www.remotion.dev/license). This applies whether you render with `captionseasy-render` or render the components in your own Remotion project.
- Speech models (transcribe add-on): OpenAI Whisper (MIT), via `onnx-community/whisper-base_timestamped`. The Hinglish model is `ishaan-g/whisper-hinglish-swift_timestamped`.
- Fonts: Google Fonts (open licences).
