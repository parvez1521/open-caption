<div align="center">

<img src="apps/frontend/public/brand/captionseasy-logo.svg" alt="CaptionsEasy" height="56" />

### Animated captions for Shorts, Reels and TikToks — made right in your browser.

Free · small watermark on free MP4 exports · your video never leaves your device · English and Hinglish

[**Try it → captionseasy.com**](https://www.captionseasy.com) &nbsp;·&nbsp; [Report a bug](https://github.com/Ishaan-Gpt/Captions-Easy/issues) &nbsp;·&nbsp; [Request a feature](https://github.com/Ishaan-Gpt/Captions-Easy/issues)

<img src=".github/looks.gif" alt="A few of the 20+ caption looks" width="760" />

</div>

## What it does

Drop a video, get word-timed animated captions in a couple of minutes, fix any word, pick a look, export an MP4.

- **Runs in your browser.** Speech recognition is Whisper running on WebGPU / WASM in your tab ([transformers.js](https://github.com/huggingface/transformers.js)). Rendering is the same Remotion composition the preview uses, encoded with WebCodecs. Your video is never uploaded.
- **20+ looks** — Hormozi box, karaoke fill, neon, glow, comic, retro 3D, serif accents and more. Every look renders identically in the preview and the export.
- **Edit everything** — words, timing, line breaks, key words, position, fonts (400+ Google fonts or your own), colours, motion.
- **Hindi / Hinglish** in Roman script with a fine-tuned Whisper model ([Oriserve Whisper-Hindi2Hinglish-Swift](https://huggingface.co/Oriserve/Whisper-Hindi2Hinglish-Swift), converted to ONNX with word timestamps).
- **Exports:** MP4 with burned-in captions, SRT. The optional desktop helper adds transparent overlays (ProRes 4444 / WebM alpha) for Premiere, Resolve and CapCut.
- **No signup to try.** Free MP4 exports carry a small Captionit watermark.

## Tech stack

| | |
|---|---|
| Web app + API | Next.js 16, React 19, Tailwind 4 (`apps/frontend`) |
| Captions rendering | [Remotion](https://www.remotion.dev) — `@remotion/player` for preview, `@remotion/web-renderer` for in-browser MP4 |
| Speech to text | Whisper via transformers.js (WebGPU, WASM fallback) |
| Media | [Mediabunny](https://mediabunny.dev) for probing, decoding and converting in the browser |
| Data & auth | Supabase (Postgres + RLS, Auth) |
| Hosting | Vercel |

## Repository layout

```
apps/frontend            Next.js app: landing, studio, API routes (/api/v1)
packages/shared          zod contracts shared by app, engine and helper
packages/caption-engine  pure TypeScript: normalize ASR words, segment into cards, SRT/VTT/ASS export
packages/templates       caption layouts, looks, motion library, fonts
packages/compositions    the Remotion composition used by both preview and export
packages/companion       optional desktop helper (local whisper.cpp + Remotion renderer)
supabase/migrations      database migrations
```

## Run it locally

Requirements: Node 20+, [pnpm](https://pnpm.io), a free [Supabase](https://supabase.com) project.

```bash
git clone https://github.com/Ishaan-Gpt/Captions-Easy.git
cd Captions-Easy
pnpm install
cp apps/frontend/.env.example apps/frontend/.env.local   # fill in your Supabase keys
pnpm dev                                                 # http://localhost:3000
```

Checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

> **Database:** `supabase/migrations` currently holds the later migrations only; a full schema snapshot is on the way. Until then, open an issue if you want to self-host and we'll help.

## Licensing

CaptionsEasy's own code is [MIT](LICENSE).

It is built on **Remotion**, which has its own license: free for individuals and small teams, but **companies above Remotion's free tier need a [Remotion company license](https://www.remotion.dev/license)** to use it. If you fork CaptionsEasy for a business, check Remotion's terms.

Fonts and speech models keep their own licenses (Google Fonts: OFL / Apache; Whisper models: MIT / Apache-2.0).

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first areas: new caption looks, language support, editor polish.

If CaptionsEasy saved you time, a ⭐ helps a lot.

Made by [Ishaan Gupta](https://github.com/Ishaan-Gpt).
