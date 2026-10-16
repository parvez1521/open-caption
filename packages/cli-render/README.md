# captionseasy-render

This is the optional **rendering add-on** for [`captionseasy`](https://www.npmjs.com/package/captionseasy). It renders CaptionsEasy captions on your machine with Remotion and headless Chrome. It can produce:
- An MP4 with the captions burned in, keeping the original audio.
- A transparent captions-only overlay at the video's size and length, as ProRes 4444 `.mov` or VP9 `.webm`.

```bash
npm i captionseasy captionseasy-render
npx captionseasy talk.mp4 --look 12 --words talk.words.json            # -> talk.captioned.mp4
npx captionseasy talk.mp4 --look 12 --words talk.words.json --overlay  # -> talk.captions.mov
```

```ts
import { render } from "captionseasy"; // loads this add-on on demand
await render({ video: "talk.mp4", words, look: 12, mode: "burn" });
```

- **Size:** about 75 MB installed, including `@remotion/renderer` and its ffmpeg. A headless Chrome (about 100 MB) downloads on the first render.
- **No build step at your end:** the caption composition ships pre-bundled, so webpack never runs on your machine.
- **Transcription:** to caption a video without words, also install `captionseasy-transcribe`.

**Licence:** MIT. Rendering uses [Remotion](https://www.remotion.dev/license). Remotion is free for individuals and for companies of up to 3 people; larger companies need a Remotion company licence.
