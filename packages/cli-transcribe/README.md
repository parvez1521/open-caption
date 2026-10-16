# captionseasy-transcribe

This is the optional **transcription add-on** for [`captionseasy`](https://www.npmjs.com/package/captionseasy). It runs local Whisper speech-to-text with word timestamps:
- Whisper runs through transformers.js on onnxruntime-node. The prebuilt binaries ship in the npm package, so there is no compiler, no Python and no API key.
- The models are the same ones the CaptionsEasy studio uses: `whisper-base` (English, or auto-detect) and a Hinglish fine-tune that writes Hindi/English in Roman letters.

```bash
npm i captionseasy captionseasy-transcribe
npx captionseasy transcribe talk.mp4 --out talk.words.json     # [{ text, startMs, endMs }]
```

```ts
import { transcribe } from "captionseasy"; // loads this add-on on demand
const { words } = await transcribe("talk.mp4", { language: "en" }); // "en" | "hinglish" | "auto"
```

**Size:**
- About 540 MB installed, mostly the onnxruntime binaries.
- The speech model downloads once into your per-user cache: about 205 MB for English, about 77 MB for Hinglish. Set `CAPTIONSEASY_CACHE` to put it somewhere else.
- After that download it works offline.

**Licence:** MIT. Whisper is MIT-licensed.
