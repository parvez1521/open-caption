# Hinglish transcription — findings (2026-11-20)

Owner asks: (1) transcript in pieces — wants the whole transcript at once;
(2) Hinglish makes too many mistakes — "train" it so captions/transcripts
come out properly in Hinglish. Base: origin/main 0344f05.

## 1. Current setup (verified in code)

- **Engine:** Whisper in-browser only (owner rule), Transformers.js 4.3.0 +
  onnxruntime-web, in a Web Worker (`features/transcribe/whisper.worker.ts`).
  Desktop: WebGPU fp16. Phones / low-memory: WASM q8, single thread.
- **Models** (`features/transcribe/runtime.ts`, `MODELS`):
  - `en` — stock `onnx-community/whisper-base_timestamped` (74M params),
    forced to English, ~90 MB download.
  - `hinglish` — `ishaan-g/whisper-hinglish-swift_timestamped`, pinned
    revision. This is Oriserve Whisper-Hindi2Hinglish-Swift: Whisper **base
    fine-tuned on Indian Hindi speech**, writes Hindi + Hinglish in Roman
    script. Language token forced to `"en"` (it was trained with the "en"
    token). Token budget 12/sec (Roman Hinglish needs ~2 tokens/word).
  - `hindi` — the SAME stock base, forced to `"hi"` (Devanagari).
  - All other languages share the stock base with only the token changed.
- **Chunking:** speech is packed into windows of up to **28 s** (first
  window 10 s), silence dropped (`features/transcribe/speech.ts`,
  `WINDOW_S = 28`). Each finished window posts a `"partial"` word batch;
  the Studio session accumulates raw words and rebuilds caption words per
  partial, so captions appear window by window while the run continues.
  Each window is decoded **independently** — no cross-window context.
- **Language token rules:** Studio session (`session.ts:146-149`) forces the
  model's token for every non-English choice; English uses its token only
  when the choice is explicit, otherwise auto-detect (`null`). The standalone
  /transcribe page mirrors the rule exactly (`standalone.ts`,
  `standaloneLanguageToken`).
- **/transcribe page** (`app/(dashboard)/transcribe/page.tsx`):
  - While running it shows only the **last 220 characters** of the text.
  - When done it shows one card per silence-split **segment** (gap >= 900 ms,
    max 8 s / 16 words — `wordsToTranscriptPages`).
  - The whole plain text exists (`transcriptPlainText`, pages joined with
    newlines) but is used ONLY for Copy + TXT/SRT/VTT downloads — it is
    never displayed as a readable block. That is the "pieces" the owner sees.
- **AI Edit planning transcription** (`features/studio/aiEditTranscribe.ts`):
  passes `language: null` — Whisper **auto-detects per window** on the
  Hinglish model, which was trained with the `"en"` token only. A Hinglish
  window auto-detected as `"hi"` decodes with a token the model was never
  trained with. Real accuracy leak, and the ONLY place the token rule is
  not followed.

## 2. "Training" — honest verdict

Real fine-tuning of Whisper is **not feasible free / in-browser**:
fine-tuning needs GPU hours plus labelled Hinglish audio, and the result
would still need a `_timestamped` ONNX export + hosting before this
pipeline could use it (word timestamps require that export). Nothing in
the free stack here can do that step.

What "trained" already means here: the Hinglish model in use IS a
fine-tune (Oriserve Swift, base-size). The better Oriserve fine-tunes
exist upstream but cannot be used:
- **Apex** = whisper-large-v3-turbo fine-tune, **Prime** = whisper-large-v3
  fine-tune (verified live via the Hugging Face API, 2026-11-20). Neither
  has a `_timestamped` export, and large-v3 is ~3 GB — far beyond a phone
  tab and heavy even on desktop WebGPU.

## 3. Free levers, ranked

1. **Correction pass on the plain transcript text** (free server text
   model — the same Groq free-tier path Growth Coach and the AI Edit
   planner use; no model/provider name in UI, standing rule). Biggest
   visible accuracy gain for the readable transcript: fixes misheard
   Roman-Hinglish words, spelling, and grammar after Whisper runs.
   Cost: a 10-min transcript is ~1,500 words (~3,000 tokens in, similar
   out) — affordable inside the 200K tokens/day org budget ONLY with a
   per-user rate limit and an input cap. **Not for timed captions**: a
   rewrite changes word counts/order, which breaks word timings. Plain
   text only.
2. **AI Edit planning language-token fix** — pass the model's forced token
   instead of `null` in `aiEditTranscribe.ts`. Small, testable, real bug.
3. **Whole-transcript view on /transcribe** — show the full plain text in
   one readable block above the segment list. Direct answer to
   "sab ek saath". Zero model risk.
4. **Whisper small (244M) as an opt-in desktop choice** — RECOMMENDATION
   ONLY, not wired. Verified live via the HF API: `onnx-community/
   whisper-small_timestamped` exists. Download for this pipeline's files:
   desktop WebGPU ~307 MB vs base ~105 MB; phone WASM ~238 MB vs base
   ~73 MB (~3x). Runtime memory ~3x. Phone risk is high (the codebase
   already single-threads phones because tabs get killed). AND stock small
   has **no Hinglish fine-tune**, so for Hinglish it may not beat the base
   fine-tune — the fine-tune's domain advantage can outweigh raw size.
   Cannot be proven to run within reasonable time/memory here (no live
   browser + model run in this VM), so it stays a recommendation.
5. **Initial prompt / hotwords** — NOT available: transformers.js 4.3.0
   ASR options (verified in the installed package types) are
   `return_timestamps`, `chunk_length_s`, `stride_length_s`,
   `force_full_sequences`, `language`, `task`, `num_frames` plus
   generation params. No `initial_prompt`. Nothing to wire.

## 4. Accuracy limits of the current setup (reasoned, not measured)

- Base-size model: the weakest Whisper size that still ships word
  timestamps; code-mixed Hinglish (Roman Hindi + English words in one
  sentence) is its hardest case.
- Roman-script Hindi words are often misheard as English lookalikes;
  proper nouns suffer most.
- No cross-window context: a word at a window edge loses the sentence
  around it.
- No live measurement is possible from this VM (no browser run of the
  model + no owner audio here). Real accuracy numbers need the owner's
  own video after deploy.

## 5. What this branch implements

- (a) Whole-transcript view on /transcribe (full plain text, one block).
- (b) AI Edit planning language-token fix.
- (c) Opt-in correction pass on the /transcribe plain text: new route
  `POST /api/v1/transcribe/correct` (free server text model, strict
  prompt: fix spelling/grammar, keep Roman Hinglish Roman, do not add or
  remove content, return only the corrected text), input-capped and
  rate-limited; UI button on the done phase, original kept, one-tap
  revert. Tests for the prompt builder, chunking, route (mocked cloud
  chat), and the page view.
- (d) Whisper small: recommendation only (see 3.4). Not wired.
