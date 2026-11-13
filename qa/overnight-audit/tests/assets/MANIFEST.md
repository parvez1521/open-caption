# Test assets — manifest

Built 2026-11-14 ~02:10 IST by `build_assets.py` (re-runnable).
Speech source: campaign Hinglish VO segments (`~/workspace/marketing/captionit-15-day-campaign/assets/audio/vo/`,
exact text from `scripts/reel-0*.md`) + `~/workspace/oc-browser-check/speech-test.mp3`.
gTTS was BLOCKED on this VM (translate.google.com unreachable via egress proxy), so no fresh
Hindi/English TTS samples exist. Pure Hindi (Devanagari) speech sample: UNAVAILABLE — end-to-end
Hindi transcription cannot be tested with a known transcript; the Hindi language-choice UI path
can still be checked, and the Hinglish samples cover the Indian-speech path.

Video is a flat dark frame (`#1c1c1a`, the app background) — the tests target audio/transcription,
not picture content.

| File | Size | Speech / reference transcript | Expectation |
|---|---|---|---|
| v01_short_hinglish_720x1280.mp4 | 42 KB, ~3s, 720x1280 | r1s1: "Aapki reel mute pe dekhi ja rahi hai." | Transcribes; captions land on the words. |
| v02_normal_hinglish_1080x1920.mp4 | 149 KB, 12s, 1080x1920 | r1s1+r1s2: "Aapki reel mute pe dekhi ja rahi hai. Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati." | Transcribes; full workflow incl. export. |
| v03_long_hinglish_1280x720.mp4 | 364 KB, 30s, 1280x720 | r1s1–r1s4 + r2s1 + start of r2s2 (trimmed at 30s, may cut mid-sentence): "Aapki reel mute pe dekhi ja rahi hai. ... Step one — clip drop karo. Step two — har word apne time pe aa jaata hai." | Long-file path; timing across windows. |
| v04_english_720x1280.mp4 | 54 KB, 4.3s, 720x1280 | speech-test.mp3: real English speech, 3 words, EXACT TEXT UNVERIFIED | Transcribes English; words must be English, not Hinglish. |
| v05_hinglish_720x1280.mp4 | 110 KB, 8s, 720x1280 | r1s2: "Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati." | Baseline Hinglish accuracy check. |
| v06_music_hinglish_720x1280.mp4 | 103 KB, 8s, 720x1280 | r1s2 + 220 Hz sine tone at low volume | Speech still transcribed; music does not create fake words. |
| v07_silence_720x1280.mp4 | 15 KB, 6s, 720x1280 | Silent audio track | Honest empty result. No hallucinated captions. No crash. |
| v08_noisy_hinglish_720x1280.mp4 | 111 KB, 8s, 720x1280 | r1s2 + white noise at low volume | Speech still transcribed; noise does not create fake words. |
| v09_noaudio_720x1280.mp4 | 9 KB, 6s, 720x1280 | No audio stream at all | Honest handling. No crash. |
| v10_corrupt.mp4 | 17 KB | Valid mp4 truncated to ~40% | Validation error. No crash. No partial silent failure. |
| v11_unsupported.mp4 | 250 B | Plain text renamed .mp4 | Validation error. No crash. |
| v12_zero.mp4 | 0 B | Zero bytes | Validation error. No crash. |
| v13_twoseg_720x1280.mp4 | 94 KB, 8s, 720x1280 | r1s1 + r2s1: "Aapki reel mute pe dekhi ja rahi hai. Ek Reel ke captions, ek minute mein. Dekho kaise." | Two segments back-to-back, SAME synthetic voice — NOT a true multi-speaker test. Speaker-change detection is untestable with this sample. |
| v14_reference_sample-clip.mp4 | 63 KB, 6s, 640x360 | Copy of the repo's earlier browser-check clip (h264 + aac). Content/transcript unknown. | Reference clip only. |

Helper files (not test inputs): `hinglish_12s.mp3`, `hinglish_30s.mp3`, `twovoice.mp3` (concatenated VO used to build v02/v03/v13).
